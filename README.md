# foxts

Transpilador de um **subconjunto tipado de TypeScript** para **Visual FoxPro 9** (PRG).
Compila em **build-time** — o app gerado é FoxPro puro, **sem runtime JS**.

É a camada de *lógica* da visão "React → VFP": você programa em TypeScript e o
`build` transplanta para FoxPro. (A camada de *layout*, JSX → SCX, é o passo
seguinte; esta peça prova que a lógica compila.)

## Como funciona

```
calc.ts ──(foxts: TS Compiler API → AST tipada → lowering)──> calc.prg ──(foxcli/VFP)──> app
```

A tipagem vem do TypeChecker porque o FoxPro gerado para `a + b` depende de
`a`/`b` serem número (soma), string (concat, via `TRANSFORM`) ou data.

**Princípio inegociável (igual ao AssemblyScript → WASM):** o compilador emite
FoxPro só para os nós da AST que conhece. Qualquer outra coisa é **erro de
compilação com linha/coluna** — nunca gera código plausível-mas-errado.

## Uso

```
npm install
node cli.js examples/calc.ts            # imprime o FoxPro transplantado
node cli.js examples/calc.ts -o out.prg # grava o .prg (ANSI)
npm run verify                          # prova ponta a ponta: roda no VFP e compara com o mesmo TS em Node
```

`npm run verify` é um **teste-oráculo**: a mesma fonte `.ts` roda em dois
backends — FoxPro (via foxcli/VFP) e JavaScript (via Node) — e os resultados
têm de bater.

## Subconjunto suportado (v1)

| TypeScript | FoxPro |
|---|---|
| `function f(a: T): R` | `PROCEDURE f(a) … ENDPROC` |
| `let x: number/string/boolean/Date` | `LOCAL x` + tipos nativos |
| `+` (type-directed) | soma, ou concat (`TRANSFORM` no lado não-string) |
| `- * /`, `%` | `- * /`, `MOD(a,b)` |
| `=== !== < <= > >=` | `= / ==`, `!=`, `< <= > >=` |
| `&&` `\|\|` `!` | `AND` `OR` `NOT` |
| `if/else`, `while`, `for`, `++ -- +=` | `IF/ELSE/ENDIF`, `DO WHILE`, laço traduzido |
| `switch/case/default` (+ `break`) | `DO CASE / CASE / OTHERWISE / ENDCASE` (sem fallthrough; cases vazios agrupam com `OR`) |
| `console.log(x)` | `? x` |
| `Math.floor/ceil/abs/max/min/sqrt` | `FLOOR/CEILING/ABS/MAX/MIN/SQRT` |
| `.toUpperCase/.toLowerCase/.trim`, `.length` | `UPPER/LOWER/ALLTRIM`, `LEN` |
| `this.txtIni.value`, `this.Gerar(x)` | `This.txtIni.value`, `This.Gerar(x)` (métodos de form) |
| `let xs: T[] = []`, `xs.push(v)`, `xs.length`, `xs[i]` | `CREATEOBJECT("Collection")`, `xs.Add(v)`, `xs.Count`, `xs.Item(i+1)` |
| `const NOME = <literal>` (topo) | `#DEFINE NOME valor` |
| `dowOf(d)`, `addDays(d,n)`, `today()` | `DOW(d,1)`, `(d + n)`, `DATE()` |

**Rejeitado em v1** (erro de compilação, por design): closures guardadas em
variável, funções de alta ordem, `async`/Promise, imports npm (além de `fox`/`db`),
classes/protótipo dinâmico, desestruturação. Crescer o subconjunto = adicionar
casos guiados por testes-oráculo.

## Cursores e tipos Fox (`fox.ts`)

A abstração central do VFP é o cursor (um DBF tipado). Primitivos TS são lossy
demais para um schema (`string` não tem largura), então a `fox` fornece tipos
"Fox-flavored" que a carregam — e uma `interface` vira o `CREATE CURSOR`:

```ts
import { createCursor, Char, Logical, DateF } from "../fox";
interface Dia { dia: DateF; semana: Char<13>; util: Logical; }   // -> dia D, semana C(13), util L
const cur = createCursor<Dia>("cdias");
cur.append({ dia: d, semana: "Seg", util: true });               // -> INSERT INTO cdias (...) VALUES (...)
cur.goTop(); while (!cur.eof()) { if (cur.field("util")) n = n + 1; cur.skip(); }
```

| TypeScript | FoxPro | Tipo de coluna |
|---|---|---|
| `createCursor<T>("c")` | `CREATE CURSOR c (...)` (schema de `T`) | `Char<N>`→`C(N)`, `Numeric<W,D>`→`N(W,D)` |
| `cur.append({...})` | `INSERT INTO c (...) VALUES (...)` | `Int`→`I`, `Logical`→`L`, `DateF`→`D` |
| `cur.goTop/skip/eof/count/field/use` | `GO TOP IN c`/`SKIP IN c`/`EOF("c")`/`RECCOUNT("c")`/`c.col`/`USE IN c` | |

Os tipos fazem **trabalho duplo**: geram o schema do DBF **e** o TypeChecker valida
cada `append` contra a interface. Prova: `npm run verify:cursor` (cursor no VFP == runtime Node).

## SQL Server (`db.ts`)

Acesso a dados em TypeScript tipado, transpilado para o SQL pass-through nativo do VFP:

```ts
import { sqlConnect } from "../db";
const db = sqlConnect("DRIVER=SQL Server;SERVER=.;DATABASE=vendas;Trusted_Connection=yes");
let r: number = db.exec("SELECT * FROM clientes WHERE uf = ?uf", "clientes");  // ?uf liga à var uf em escopo
db.disconnect();
```

| TypeScript | FoxPro |
|---|---|
| `sqlConnect(cs)` / `sqlConnectDSN(d,u,p)` | `SQLSTRINGCONNECT(cs)` / `SQLCONNECT(d,u,p)` |
| `db.exec(sql, "cur")` / `db.disconnect()` / `db.connected` | `SQLEXEC(db, sql, "cur")` / `SQLDISCONNECT(db)` / `(db > 0)` |

Detecção por **tipo** (`Connection`). Prova: `npm run verify:sql` (asserções + `foxcli compile` real).
Round-trip contra um servidor de verdade precisa de um SQL Server (teste manual).

## Banco de dados — query builder (`from`)

Acesso a dados local em TypeScript fluente, compilado para `SELECT … INTO CURSOR` nativo:

```ts
import { from } from "@vfp/core";
from("CLIENTE").select("nome", "uf").where("ativo", true).where("uf", "SP").orderBy("nome").all("curAtivos");
```

```foxpro
SELECT nome, uf FROM CLIENTE WHERE ativo = .T. AND uf = "SP" ORDER BY nome INTO CURSOR curAtivos READWRITE
```

`where(campo, valor)` (valor type-directed: `.T.`/`"SP"`/número), `whereRaw("expr")`,
`orderBy`, `select`, `all("cursor")`. Prova: `npm run verify:query` roda o filtro num
cursor local no VFP e confere a contagem. (Para SQL Server use `db.ts`: `sqlConnect`/`db.exec`.)

## Classes → `DEFINE CLASS` (`foxts`)

Uma `class` comum (que **não** é form) vira uma classe VFP num `.prg`:

```ts
export class Cliente {
  nome: string = "";
  saldo: number = 0;
  saudacao(): string { return "Ola, " + this.nome; }   // -> RETURN "Ola, " + This.nome
  deposita(v: number): void { this.saldo = this.saldo + v; }
}
```

```
foxts examples/cliente.ts -o dist/cliente.prg
```

```foxpro
DEFINE CLASS Cliente AS Custom
    nome = ""
    saldo = 0
    PROCEDURE saudacao
        RETURN "Ola, " + This.nome
    ENDPROC
    PROCEDURE deposita
        LPARAMETERS v
        This.saldo = This.saldo + v
    ENDPROC
ENDDEFINE
```

Propriedades sem inicializador recebem default por tipo (`string`→`""`, `number`→`0`,
`boolean`→`.F.`, `Date`→`{}`); `extends X` vira `AS X` (senão `AS Custom`). Prova:
`npm run verify:class` instancia a classe no VFP e compara com o mesmo TS em Node.

## Pipeline completo (`foxc build`)

`foxc.js` costura tudo num comando:

```
npm run build:form      # foxc build examples/dias.form.ts -o dist/frmdiasts.scx
```

```
<form.ts> ──(foxts: lógica TS→FoxPro)──> form.json ──(foxcli)──> .scx/.sct
```

Em `examples/dias.form.ts` o layout é um objeto e a **lógica pura** (`NomeDia`,
`ehDiaUtil`) são funções TypeScript tipadas. O `foxc` transpila essas funções,
injeta como métodos do form, gera a IR e chama o `foxcli`. Se o módulo exportar
`cases`, valida cada método transpilado **já dentro do SCX** contra a mesma
função em Node (oráculo) — saída `6/6 métodos batem (lógica TS no SCX == JS)`.

`examples/diascursor.form.ts` vai além: o `Gerar` (cursor + `this.*` + bind da
grade) é **TypeScript inteiro** — só `Init`/`Destroy` ficam como glue FoxPro mínima.
`examples/diaspuro.form.ts` zera as strings FoxPro; `examples/diasclass.form.ts`
é o form como **classe tipada**.

## Form como classe tipada (`examples/diasclass.form.ts`)

```ts
export default class frmDias extends Form {
  caption = "Dias da semana";
  width = 470; height = 430;
  txtIni = new TextBox({ top: 32, left: 16, width: 110 });   // campo tipado
  grdDias = new Grid({ top: 70, left: 16, width: 438, height: 340 });

  Init(): void {
    this.txtIni.value = today();          // ✓ autocomplete: txtIni é TextBox
    this.grdDias.recordSource = "curdias"; // ✓ autocomplete: grdDias é Grid
    this.Gerar();                          // ✓ autocomplete: método da classe
  }
}
```

O transpilador lê a `class`: campos `nome = new Ctrl({...})` viram controles da IR,
campos escalares (`caption`/`width`/`props`) viram props do form, e os métodos são
transpilados (`this.x.y` → `This.x.y`). A tipagem é **real** — um typo no nome de um
controle é erro de compilação (`Property 'txtINIxxx' does not exist... Did you mean 'txtIni'?`).
O modo objeto (`export const form`) continua suportado.

## Form por decorators (`examples/cadcliente.form.ts`)

Terceira forma de autoria, mais declarativa, sobre a **mesma IR**:

```ts
import { Form, Label, TextBox, Button } from "../decorators";

@Form({ caption: "Cadastro de Cliente", width: 600, height: 400 })
export class FrmCliente {
  @Label({ top: 20, left: 20, caption: "Nome:" }) lblNome: string = "";
  @TextBox({ top: 18, left: 90, width: 220 })     txtNome: string = "";

  @Button({ top: 60, left: 90, caption: "Salvar" })
  salvar(): void { /* handler do Click */ }
}
```

`@Form` na classe → props do form; um decorator de controle (`@Label`/`@TextBox`/
`@Button`/…) num **campo** → `ADD OBJECT <campo> AS <classe>`; num **método** → cria
o botão `cmd<Método>` cujo `Click` chama `ThisForm.<método>()`. Métodos **sem**
decorator são lógica pura (transpilada, com oráculo). `foxc build` gera o SCX:
`caption="Cadastro de Cliente" controles=3`.

## Forms em TSX (`render()`) — "React Native para VFP"

Quarta forma de autoria, declarativa com JSX. O `render()` devolve uma árvore de
controles; o **layout é calculado em build-time** (não há React/runtime no VFP):

```tsx
import { Form, Column, Row, Label, TextBox, Button, OpenFormButton } from "@vfp/core";

@Form({ caption: "Clientes", width: 520, height: 360 })
export class ClienteForm {
  render() {
    return (
      <Column gap={10}>
        <Label caption="Nome" />
        <TextBox bind="nome" width={300} />
        <Row gap={8}>
          <Button variant="primary" caption="Salvar" />
          <OpenFormButton variant="success" caption="Pedidos" form={PedidoForm} />
        </Row>
      </Column>
    );
  }
}
```

`foxc build examples/clientes.form.tsx` gera o SCX (`caption="Clientes" controles=4`),
com cada controle posicionado:

| TSX | VFP gerado |
|---|---|
| `<Column gap>/<Row gap>` | `Top/Left` calculados (flex em build-time) |
| `<TextBox bind="nome">` | `ControlSource = "ThisForm.nome"` + propriedade `nome` no form |
| `variant="primary"` / `color="danger"` | `BackColor`/`ForeColor = RGB(...)` (tema) |
| `<OpenFormButton form={PedidoForm}>` | botão com `Click` = `DO FORM PedidoForm` |

**Layout via Yoga (build-time).** O posicionamento vive em `layout.js`, com dois
backends atrás de um `compute(tree)`: `flex` (puro JS, sem deps) e **`yoga`**
(`yoga-layout`, o mesmo do React Native). Suporta `flexDirection/justify/align/gap/
padding/grow` + `width/height` de container — ex.: `<Row width={500} justify="between"
align="center">` distribui e centraliza; `grow={1}` estica. Vira `Top/Left/Width/
Height` absolutos no SCX (`examples/toolbar.form.tsx`). Yoga é default quando
disponível (fallback `flex`; `FOXTS_LAYOUT=flex` ou `vfp.config.json {"layout":"flex"}`).

**Estilo (`class` tipo Tailwind):** `class="w-120 h-30 primary bg-red text-white bold
disabled"` → props VFP (`Width/Height/BackColor/ForeColor/FontBold/Enabled`); `w-/h-`
afetam o layout. Convive com `variant`/`color`/`bind`.

**Componentes próprios (`@Component`)** expandem inline: `<CustomerLookup/>` vira
seus 3 controles (com layout próprio) e `<SaveButton caption={...}/>` substitui as
props (`{this.caption}` → valor do uso). Ver `examples/pedido.form.tsx`.

**`<Container>`/`<Panel>`** vira um controle `container` (painel com borda) com layout
interno próprio (`examples/panel.form.tsx`); os filhos são **realmente aninhados** —
`PARENT = container`, coords relativas, `cnt1.ControlCount` e `thisform.cnt1.txtNome`
funcionam em runtime (aninhamento de N níveis). A chave foi gravar `PARENT` como o
caminho pontilhado a partir do form (`Form.cnt1`), feita pelo `genscx.go`.

**`<PageFrame>`** com `<Page caption="...">` vira um pageframe nativo: as páginas saem
de `PageCount`+`PageN.Caption` e os controles de cada página são filhos reais
(`thisform.pgf1.Page1.txtCliente`). Ver `examples/pageframe.form.tsx`. Prova em runtime:
`node verifycontain.js` (instancia no VFP e confere ControlCount/captions/acesso aninhado).

## CLI de projeto (`vfp`) — estilo Angular/Nest

Para projetos (vários forms/classes), há a CLI `vfp` (`vfp.js`), que estrutura
`src/ -> dist/`:

```
vfp new crm                       # scaffold: src/{forms,components,services,models}
vfp generate form Cliente         # src/forms/cliente.form.tsx  (TSX -> SCX)
vfp generate component Lookup     # src/components/Lookup.tsx    (@Component reutilizável)
vfp generate service ClienteSvc   # src/services/ClienteSvc.ts   (@Injectable -> PRG)
vfp build                         # UI Compiler (forms->SCX) + Logic Compiler (services->PRG)
vfp run                           # executa app.prg (linka serviços + main()/entry) no VFP
vfp pack                          # monta o projeto: .pjx + .exe (via foxcli)
vfp watch / clean
```

Dois compiladores, como manda a arquitetura: o **UI Compiler** (`src/forms/*.tsx` →
`dist/forms/*.scx/.sct`, via TSX→IR→genscx) e o **Logic Compiler** (`src/services|models/*.ts`
→ `dist/.../*.prg`, via DEFINE CLASS). Forms são o artefato dominante (SCX/SCT
nativos, editáveis no VFP); PRG fica para serviços e processamento. O `build` reporta
`N SCX (UI) + M PRG (lógica)`.

**Projeto runnable + EXE.** O `build` gera `dist/app.prg` (bootstrap que linka todos
os PRGs com `SET PROCEDURE` e a pasta de forms com `SET PATH`) — assim DI cross-file
funciona (`new ClienteService()` → `CREATEOBJECT`, resolvido em runtime). `vfp run`
executa o bootstrap; `vfp pack` gera `dist/vfp.json` e chama o foxcli para montar o
`.pjx` e compilar o **`.exe`**. Pipeline completo: **TS/TSX → SCX+PRG → PJX → EXE**.

**Tema do projeto.** `vfp.theme.json` (`{ "colors": { "primary": "#7c3aed" } }`)
sobrescreve a paleta usada por `variant`/`color`/`class`.

`build` compila cada artefato com o foxcli (SCX e PRG são validados pelo VFP de
verdade) e emite `dist/forms/forms.manifest.json` — o grafo de dependências entre
forms (com aviso de ciclo). O scaffold importa de `@vfp/core` (resolvido para os
decorators empacotados, sem instalar nada).

### Navegação entre forms (`FormManager`)

Como um form abre outro — traduzido para os comandos nativos do VFP:

```ts
import { FormManager } from "@vfp/core";

FormManager.open(PedidoForm);                      // -> DO FORM PedidoForm
FormManager.open(PedidoForm, { clienteId: 123 });  // -> DO FORM PedidoForm WITH 123
const ok = FormManager.showModal(PedidoForm);      // -> DO FORM PedidoForm TO ok
this.pedidoForm = FormManager.open(PedidoForm);    // -> DO FORM PedidoForm NAME This.pedidoForm LINKED
```

Também há `router.open(...)` / `this.router.open(...)` (em forms que `extends FoxForm`),
equivalentes. **`@Route("cliente")`** registra a rota → `dist/routes.json` no build. O
form destino recebe parâmetros declarando `Init(clienteId: number)` (vira `LPARAMETERS`
automático). **DI por construtor** em forms/serviços: `constructor(private svc: Svc)` →
`This.svc = CREATEOBJECT("Svc")` no `Init`. Ver `examples/routed.form.tsx`.

O `build` varre os `DO FORM` e monta o manifesto de dependências entre forms.

## Scripts

```
npm run verify          # lógica pura (inclui switch/arrays): FoxPro == JS
npm run verify:cursor   # cursores: cursor no VFP == runtime Node
npm run verify:sql      # SQL Server: pass-through + foxcli compile real
npm run verify:class    # classe -> DEFINE CLASS: instância no VFP == Node
npm run verify:query    # query builder: SELECT INTO CURSOR roda no VFP (golden)
npm run build:form      # TS -> form.json -> SCX (lógica como método, com oráculo)
npm run lint            # sinaliza async/await/Promise/Symbol/generators (file:line:col)
npm test                # runner único: oráculos + build de todo examples/*.form.ts(x)
```

## Próximos passos

- [x] `foxcli form --spec form.json` (Go, `genscx.go`): IR → SCX/SCT.
- [x] **`foxc build`**: orquestrador TS → SCX com verificação-oráculo.
- [x] Cursores tipados (`Cursor<T>` + tipos Fox) e métodos de form (`this.*`).
- [x] Lib de **SQL Server** (`db.ts`): SQL pass-through.
- [x] Arrays tipados → `Collection` do VFP (`[]`/`.push`/`.length`/`xs[i]`), provado no oráculo `verify`.
- [x] `switch` → `DO CASE` e `console.log` → `?`.
- [x] Classe comum → `DEFINE CLASS … AS Custom` (`foxts`), provado em `verify:class`.
- [x] Forms por **decorators** (`@Form`/`@TextBox`/`@Button`) sobre a mesma IR → SCX.
- [x] CLI de projeto `vfp` (`new`/`generate`/`build`/`watch`/`run`/`clean`) + manifesto de deps.
- [x] Navegação entre forms (`FormManager.open/showModal`) → `DO FORM … WITH/NAME/TO`.
- [x] **TSX** (`render()` com JSX → árvore de controles), layout flex em build-time, `bind`, tema `variant/color`.
- [x] Layout via **`yoga-layout`** (`layout.js`, backend opcional): `justify/align/gap/grow` resolvidos em build-time.
- [x] Expansão de `@Component` próprio (`<CustomerLookup/>` → controles + substituição de props).
- [x] **DI por construtor** em classes/serviços (`constructor(private x: Svc)` → `CREATEOBJECT` no `Init`), provado no VFP.
- [x] Utilitários de estilo `class="w-120 primary bg-red bold"` → props VFP.
- [x] DI no `Init` de forms; `router`/`this.router`/`@Route` (routes.json); `LPARAMETERS` automático (`Init(params)`).
- [x] Nomes de controle únicos (B3): dois `<SaveButton/>`/`<CustomerLookup/>` não colidem mais.
- [x] **Query builder local** `from().where().orderBy().all("cur")` → `SELECT … INTO CURSOR` (`verify:query`).
- [x] Linter `npm run lint` (async/await/Promise/Symbol/generators).
- [x] Tema externo `vfp.theme.json` (sobrescreve a paleta).
- [x] **Linking cross-file + projeto runnable**: `new Svc()`→`CREATEOBJECT`, `app.prg` bootstrap, `vfp run`.
- [x] **`vfp pack`**: `vfp.json` → `.pjx` → **`.exe`** (via foxcli). Pipeline TS/TSX → SCX+PRG → PJX → EXE.
- [x] Contenção VFP real: `<Container>/<Panel>` e `<PageFrame>/<Page>` com PARENT pontilhado (genscx). Falta `<Grid>` com colunas reais e catálogo de componentes.
- [ ] `app.prg` com caminhos relativos (portabilidade do EXE); tokens Figma; query `.first()/.count()`/JOIN; menus (MNX).
