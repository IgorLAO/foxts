# Showcase CRM — projeto FoxTS completo (UI rica + animação)

App **CRM** de ponta a ponta: TS/TSX → SCX + PRG → `app.prg` → `.pjx`/`.exe`.
Exercita quase tudo do framework de uma vez e leva a **customização visual ao limite**
(tema escuro, cards coloridos, tipografia, shapes e **animação por Timer**).

## Como rodar
```
cd showcase/crm
node ../../vfp.js build        # src/ -> dist/ (5 SCX + 5 PRG, menu, rotas, manifesto)
node ../../vfp.js pack         # monta dist/crm.pjx + crm.exe (via foxcli)
node ../../vfp.js run          # roda o app.prg (DO mainMenu + DO FORM Dashboard + READ EVENTS)
```
Build de um form isolado (compila + instancia NOSHOW no VFP p/ validar o design):
```
node ../../foxc.js build src/forms/dashboard.form.tsx -o dist/forms/DashboardForm.scx
node ../../foxc.js build src/forms/splash.form.tsx    -o dist/forms/SplashForm.scx
```

## Estrutura
```
vfp.config.json     srcDir/outDir/main + entry="DashboardForm"
vfp.theme.json      paleta da marca (primary roxo, success, danger, warning)
src/
  main.ts           entrada de lógica (new ClienteService() -> CREATEOBJECT; DI cross-file)
  classes/menu.ts   menu() -> DEFINE MENU (auto-wirado: DO mainMenu no app.prg)
  models/           schema() de validação (Cliente, Pedido com .refine)
  services/         @Injectable + query builder (from().where().all()/.count())
  forms/
    dashboard.form.tsx  PAINEL (entry): tema escuro, cards coloridos, KPIs, status animado
    splash.form.tsx     tela ANIMADA: barra de progresso + cometa via Timer
    clientes.form.tsx   LISTA: <Grid> colunas reais ligado a cursor
    cliente.form.tsx    DETALHE: @Route + bind + @Form({ validate }) -> ThisForm.Validar()
    pedidos.form.tsx    ABAS: <PageFrame>/<Page> + <Grid> de itens
```

## Frentes demonstradas
| Recurso | Onde |
|---|---|
| Tema externo (`vfp.theme.json`) + cores **hex** diretas | todos os forms (`variant`, `color="#7c3aed"`) |
| Layout flex em build-time (`<Column>/<Row>` gap/padding/align) | todos |
| Contenção real (`<Container>` colorido, `<PageFrame>/<Page>`) | dashboard, pedidos |
| `<Grid>` com colunas reais ligado a cursor | clientes, pedidos |
| Navegação (`<OpenFormButton>` → `DO FORM`) + `@Route` → `routes.json` | dashboard, cliente |
| Validação do schema no form (`@Form({ validate })`) | cliente (bind `limite` num → default **0**) |
| DI (`@Injectable` + `new Service()`) + query builder | services, main |
| Menu de barra (`menu()`) auto-wirado no `app.prg` | classes/menu.ts |

## Design levado ao limite (vocabulário de estilo)
Atributos type-safe que viram propriedades VFP nativas (ver `decorators.ts` / `applyStyle`):

| Atributo TSX | Propriedade VFP |
|---|---|
| `color` / `variant` / `textColor` (nome do tema **ou hex** `#1e293b`) | `BackColor` / `ForeColor` (+ `BackStyle=1` automático) |
| `transparent` | `BackStyle=0` (label sobre card/fundo escuro) |
| `bold` / `italic` | `FontBold` / `FontItalic` |
| `fontSize` / `fontName` | `FontSize` / `FontName` |
| `textAlign="center"` | `Alignment` |
| `rounded` (Shape) | `Curvature` (cantos arredondados) |
| `borderColor` / `borderWidth` (Shape/Container) | `BorderColor` / `BorderWidth` |
| `color` num `<Shape>` | `FillColor` + `FillStyle=0` (preenchimento sólido) |
| `class="w-200 t-18 text-center bold italic transparent"` | utilitários → mesmas props |
| `@Form({ props: { BackColor: "RGB(..)" } })` | propriedades cruas do form (fundo escuro) |

## Animação (programação real, sem hack)
`splash.form.tsx` e o status do `dashboard.form.tsx` animam de verdade no VFP:
- `<Timer interval={50} onTimer="tick" />` → o evento `Timer` chama `ThisForm.tick()`.
- O método `tick()` (TypeScript → FoxPro) **muta as propriedades dos controles**:
  `this.bar.width = this.bar.width + 10` → `This.bar.width = This.bar.width + 10`.
- Estado persistente: o campo `phase = 0` da classe vira **propriedade do form**.
- `extends FoxForm` libera o acesso dinâmico `this.<controle>` nos métodos.

Resultado: barra de progresso que enche e reinicia, "cometa" deslizando, ponto de
status que pulsa — tudo escrito em TS, rodando como evento nativo do VFP.
Provado em `verifystyle.js` (IR) + build/instanciação de `examples/anim.form.tsx` no `npm test`.
