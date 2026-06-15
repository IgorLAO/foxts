# FoxTS — Plano & Estado (para agentes)

> Framework TypeScript/TSX que **gera aplicações Visual FoxPro 9 nativas**. Não é
> "converter JS para Fox": forms saem como **SCX/SCT nativos** (editáveis no VFP),
> PRGs ficam para **lógica/serviços/processamento**. O VFP continua sendo o runtime.
> O foxcli (`C:\projectos\testesvf\foxcli`) é a camada que fala com o VFP.

## Invariantes (não quebrar)
1. **SCX/SCT é gravado pelo VFP**, nunca por Go/JS. Forms > PRGs num projeto.
2. **PRG = lógica.** Nunca usar PRG para construir UI.
3. **Rejeitar, nunca palpitar.** Nó de AST desconhecido = `CompileError` com linha/coluna.
4. **Tudo converge para a IR de form** `{name, caption, width, height, properties, controls[], methods, members[]}` que o `foxcli form --spec` (genscx.go) compila.
5. **Layout é uma função isolada** (`layoutNode` em `transpile.js`) — trocável por Yoga sem tocar no emitter.
6. **Prova por oráculo:** todo recurso roda no VFP real e bate com Node, ou compila SCX e instancia `NOSHOW LINKED`.
7. Encoding ANSII (latin1) em tudo que vai/volta do VFP. Strings de template sem acento.

## Arquitetura (dois compiladores)
- **UI Compiler:** `transpileForm(entry)` (transpile.js) lê uma classe de form (4 modos: objeto `export const form`, classe `extends Form`, `@Form` decorators, **TSX `render()`**) → IR → `foxcli form --spec` → SCX/SCT.
- **Logic Compiler:** `transpile(entry)` → PRG (funções→`PROCEDURE`, classes→`DEFINE CLASS AS Custom`, `@Injectable`→DEFINE CLASS).
- **Orquestradores:** `foxc.js` (1 form → SCX, com oráculo), `vfp.js` (projeto inteiro: `src/ → dist/`).
- **`@vfp/core`** = `decorators.ts` (decorators + `FormManager` + tags JSX + factories). Resolve via `baseUrl/paths` no `loadProgram`.

## 🎨 UI Kit moderno — OBJETIVO ATUAL (melhorar a aparência das telas)

> Meta: telas VFP com cara de 2025/26 (Win11/Fluent), geradas do TSX. Não é só funcional —
> é uma **biblioteca de padrões visuais reutilizáveis** que evolui por iteração visual.

**Loop de trabalho obrigatório** (NÃO basta "compilou"): mexeu na tela → `sh showcase/shot.sh <form>`
(build + print REAL do VFP) → olhar o PNG e criticar (moderno? espaçamento? hierarquia? componente
melhor?) → melhorar → recapturar. Relatório de todas as telas: `node showcase/report.js`.

**Captura real (resolve "não consigo ver o VFP"):** `showcase/capture.prg` abre o SCX, mostra a janela
(`vfp9.exe -T -C<cap.fpw>` com `SCREEN=ON`), força `RedrawWindow` e tira print via **BitBlt da tela**
(GDI+ → PNG). foxcli `run` NÃO serve (força `SCREEN=OFF` → janela preta). `readback.prg`/`diagprops.prg`
= dumps headless (cores aplicadas / properties do SCX).

**🔑 Descoberta crítica:** **cor em DESIGN-TIME no SCX gerado NÃO aplica** no `DO FORM` (carrega
corrompida — só o byte baixo sobrevive); **atribuição em RUNTIME aplica certo**. Por isso:
- `hexToRGB`/`shade` emitem **número de cor do VFP** (não `"RGB()"`).
- `applyRuntimeColors` re-emite TODA cor (form+controles) como atribuição no `Init` (path pontilhado pós-layout).
- `prependInit` injeta no Init **depois** de `LPARAMETERS`. (Implica: "verificados" antigos nunca tiveram cor real.)

**Feito (provado em print real):** tokens (light/dark + `shade()` + 3 fontes Segoe UI); `<Card title>` com
divisória; `<FormField>` (label+input flat `SpecialEffect=1`); `<FlatButton>`/`<FormActions>` (variantes
primary/secondary/ghost/danger coloridas, hover por `shade`, ícone); `<Grid>` zebra+`Themes=.F.`+header
colorido; modo **flat** (header custom + controlbox Marlett + arrastar via `WM_NCLBUTTONDOWN`); chrome Win11
(DWM cantos/dark); manifest Common-Controls v6 no `vfp pack`; `icon="save"`→`icons/*.png`; scaffold `vfp new`
já nasce flat. Showcase: `showcase/ui-kit*.form.tsx`.

**Cantos arredondados (RESOLVIDO):** `Curvature` em Container é **no-op visual**, mas em **Shape arredonda**
(provado: `diagshape`). Então `<Card>` emite um **Shape de fundo** arredondado (surface+borda+Curvature ~22)
e o Container fica transparente por cima segurando os filhos (z-order: shape→container→filhos). Cores do
shape via `applyRuntimeColors`. **Botões arredondados (FEITO):** `flatButtonLeaf` emite um Shape de fundo
(Curvature 8) atrás do Container transparente; o hover recolore o `FillColor`/`BackColor` do **shape** (via
`This.Parent.shp<name>`), não o container. Variantes filled/outline/ghost. Provado no shot VFP real.

**Elevação/sombra de card (FEITO):** `containerLeaf` emite, antes do shape de surface, um **segundo shape**
(mesmo Curvature) deslocado +2/+2 e pintado com `shade('border', -8)` — "vaza" embaixo como sombra suave.
Vale p/ todo `model.bg` (Card e StatCard). Provado no shot VFP real.

**StatCard (FEITO):** `<StatCard label value delta>` — cartão de métrica de dashboard (label muted + valor
grande bold + delta colorido pelo sinal: `+` verde / `-` vermelho). Açúcar sobre Container c/ `bg` (herda
cantos + sombra). Declarado em `@vfp/core` (`decorators.ts`). Demonstrado em `ui-kit-gallery`.

**preview.js fiel (FEITO):** o `preview.js` (canvas, base do `report.html`) estava **cego a cor** desde o
commit "cores em runtime" — `themeColor/hexToRGB/shade` retornam **número** BGR (`0x00BBGGRR`) e o `rgb()`
só lia `"RGB(...)"`. Corrigido: `rgb()` aceita número; e adicionado handler de `shape` (cards/botões/sombra)
e de `combobox`. Agora o report bate com o shot VFP real (e light≠dark de fato).

**Lookup (FEITO):** `<Lookup label bind source display value>` — campo de busca/seleção de registro: combo
FLAT (`Style 2` dropdown list + `IncrementalSearch`) ligado a um cursor/tabela via `RowSourceType 6`. Mostra
`display`, guarda `value` (ou o display) em `bind` (com `value`: 2 colunas, BoundColumn=2, chave oculta).
Mesmo layout do FormField. **Provado em VFP real** (diag: `ListCount=4`, itens do cursor, IncSearch `.T.`).
Decisão do dono: combo nativo tematizado (rápido/robusto) em vez de painel custom — este fica p/ depois.

**App shell + screen pattern (FEITO — top-down, decisão do dono):** salto de "componente" p/ "padrão de
tela". Novos componentes: `<Sidebar>`/`<SidebarItem label active icon onClick>` (navegação lateral full-width,
hover + estado ativo com barra de acento + fundo primary suave — `sidebarItemLeaf`, mesma técnica shape+container
do flatButton); `<SearchBox source field placeholder>` (busca flat com placeholder cinza que limpa no foco;
com source+field emite `SET FILTER` ao vivo por tecla); `<EmptyState message action>` (lista vazia). Tela
`showcase/app.form.tsx` compõe tudo num **master-detail de Clientes**: Sidebar + SearchBox + Grid (`syncDetail`
→ `AfterRowColChange=Refresh`) + Card de detalhe com `<FormField field=.. source=..>` (bind direto a campo de
cursor, segue o registro corrente). **Provado em VFP real, light E dark.** Achados/fixes no caminho:
(a) grade exibia só 1 registro pós-appends (ponteiro no último) → `GO TOP` no Init via `st.post`;
(b) `Value` string em memo de design não é avaliada (vinha com aspas literais) → atribuída em runtime no Init.
Próximo: extrair `<MasterDetail source>` como tag única a partir desta tela (o "refactor" do plano top-down).

**Metodologia visual (FEITO):** (1) `report.js` arquiva cada rodada em `dist/_history/<data>/` (régua
temporal p/ diff de regressão visual); (2) rubrica **"parece profissional?"** embutida no `report.html`
(3º eixo além de "funciona/bonito"); (3) pasta `design-reference/REFERENCES.md` com princípios destilados
de Power BI/Linear/Stripe/Win11 (jogar PNGs reais p/ comparação 1:1). Pendente: comparador automático.

**Dark mode da Grid (FEITO):** a grade saía com **corpo branco** no dark (só zebra colorida, fundo/área
vazia = default branco do VFP; texto preto). Corrigido: `Grid.BackColor = surface` (numérico → reaplicado
no Init por `applyRuntimeColors`) cobre fundo + área vazia; `Column<N>.DynamicForeColor = onSurface`
(expressão → runtime) deixa o texto claro. Inputs/combo já eram escuros (`bg`). `preview.js` passou a ler
`DynamicBackColor` numérico (antes só `"RGB(...)"` → caía no branco). Provado no shot VFP dark real.

**Limitações VFP confirmadas (no print):** header de Grid só colore com `Themes=.F.`; **botão de dropdown do
ComboBox e scrollbars nativas continuam claras no dark** (controles owner-drawn pelo OS — vencer isso exige
owner-draw/Windows API ou WebView2, fica p/ quando valer a pena).

**Backlog UI (ordem decidida pelo dono — inputs antes de chrome, pois é onde o usuário passa 80% do tempo):**
1. inputs/grid acompanharem o tema **dark** (e estado de **foco** dos inputs); 2. `<SearchBox>`; 3. refinar
`<Lookup>` (painel de busca custom, futuro); 4. `<Toolbar>`; 5. `<Dialog>`; 6. `<Sidebar>`/`<EmptyState>`.
Depois: comparador visual automático; minerar `/testesvf` (EXEs) e VFPX por padrões.
(Grid "1 de N linhas" = IGNORAR por ora, decisão do dono.)

## ✅ Feito (com prova no VFP)
- Transpilador base: funções, aritmética type-directed, controle de fluxo, strings, `this.*`, `#DEFINE`.
- **Arrays → Collection** (`[]`/`.push`/`.length`/`xs[i]`). Oráculo `verify`.
- **`switch` → `DO CASE`** (sem fallthrough; cases agrupam com `OR`). `console.log` → `?`.
- **Classe → `DEFINE CLASS AS Custom`**. Oráculo `verify:class` (instancia no VFP).
- Cursores tipados (`Cursor<T>`), SQL Server (`db.ts`). Oráculos `verify:cursor`/`verify:sql`.
- **Forms:** modo objeto, classe tipada, **decorators** (`@Form/@TextBox/@Button`), **TSX `render()`**.
- **TSX:** layout flex em build-time (`<Column>/<Row gap>`), `bind`→`ControlSource`, `variant/color`→cores, `<OpenFormButton>`.
- **`@Component` próprio** expandido inline com substituição de props (`{this.x}`).
- **Navegação:** `FormManager.open/showModal` → `DO FORM … WITH/NAME/TO`. Manifesto de deps + aviso de ciclo.
- **CLI `vfp`:** `new`/`generate (form|component|service|class)`/`build`/`watch`/`run`/`clean`. Build reporta `N SCX + M PRG`.
- **Frente A — Yoga (FEITO):** `layout.js` com backends `flex` (puro JS) e `yoga` (yoga-layout). `<Column/Row/View>` + `justify/align/gap/padding/grow` + `width/height` de container. Default yoga (fallback flex; `FOXTS_LAYOUT=flex` ou `vfp.config.json {"layout":"flex"}`). Carregamento async precarregado em foxc/vfp; cálculo síncrono.
- **Frente C — DI + Router (FEITO):** (1) DI por construtor em classes/serviços (DEFINE CLASS, provado em runtime no VFP) **e em forms** (`This.x = CREATEOBJECT` inserido no `Init`, depois do `LPARAMETERS`). (2) Navegação `router.open/showModal` e `this.router.*` (= `FormManager`) → `DO FORM`. (3) `@Route("nome")` → `ir.route` → `dist/routes.json` no build. (4) `LPARAMETERS` automático: o form destino só declara `Init(clienteId)`. Base opcional `FoxForm` (em `@vfp/core`) habilita `this.router`/`this.caption`. Ex.: `examples/routed.form.tsx`. (5) **`router.open("rota-string")` resolvido em build (FEITO):** `vfp build` faz um pré-passe (`collectRoute`, parser sintático barato) montando o mapa global `@Route → nome do form`, passado ao transpilador (`transpileForm/transpile(entry, { routes })` → `ctx.routes`). `emitFormNav` resolve a string via o mapa → `DO FORM PedidoForm`; sem mapa ou rota inexistente vira `CompileError`. Só vale no `vfp build` (projeto); `foxc build` de um form isolado não tem o mapa. Oráculo `verify:route` (build-time, 4 checks).
- **Frente H1 — linter (FEITO):** `lint.js` (`npm run lint`) sinaliza async/await/Promise/Symbol/generators com file:line:col antes do build (DX; o transpilador já rejeita no build).
- **B3 — dedupe de nomes (FEITO):** `finalizeFormIR` torna nomes de controle únicos (case-insensitive) — dois `<SaveButton/>`/`<CustomerLookup/>` viram `cmdSalvar`/`cmdSalvar2` etc.
- **Frente D — query builder (FEITO):** `from("T").select(...).where(campo, valor).whereRaw(expr).join(t,on).leftJoin(t,on).groupBy(...).having(expr).orderBy(campo)` + terminais `.all("cur")` / `.first("cur")` (= `SELECT TOP 1`) / `.first()` (objeto-linha) / `.count()` (escalar). **Dois terminais-expressão** (capturados, rejeitados inline com erro claro): `.count()` → `SELECT COUNT(*) ... INTO ARRAY tmp; n = tmp[1]`; `.first()` sem cursor → `SELECT TOP 1 ... INTO CURSOR tmp; IF _TALLY>0 SCATTER NAME alvo MEMO ELSE alvo=.NULL.` (acessar `loRow.campo` lê as propriedades). Acesso a propriedade de objeto/instância (`recv.prop`) passa direto p/ receptores não-primitivos (espelha `recv.metodo()`). Provado em runtime no VFP (`verify:query`, **6/6**: filtro composto, count, first("cur"), **first()→objeto**, group/having, join). `reccount(name)` → `RECCOUNT`. **Transações SQL + SQLGETPROP/SQLSETPROP ✅ (FEITO):** `db.begin()/commit()/rollback()` → `SQLEXEC(db, "BEGIN/COMMIT/ROLLBACK TRANSACTION")` (pass-through T-SQL); `db.getProp(p)` → `SQLGETPROP(db, p)`, `db.setProp(p, v)` → `SQLSETPROP(db, p, v)` (modo manual via `setProp("Transactions", 2)`). Espelha o caminho de `db.exec/disconnect` (`lowerSqlMethod`/`isConnection`). Ex.: função `transferir()` em `examples/sql.ts`. Provado em build (`verifysql.js`: asserções estruturais do SQL gerado + `foxcli compile` valida a sintaxe FoxPro — sem servidor SQL vivo). **Guarda var 1-letra ✅** e **default de bind por tipo ✅** (ver dívida abaixo, agora resolvidos). **Frente D fechada.**
- **Runner:** `test.js` agora **auto-descobre** `verify*.js`. `npm test` = **32/32** (16 oráculos + 16 builds de form). Novos: `verifyguard.js` (guarda var 1-letra, build-time **2/2**) e `verifybinddefault.js` (default de bind por tipo, build+VFP **5/5**); `verifysql.js` ampliado com transações/SQLGETPROP.
- **Frente F — validação (FEITO):** schema estilo Zod nos models. `export const Cliente = schema({ nome: str().required().min(3).max(10), uf: str().len(2), email: str().email(), idade: num().min(18).max(120) })` → `PROCEDURE ValidarCliente(toObj)` que devolve `""` (válido) ou a 1ª mensagem de erro. Regras: `str` (`required/min/max/len/email`), `num` (`required/min/max/int`). Uso em form: `MESSAGEBOX(ValidarCliente(loObj))` no `Valid`. **Regras custom `.refine`** ✅: `str()/num().refine(v => <expr booleano>, "mensagem")` — predicado estilo Zod (TRUE = válido); o corpo do arrow é transpilado (reusa `emitExpr`) com o parâmetro substituído pela ref do campo (`ctx.subst`), virando `IF NOT (<cond>) RETURN "mensagem"`. Provado no VFP (`verify:validate`, **7/7**: + `nome_refine` e `idade_refine`). Ex.: `examples/validate.ts`. **i18n** ✅: as mensagens das regras built-in vêm de um catálogo sobreponível (`MESSAGES`, templates `{field}`/`{n}` interpolados em build-time). Default PT; o projeto troca via `vfp.messages.json` (carregado por foxc/vfp, igual ao tema) ou `setMessages({...})`. Só o TEXTO muda — a lógica é fixa; mensagens de `.refine` são explícitas (não traduzidas). Provado no VFP com catálogo EN (`verifyi18n.js`, **5/5**). Frente F **fechada**.
- **Frente F — validação do form direto do schema (FEITO):** `@Form({ validate: Cliente })` (com `const Cliente = schema({...})` no mesmo arquivo) gera o método `ThisForm.Validar()` — as MESMAS checagens do schema, mas lendo `ThisForm.<campo>` (o membro vinculado por `bind="campo"`), autocontido (sem `PROCEDURE` externa para linkar). Devolve `""` ou a 1ª mensagem. Uso: `IF NOT EMPTY(ThisForm.Validar()) ... MESSAGEBOX(ThisForm.Validar())` no Click do Salvar. Refatorei `emitValidator` → `schemaCheckLines(shape, refOf, ...)` reusado pelos dois caminhos (`toObj.x` vs `ThisForm.x`). Provado em runtime: `verifyformvalidate.js` (**4/4**, instancia NOSHOW, seta campos, confere retorno). Ex.: `examples/cadvalida.form.tsx`. **Nota (resolvida):** campo numérico vindo de `bind` agora tem default `0` (não `""`) — o tipo é inferido do schema de `validate` (ver `bindMemberDefault`/`verifybinddefault.js`), então `Validar()` antes de qualquer input compara `0 < n` corretamente.
- **E1 — tema externo (FEITO):** `vfp.theme.json` no projeto (`{ "colors": { "primary": "#.." } }`) → `setTheme` mescla no `THEME`; `variant/color/class` usam a paleta do projeto.
- **Frente G — projeto runnable (FEITO):** `new Svc()` → `CREATEOBJECT`; `obj.metodo()` (instância) suportado; `declare class` ambiente ignorado no PRG. `vfp build` gera `dist/app.prg` (bootstrap: `SET PROCEDURE` de todos os PRGs + `SET PATH` forms + `main()`/`DO FORM entry`). `vfp run` roda o app.prg (serviços resolvem via DI cross-file — provado: `total=42`). **`vfp pack`** gera `dist/vfp.json` e chama o foxcli → **`.pjx` + `.exe`** (provado: `crm.exe`). Pipeline completo TS/TSX → SCX+PRG → PJX → EXE.
- **Frente G — menus VFP (FEITO):** `export const mainMenu = menu([ pad("Arquivo", [ bar("Novo", ClienteForm), separator(), bar("Sair", "CLEAR EVENTS") ]), ... ])` → `PROCEDURE mainMenu` com `DEFINE MENU/PAD/POPUP/BAR` + `ACTIVATE MENU NOWAIT`. Cada `pad` vira um POPUP (`_popN`); cada `bar`, um BAR com `ON SELECTION`. `bar(titulo, acao)`: ação = classe de form → `DO FORM X` (igual ao `<OpenFormButton>`) ou string → comando FoxPro verbatim; `separator()` → `PROMPT "\-"`. Detectado no nível superior (`asMenu`, igual ao `schema`) e emitido por `transpile()`. No app: `DO mainMenu`. Provado em runtime: `verifymenu.js` (**9/9**, monta no VFP e introspecta com `CNTPAD/PRMPAD/CNTBAR/PRMBAR` + checagem da navegação). Ex.: `examples/menu.ts`. **Auto-wire no `vfp build` ✅:** `collectMenus` (pré-passe sintático, igual ao `collectRoute`) acha os `menu()` dos PRGs do projeto; `writeBootstrap` emite `DO <nome>` no `app.prg` — após os `SET PROCEDURE` (linkado) e antes do form/main (ativa a barra). Provado com um `vfp build` real de fixture: `verifymenuwire.js` (**4/4**; 1º teste automatizado da CLI `vfp`). **Limitação:** nomes internos `_padN`/`_popN` são por-menu; dois menus no mesmo projeto colidiriam (1 menu/app é o caso comum).
- **Frente E2 — class utilities (FEITO):** `class="w-120 h-30 primary bg-red text-white bold disabled"` → props VFP (`applyClass`); `w-/h-` afetam o layout.
- **Frente B — contenção VFP real (FEITO):** `<Container>/<Panel>` e `<PageFrame>/<Page>` com aninhamento de verdade no SCX (não só geometria). Chave: `PARENT` = caminho pontilhado a partir do form (`Form.cnt1`, `Form.pgf1.Page1`); páginas vivem no PROPERTIES do pageframe (`PageCount`+`PageN.Caption`). `genscx.go`: `qualifyParent` + ordenação props (membros pontilhados após `Name`). Provado em runtime (`verifycontain.js`, **12/12**). Ex.: `examples/{panel,pageframe}.form.tsx`.
- **Frente B — `<Grid>` com colunas reais (FEITO):** `<Grid source="cursor"><GridColumn header field width/></Grid>` → grid nativo com **colunas reais** (`ColumnCount` + por coluna `ColumnN.Width`/`ColumnN.ControlSource`, props pontilhadas que reusam a ordenação do `genscx`, **sem mudar Go**). `RecordSource`+`RecordSourceType=1` vinculam ao cursor. Os **captions de header** vão para o `Init` (via `st.post`, resolvendo o caminho `ThisForm[.parent].grid` após o layout) porque a vinculação em runtime reescreve `Header1.Caption` pelo nome do campo (descoberto por engenharia reversa). Exemplo self-contained: `Load()` cria/povoa o cursor com `createCursor` (roda antes das colunas vincularem → valida standalone no `foxc build`). Provado em runtime: `verifygrid.js` (**9/9**: nº de colunas, RecordSource, ControlSource/Width por coluna, headers reaplicados, 3 linhas vistas). Ex.: `examples/grid.form.tsx`. `<Grid>` sem filhos continua um grid simples (compat. `ColumnCount:-1`).
- **Runner de testes:** `node test.js` (`npm test`) roda todos os oráculos `verify*.js` + build de todo `examples/*.form.ts(x)`. 30/30.
- Exemplos validados: `examples/{calc.ts, cliente.ts, pedidoservice.ts (DI), cadcliente.form.ts, diasclass.form.ts, nav.form.ts, clientes.form.tsx, pedido.form.tsx (@Component), toolbar.form.tsx (Yoga justify/align/grow)}`.

## 🔜 A fazer (frentes, em ordem de prioridade)
- **A — Yoga:** ✅ FEITO por completo. Inclui agora `<Row wrap>`/`flexWrap` (quebra de linha, requer size fixo) e `alignSelf` por-item (start/center/end/stretch, sobrepõe o `align` do pai). Backend Yoga (`setFlexWrap`/`setAlignSelf`); no fallback `flex` puro são no-ops (como justify/align). Provado em build (`verify:layout`, geometria 4/4). Ex.: `examples/wrap.form.tsx`.
- **B — Biblioteca de componentes:** B3 (nomes únicos) ✅. **Contenção VFP real ✅ (RESOLVIDA):** o bloqueio anterior era a coluna `PARENT` do SCX — o VFP só estabelece contenção em runtime se `PARENT` for o **caminho pontilhado a partir da raiz do form** (`Form.cnt1`, `Form.pgf1.Page1`), não o nome simples do container. Descoberto por engenharia reversa de forms reais (`GIT/iFly/*.SCX`) lidos como tabela. **Lado Go:** `genscx.go` ganhou `qualifyParent` (sobe a cadeia nome→pai montando o caminho FQ) e ordenação de propriedades (não-pontilhadas + `Name` antes; pontilhadas de membro — `PageN.*`/`ColumnN.*` — DEPOIS, senão o `PageCount` recria as páginas e perde o caption). **`<Container>`/`<Panel>` ✅:** filhos com `PARENT=container`, coords relativas, aninhamento N níveis. `cnt1.ControlCount`/`thisform.cnt1.txtNome` funcionam de verdade. **`<PageFrame>`/`<Page caption> ✅`:** pageframe nativo; páginas via `PageCount`+`PageN.Caption` (não são registros); filhos com `PARENT=pgf.PageN`. Provado em runtime: `verifycontain.js` (**12/12**, instancia NOSHOW e confere ControlCount/captions/acesso aninhado). Ex.: `examples/panel.form.tsx`, `examples/pageframe.form.tsx`. **`<Grid>` com colunas reais ✅ (FEITO):** `ColumnCount`+`ColumnN.ControlSource/Width`/`Header1.Caption`, vinculado ao cursor (`verifygrid.js` 9/9; ver linha na seção ✅ Feito). **Resta:** catálogo de componentes corporativos.
- **C — DI + Router:** ✅ FEITO por completo (DI em classes/serviços/forms, `router`/`this.router`, `@Route`→routes.json, `Init(params)` auto-LPARAMETERS, **`router.open("rota-string")` resolvido em build** via mapa global). Nada pendente.
- **D — Logic/dados:** ✅ FEITO por completo. Query builder local (`from().join().where().groupBy().having().orderBy()` + `.all()/.first("cur")/.first()→objeto/.count()`) **+ transações SQL** (`db.begin/commit/rollback`) **+ `SQLGETPROP`/`SQLSETPROP`** (`db.getProp/setProp`). Guarda de var 1-letra a-j (objeto) e default de bind por tipo também resolvidos. Nada pendente.
- **E — Estilo:** ✅ utilitários `class=` + tema externo `vfp.theme.json`. **Vocabulário expandido (FEITO):** cores aceitam **hex direto** (`color="#1e293b"`, `bg-0f172a`, `text-ffffff`), `transparent`→`BackStyle 0`, tipografia `fontSize`/`fontName`/`bold`/`italic`→`Font*`, `textAlign`→`Alignment`, `rounded`→`Curvature` + `borderColor`/`borderWidth` (Shape/Container), cor de fundo aplicada vira **opaca** automaticamente (`BackStyle=1`), `<Shape color>` ganha preenchimento sólido (`FillColor`+`FillStyle=0`), e `@Form({ props:{ BackColor:"RGB(..)" } })` dá fundo escuro ao form. Tudo type-safe (`StyleProps` em decorators.ts) e provado em `verifystyle.js`. **Animação (FEITO):** `<Timer interval onTimer="m">`→ evento `Timer`=`ThisForm.m()`; eventos genéricos `on<Evento>`→método; campo de classe vira **propriedade de estado** do form (TSX); `extends FoxForm` libera `this.<controle>` nos métodos → `tick()` muta props dos controles (barra/cometa/pulso reais no VFP). Ex.: `showcase/crm` (CRM completo, dark theme + cards + animação), `examples/anim.form.tsx`. Resta: tokens Figma.
- **F — Validação:** ✅ FEITO por completo — `schema({...})` → `PROCEDURE Validar<Nome>` (str/num + regras + **`.refine` custom**) **e** `@Form({ validate: Schema })` → método `ThisForm.Validar()`; **mensagens i18n** via catálogo `vfp.messages.json`/`setMessages`. Nada pendente.
- **G — Projeto:** ✅ `.PJX`/`.EXE` (via `vfp pack`), `app.prg` linkável, **Menus** (`menu()`→`DEFINE MENU`, **auto-wirado no `app.prg`**). Resta: **Reports** (FRX) — adiado.
- **H — DX:** `eslint-plugin-foxts`, runner único de testes, Storybook (preview `NOSHOW`), modularizar `transpile.js`.

## ⚠️ A melhorar / 💳 Dívida técnica
- `transpile.js` é monolítico (~1k linhas: parser+ir+jsx+emitter juntos). Modularizar em `compiler/{parser,ir,jsx,emitter}` (H4).
- ~~**Path do foxcli hardcoded**~~ ✅ **RESOLVIDO:** módulo centralizado `foxcli-path.js` com precedência: `FOXCLI` env > `FOXCLI_HOME` env > discovery relativo ao repo (../foxcli/) > fallback `C:\projectos\testesvf\foxcli\foxcli.exe`. Todos os consumidores (`foxc.js`, `vfp.js`, `verify*.js` — incluindo `verify.js` que era bare hardcode sem env override) agora fazem `require('./foxcli-path')`.
- **Oráculo + `@vfp/core`:** `require("@vfp/core")` não resolve em runtime; `foxc.build` tolera (pula oráculo). Forms com `cases` devem importar `"../decorators"`.
- ~~Colisão de nomes de `@Component`~~ ✅ resolvido (B3, dedupe em `finalizeFormIR`).
- ~~Sem linking cross-file~~ ✅ resolvido (G: `app.prg` linka via `SET PROCEDURE`; `vfp pack` → PJX/EXE). ~~**Porém** `app.prg` usa **caminhos absolutos**~~ ✅ **RESOLVIDO:** `app.prg` agora deriva `lcHome = ADDBS(JUSTPATH(SYS(16,1)))` (dir do PRG corrente) + `SET DEFAULT TO (lcHome)` e linka tudo via `lcHome + "rel\path"` — zero caminho da máquina baked no arquivo (portável EXE/PJX). Como o `foxcli run` relocaliza o app.prg p/ um BOOT temporário (SYS(16,1) apontaria p/ o temp), o `vfp run` passa o dir do dist como param `tcHome` (calculado em runtime, não no arquivo) que sobrepõe quando presente.
- **Form com DI não valida standalone** no `foxc build` (a instanciação NOSHOW roda o `Init` → `CREATEOBJECT(serviço)` que não está linkado). Usar `vfp build` (linka tudo). 
- ~~`vfp.js` scaffold grava **caminho absoluto** do vfp.js nos scripts do `package.json`~~ ✅ **RESOLVIDO:** os scripts do scaffold agora chamam o bin `vfp` (na PATH do npm) — `"build": "vfp build"`, `watch`, `run`, `clean`, `create:form`, `create:class` — e o `foxts` entra como `devDependency` (versão lida do `package.json` deste repo). Portável, sem path da máquina.
- ~~Decorator factories tipados como `any` para dual-use~~ ✅ resolvido: viraram `DualTag<Props>` (overload `(cfg?:P)=>Deco` 1º + `(props:P)=>JSX.Element` 2º), com o MESMO `Props` checado nos dois caminhos.
- ~~**Variável de 1 letra `a`–`j` que recebe objeto**~~ ✅ RESOLVIDO (guarda no transpilador): `recv.prop` onde `recv` é um identificador de 1 letra a–j com tipo não-primitivo (objeto) agora é **rejeitado** com `CompileError` (linha/coluna) sugerindo nome ≥2 letras (`loRow`/`loCli`). Vale p/ qualquer `obj.prop` (não só `.first()`). Escalares de 1 letra (contador `i`, `s.length`) NÃO são afetados (tipo primitivo). Oráculo build-time `verifyguard.js` (**2/2**): rejeita objeto, aceita escalar. Ex.: `examples/guard_badvar.ts` (negativo), `examples/guard_okscalar.ts` (positivo).
- ~~**Campo numérico vindo de `bind` tem default `""`**~~ ✅ RESOLVIDO: o default do membro de bind agora é inferido do **tipo declarado do campo** — do schema referenciado em `@Form({ validate: Schema })` (`num`→`0`, `str`→`""`, `bool`→`.F.`) ou de um `type=` no controle (`bindMemberDefault` em transpile.js). Assim `@Form({ validate })` num campo `num()` compara `0 < n` (não `"" < n`) antes de qualquer input. Oráculo `verifybinddefault.js` (**5/5**: 3 defaults na IR em build-time + 2 no VFP — `Validar()` sem input devolve a mensagem e `VARTYPE(idade)=="N"`). Ex.: `examples/cadvalida.form.tsx` (idade `num()`).
- **Tipagens do JSX a arrumar** (DX): ✅ **RESOLVIDO**. **Abordagem escolhida: componentes tipados (`FC<Props>` / `DualTag<Props>`), NÃO `IntrinsicElements` nominal** — porque todas as tags do framework são IMPORTADAS e CAPITALIZADAS, e em TSX tags capitalizadas são checadas pelo VALOR importado, nunca pelo mapa `JSX.IntrinsicElements` (esse rege só tags minúsculas). Cada tag em `decorators.ts` ganhou um `Props` tipado derivado do que o `transpile.js` consome (`bind`/`source`/`field`/`header`/`width`/`gap`/`justify`/`align`/`grow`/`alignSelf`/`variant`/`color`/`class`/...): `BoxProps` (Column/Row/View), `ContainerProps`, `PageFrameProps`/`PageProps`, `GridProps`/`GridColumnProps`, `ControlProps` (Label/TextBox/Button/...), `OpenFormButtonProps` (index sig p/ os params extras do WITH), `SaveButtonProps`. Dual-use preservado via `DualTag<P>` (overload decorator 1º + JSX 2º, mesmo `Props` → typo barrado nos dois). `JSX.IntrinsicElements` esvaziado (typo de TAG minúscula vira erro em vez de `any`) + `ElementChildrenAttribute` p/ `children`. Typos `widht`/`hraeder`/`justfy` agora acusam no editor e no `tsc -p .`.
- **⚠️ Tipo do VALOR dos campos não é enforçado**: ✅ **RESOLVIDO** (camadas onde o tipo do campo é conhecido). (1) **Cursor:** `Char<N>=string`/`Numeric<W,D>=number` já amarravam o valor via `Cursor<T>.append(row:T)`/`.field()` — confirmado: `cur.append({ limite:"x" })` num campo `Numeric` é ERRO de compilação. (2) **Controle `Value` (caminho classe):** `TextBox`/`ComboBox` viraram GENÉRICOS no tipo do valor (`TextBox<DateF>`), com `value:T` sobrepondo o index `[k]:any` só na chave `value` → `txt.value = "x"` num textbox numérico/data é erro. Default `T = string|number|Date|boolean` preserva os usos sem anotação. (3) `str()/num().refine` já dão `v:string`/`v:number`. **Limite conhecido:** o `bind="campo"` (string) não tem como amarrar tipo a um membro do form sem um mapa de membros tipado (mudança arquitetural maior); a enforcement do valor cobre os caminhos onde o tipo é declarado (cursor + control Value).
- ~~`FormManager.showModal/open` capture (`NAME/TO`) não tem teste de runtime end-to-end.~~ ✅ **RESOLVIDO:** `verifynavmodal.js` (**14/14**). Build-time COMPLETO (verifica `DO FORM ... WITH ... TO <var>` para `showModal`, `DO FORM ... NAME This.x LINKED` para `open` capturado, `DO FORM ... WITH param` para open com params e `DO FORM X` sem captura); runtime PARCIAL (compila SCX via foxcli + instancia NOSHOW LINKED + PEMSTATUS dos 4 métodos no VFP). `DO FORM ... TO` em si não é exercitável headless (bloquearia até o form-alvo fechar), mas o código emitido e a compilação são provados. `npm test` **32/32**.
- ~~Teste da CLI `vfp`: só `verifymenuwire.js` (build de fixture + wiring de menu). Falta cobrir `new`/`generate`/`pack`/`run`.~~ ✅ **RESOLVIDO:** `verifyvfpcli.js` (**29/29**). Cobre: `vfp new <proj>` (scaffold: 8 itens — dirs src/*, package.json, tsconfig.json, vfp.config.json, src/main.ts); `vfp generate form/component/service/class` (arquivo criado + conteúdo: @Form, classe, @Injectable); `vfp build` (SCX≥2, app.prg, SET PROCEDURE, main.prg, PRG de serviço, routes.json+conteúdo, forms.manifest.json, contagem no log, vfp.json); `vfp pack` (`.pjx` gerado via foxcli); `vfp run` (executa `main()` e captura `"cli-test-ok"` do stdout). `npm test` **32/32**.

## 🔎 Revisão DX 12/06/2026 — pontos abertos (outros agentes: verificar)
Revisão com foco no fluxo de um dev React típico (abrir no editor, salvar, ver rebuild, tipos no IntelliSense). Suíte conferida APÓS o item 1: `npm test` **30/30**.

1. **[CORRIGIDO — confirmar intenção] `package.json` estava inválido** e quebrava o projeto INTEIRO: linha `"build:form": "` truncada (string não terminada, edição acidental). Não era só `npm run` — **qualquer `node *.js` morria** com `ERR_INVALID_PACKAGE_CONFIG` (o Node lê o package.json mais próximo p/ resolver `type`), inclusive `node test.js`. Restaurei o script a partir do README (linha 160: `foxc build examples/dias.form.ts -o dist/frmdiasts.scx`). Verificar se a intenção da edição era outra.
2. **Sem `tsconfig.json` na raiz do repo** — o build funciona porque `loadProgram` (transpile.js:1192) injeta as opções (jsx Preserve, experimentalDecorators, strict, paths `@vfp/core`→`decorators`) **por código**, mas o editor não as vê: abrir `examples/*.tsx` ou `showcase/*.tsx` no VS Code dá erro em todo JSX/decorator e `Cannot find module '@vfp/core'`; IntelliSense zero. É o 1º contato de qualquer dev com o repo. Fix barato: criar `tsconfig.json` na raiz espelhando as opções do `loadProgram` (include `examples`, `showcase`); idealmente o `loadProgram` passa a LER esse tsconfig (fonte única, sem drift).
3. **`vfp watch` ignora `.tsx`** — vfp.js:316: `if (f && !/\.ts$/.test(f)) return;` não casa `.tsx`, então salvar um `.form.tsx` (o artefato dominante do framework!) **não dispara rebuild**; quebra o loop save→build que o watch existe p/ dar. Fix: `/\.tsx?$/`. Bônus no mesmo lugar: mudanças em `vfp.theme.json`/`vfp.messages.json`/`vfp.config.json` também não disparam rebuild (e estão fora de `src/`); e considerar alias `dev` → `watch` no scaffold (memória muscular de React).
4. **tsconfig do scaffold (`vfp new`) sem `"jsx": "preserve"`** — vfp.js:108 (`tplTsconfig`): o template gera `.form.tsx` mas o tsconfig emitido não habilita JSX → projeto recém-criado já nasce com o form de exemplo vermelho no editor ("Cannot use JSX unless the '--jsx' flag is provided"). Faltam também `include` de `globals.d.ts` (p/ `console.log` tipado) e o `paths` usa **caminho absoluto desta máquina** (mesma família do package.json absoluto já anotado na dívida). — ✅ **RESOLVIDO** (a parte dos caminhos absolutos): o `tplTsconfig` aponta `paths: { '@vfp/core': ['node_modules/foxts/decorators'] }` e `files: ['node_modules/foxts/globals.d.ts']` (casando com o `devDependency foxts` do scaffold); `jsx: 'preserve'` já vinha no template. Portável, sem path da máquina.
5. **Erros de tipo de arquivos importados são engolidos** — transpile.js:1208 filtra `diags.filter(d => d.file === sf)`: um erro de tipagem num model/serviço importado pelo entry **não aparece** (só o arquivo de entrada é checado). Num fluxo TS isso surpreende: o dev confia que "compilou = tipos ok" cross-file. Decidir: reportar diagnósticos de todos os arquivos do projeto (exceto `node_modules`/`decorators.ts`) ou documentar a limitação.
6. **`foxc.js` não trata `.tsx` ao derivar nomes** — foxc.js:72: `path.basename(tsPath, '.ts')` não remove `.tsx` → IR vai p/ `dist/grid.form.tsx.json` (e o `.replace(/\.form$/...)` não pega). Cosmético, mas confunde quem inspeciona `dist/` (o README do showcase aponta a IR como "o melhor lugar para ver o que o JSX virou").
7. **Repo sem git** — o diretório não é repositório (há `.gitignore`, mas nunca houve `git init`). Sem histórico, diff, branch ou bisect — o acidente do item 1 não teria diagnóstico via `git diff` nem rollback. Sugestão: `git init` + commit inicial (o `.gitignore` já cobre `node_modules/` e `dist/`).
8. **Watch sem build incremental** (melhoria, não bug) — qualquer save rebuilda o projeto inteiro (vfp.js:311 `safe()` → `cmdBuild`), e cada form é uma ida ao foxcli/VFP. Em projeto pequeno ok; com N forms a latência do loop save→feedback cresce linear. Caminho: rebuildar só o arquivo alterado (forms são independentes; o mapa de rotas/menus é o único estado global e o pré-passe é barato) + não derrubar o watch em erro (já ok).
9. **`vfp build` não remove artefatos órfãos** — deletar/renomear um form em `src/` deixa o SCX antigo em `dist/` (e no manifesto seguinte ele some, mas o arquivo fica; um `DO FORM` antigo ainda o acharia via `SET PATH`). Dev React espera dist espelhar src. Mitigação atual: `vfp clean` manual; melhoria: limpar `dist/forms` dos SCX sem fonte correspondente no início do build.

Conferidos e **descartados** (não são problemas): `npm run create:form Cliente` passa o argumento sem `--` no npm atual (testado); `lint.js` tolera `src/` inexistente por design (lint.js:178).


```
node cli.js examples/calc.ts            # transpila para PRG (stdout)
npm run verify | verify:cursor | verify:sql | verify:class   # oráculos (VFP real)
node foxc.js build examples/clientes.form.tsx -o dist/clientes.scx   # 1 form -> SCX
node vfp.js new <proj> ; vfp build      # projeto inteiro
```
`FOXCLI_DEBUG=1` preserva o workdir do VFP. `FOXCLI=<path>` aponta o foxcli.exe.
