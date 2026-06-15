# FoxFood — Totem de autoatendimento (FoxTS → VFP)

Totem de alimentação **refeito com o FoxTS UI Kit**: componentes REAIS (`<Card>`,
`<FlatButton>`, `<Label>`, `<Shape>`) — não mais imagem de fundo renderizada + hotspots
transparentes por cima (a abordagem antiga, frágil). Tudo é TypeScript/TSX compilado para
um `.scx` nativo; o visual (cores/fontes/flat/cantos) vem 100% de `vfp.theme.json`.

**Fluxo:** Home → Modo de entrega → Cardápio (interativo) → Pagamento → Aprovado → Home.

## Arquitetura
- **5 telas = 5 `<Container>` sobrepostos** num `<View absolute>`, alternados por
  visibilidade (`mostrar()` → `ocultarTudo()` + `pX.visible = .T.`).
- **Estado real** em propriedades do form: `step`, `viagem`, `qBurger…`, `total`, `paso`.
- **Botões com função** (`<FlatButton onClick>`): `+/-` por produto, `Limpar`, `Pagar`,
  métodos de pagamento, navegação. Quantidades/total/status atualizam labels nomeados
  (o transpilador resolve o caminho aninhado: `this.lblTotal` → `ThisForm.pCardapio.lblTotal`).
- **Pagamento** anima uma barra de progresso (`<Shape>` + `<Timer>`) e aprova.
- Identidade de food (vermelho), header flat (caption + botão fechar), janela modal.

## Rodar / compilar
```sh
cd showcase/totem-app
# 1) compilar a tela
node ../../foxc.js build Totem.form.tsx -o Totem.scx
# 2) rodar no VFP:  DO FORM Totem.scx     (ou pelo EXE abaixo)

# EXE standalone (dist/FoxFood.exe):
foxcli run build_exe.prg --timeout 300
```

## Provado em VFP real
- **`test_flow.prg`** dirige TODAS as funções (NOSHOW) e confere o estado: navegação
  1→2→3→4→5→1, `2×Burger + 1×Refri → total 59`, `subBurger → 34`, `sub` não fica
  negativo, bloqueio de pagamento com carrinho vazio, 4 ticks → aprovado, carrinho zera.
  **22/22 checks OK.**
- **`cap_totem.prg`** captura as 5 telas reais (PrintWindow + GDI+ → `dist/0N-*.png`).

## Arquivos
- `Totem.form.tsx` — a tela (UI + lógica).
- `vfp.theme.json` — tema (identidade FoxFood).
- `main.prg` — entrada do EXE (abre o form modal).
- `build_exe.prg` — compila o EXE. `test_flow.prg` / `cap_totem.prg` — provas (teste + prints).
- `assets/` — imagens da marca (logos/fotos) p/ uso futuro.
