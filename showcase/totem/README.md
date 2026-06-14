# Totem — front do app React reproduzido em VFP (FoxTS)

Transformação do front-end do app **Pwi_React_TotemAlimentacao** (React + Vite +
Tailwind + styled-components) em telas que rodam no **VFP** via FoxTS — só o front,
sem a lógica/redux/navegação. A paleta, medidas e tipografia vêm direto do
`tailwind.config.js` e dos `styled-components` do projeto original.

## Telas reproduzidas (fluxo do totem)
| # | Tela | Origem React |
|---|---|---|
| 01 | **Home** "Toque para iniciar" (bg + logo + pill) | `pages/homePage` |
| 02 | **Modo de entrega** "Seu pedido é para?" (2 cards) | `pages/escolherModoEntrega` |
| 03 | **Cardápio** (tabs de categoria + grid de produtos + total) | `pages/escolherProdutos` + `ProdutoItem` |
| 04 | **Item / Adicionais** (hero + steppers +/- + total + Adicionar) | `Modals/ModalProdutoItem` |

Paleta (do tailwind): primary `#ed1e26`, secondary `#283593`, bg `#FAFAFA`,
fonte `#070707`, cancel `#ede8e8`. Fontes 16/24/30/48/96px.

## Como funciona a transformação
1. **Render (Node, build-time):** `build_flow.js` (`@napi-rs/canvas`) compõe cada tela
   em PNG — gradientes, cantos arredondados, sombras, fotos e texto anti-aliased, que
   os controles nativos do VFP não fazem. Reaproveita os assets reais do app React
   (`assets/`: logo, fotos, background).
2. **Exibição (VFP):** cada tela é um form FoxTS com um `<Image>` (Picture) — provado
   instanciando NOSHOW no VFP via foxcli (`HomeTotem`, `ModoTotem`, `ProdutosTotem`,
   `ItemTotem`). Também há `totem.form.tsx`, que recompõe a tela 02 com layout
   **nativo** (Column/Row/Label + cards em PNG) em vez de uma imagem cheia.

## Reproduzir
```
npm i @napi-rs/canvas
node showcase/totem/build_flow.js          # gera 01_home..04_item.png + cards
node showcase/totem/build_totem.js         # cards/cancel/preview da tela 02
# exibir no VFP (instancia NOSHOW):
node foxc.js build showcase/totem/ProdutosTotem.form.tsx -o showcase/totem/ProdutosTotem.scx
```

## Dois caminhos (lembrete)
- **Fullscreen Image** (`*Totem.form.tsx`): pixel-perfect ao web, rápido, estático.
- **Composição nativa** (`totem.form.tsx`): layout/labels/botões são controles VFP de
  verdade; só os pedaços "web" (cards arredondados com foto+sombra) viram PNG.

> Os `*.png` gerados não entram no git (regeneráveis pelos scripts); só os assets-fonte
> em `assets/` e os scripts/forms são versionados.
