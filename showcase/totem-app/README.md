# Totem Alimentação — app completo (FoxTS → VFP)

Front do app React `Pwi_React_TotemAlimentacao` reproduzido como um **totem VFP
moderno e interativo**, num form só. Fluxo completo (mocado, sem backend):

**Home → Modo de entrega → Cardápio (interativo) → Pagamento → Aprovado → Home**

![fluxo](flow_preview.png)

## Como é moderno + interativo
Controles nativos do VFP têm cara datada; aqui o visual vem de **fundos renderizados**
(canvas) e a interação de **controles transparentes por cima** (overlay absoluto):
- `build_screens.js` (`@napi-rs/canvas`) gera `screens/*.png` (cards, gradientes, sombras,
  cantos, texto AA) a partir da paleta/assets reais do app React;
- `Totem.form.tsx` põe um `<Image>` de fundo (trocado por tela) e, por cima, um
  **overlay absoluto** (`<View absolute>` + `left/top`, recurso do FoxTS) com:
  - hotspots transparentes (`<Label transparent onClick>`) sobre cada botão desenhado →
    cada um chama sua função (`escolherComer`, `addBurger`, `irPagamento`, `processar`…);
  - labels transparentes para os números que mudam (quantidade, total, status);
  - barra de progresso (`<Shape>`) animada no pagamento (`<Timer>`).
- Estado real em propriedades do form (`step`, `viagem`, `qBurger…`, `total`); a
  visibilidade dos overlays alterna por tela (`mostrar()` → `ocultarTudo()` + `verX()`).

Tudo é TypeScript/TSX compilado para SCX nativo (sem runtime JS no app).

## Rodar
```
npm i @napi-rs/canvas
node showcase/totem-app/build_screens.js                                   # gera screens/*.png
node foxc.js build showcase/totem-app/Totem.form.tsx -o showcase/totem-app/Totem.scx
C:\projectos\testesvf\foxcli\foxcli.exe run showcase/totem-app/run.prg --timeout 600
#  ou no VFP:  DO FORM showcase\totem-app\Totem.scx
```

## Provado no VFP
`test_flow.prg` percorre o fluxo inteiro (NOSHOW) e confere o estado: transições de
tela 1→2→3→4→5→1, visibilidade por tela, `2×Burger+1×Refri → total 59`, pagamento
processa e aprova, carrinho zera. Veja `flow_preview.png` (telas nas coordenadas reais).

## Arquivos
- `Totem.form.tsx` — o app (form único, todas as telas)
- `build_screens.js` — renderiza os fundos (`screens/`)
- `run.prg` — launcher · `test_flow.prg` — teste de fluxo no VFP
- `assets/` — imagens-fonte (logo, fotos, background) do app React
> `screens/*.png` e `Totem.scx` são gerados (fora do git).
