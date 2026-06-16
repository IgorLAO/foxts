# react-app — Showcase do "modelo React" do FoxTS

Showcase que valida se o FoxTS oferece uma DX próxima ao **React moderno**, gerando
**forms VFP9 nativos (SCX)** a partir de TSX — escondendo o Visual FoxPro atrás de
componentes reutilizáveis e composição declarativa.

## O que isto prova
- **Componentização** estilo React: componentes de usuário (`@Component`) em `components/`.
- **Props tipadas** (TS): `title`, `subtitle`, `navDashboard`… checadas no editor e no build.
- **Children / composição** via `<Slot/>`: `<PanelCard><FormField/></PanelCard>` — os
  filhos do uso fluem para dentro do componente (inclusive **cross-file**).
- **Compound components**: `<Card.Header>` / `<Card.Body>` / `<Card.Footer>`.
- **Layout declarativo** sem coordenadas: `<Grid columns={3}>`, flex (`<Row>/<Column>`).
- **Sistema de ícones SVG** estilo lucide-react: `<Icon name="save"/>` e `<SaveIcon/>`
  (SVG do Lucide rasterizado p/ PNG no build, exibido com alpha no controle Image).
- **Reuso entre páginas**: `AppLayout`/`PageHeader`/`PanelCard` em Dashboard **e** Clientes.
- **Estrutura de projeto web**: `components/ layouts/ pages/ icons/`.

## Estrutura
```
react-app/
  components/   Navbar, PageHeader, PanelCard      (componentes de usuário, @Component)
  layouts/      AppLayout (Sidebar + Navbar + <Slot/>)
  pages/        DashboardPage.form.tsx, ClientesPage.form.tsx  (entradas @Form)
  icons/        build-icons.js (SVG Lucide -> PNG) + *.png gerados
  vfp.theme.json  tema (cores/fontes) — re-estiliza tudo no próximo build
  build.sh      icones + paginas -> dist/  (foxc lê o tema do cwd)
  capture.prg   abre cada SCX e captura a tela REAL (PrintWindow+GDI+ -> dist/NN-*.png)
  report.js     monta dist/report.html com os screenshots
```

## Navegação entre páginas
A sidebar navega de verdade: clicar em "Dashboard"/"Clientes" chama `irDashboard`/`irClientes`
que fazem `FormManager.open(OutraPagina)` (-> `DO FORM OutraPagina`) + `This.Release()`. Cada
página tem `DataSession: 2` (cursor isolado por form, sem colisão ao coexistirem). **Rode pelo
`run.prg`** (faz `SET PATH TO dist` p/ o `DO FORM <Nome>` achar o `.scx`):
```sh
# no VFP:  DO "showcase/react-app/run.prg"
```

## Rodar
```sh
cd showcase/react-app
sh build.sh                              # icones (SVG->PNG) + TSX -> dist/*.scx (+ dist/icons)
# capturar telas reais do VFP (precisa de SCREEN=ON; foxcli run forca SCREEN=OFF -> preto):
printf 'SCREEN=ON\nRESOURCE=OFF\nTALK=OFF\nCOMMAND=DO "%s\\capture.prg"\n' "$(pwd -W)" > dist/cap.fpw
"/c/Program Files (x86)/Microsoft Visual FoxPro 9/vfp9.exe" -T -C"$(pwd -W)\dist\cap.fpw"
node report.js                           # dist/report.html
```

## Provado em VFP real
`dist/01-dashboard.png` e `dist/02-clientes.png` — capturas reais do VFP9 (não preview de
canvas). Oráculos de build em `../../verify{children,compound,icons}.js` (`npm test`).

## Nota de plataforma (achado)
O controle **Image do VFP9 não redimensiona PNG com alpha de forma confiável** (Stretch
isométrico é ignorado p/ PNG 32-bit) — ele desenha no tamanho NATIVO. Por isso os ícones
são rasterizados **no tamanho exato de exibição (16px)**, casando com os controles do kit
(sidebar/botões/`<Icon size>`); assim não há overflow sobre o texto. Para ícones maiores,
rasterizar num tamanho maior e usar controles do mesmo tamanho.
