# Totem rodável — app VFP interativo (mocado)

Junta tudo: o front do app React (Totem Alimentação) virou um **app VFP** real.
Duas versões:

## 1) `Cardapio.form.tsx` — INTERATIVO (cada botão tem função)
Sem imagens estáticas — controles VFP de verdade com lógica:
- **[+] / [−]** por produto: mudam a quantidade (estado real no form).
- **Total** recalcula na hora (`q*preço` somados) e aparece em `R$`.
- **[Limpar]** zera o pedido. **[Pagar]** valida, mostra "Processando…", anima a
  barra (`<Timer>`) e aprova com uma senha; depois zera o pedido.
- Estado (`qBurger`, `total`, …) em propriedades do form; `add/sub/refresh/pagar/tick`
  são métodos TS compilados para FoxPro (`This.total = This.qBurger * 25 + …`,
  `This.lblTotal.Caption = "R$ " + TRANSFORM(This.total)`).

Provado em runtime no VFP (`test_cardapio.prg`): 2×Burger+1×Batata → total 65;
−1 Burger → 40; Pagar → "Processando…" → "Pagamento aprovado! Senha A123" → total 0.

Rodar:
```
node foxc.js build showcase/totemapp/Cardapio.form.tsx -o showcase/totemapp/Cardapio.scx
C:\projectos\testesvf\foxcli\foxcli.exe run showcase/totemapp/run_cardapio.prg --timeout 600
#  ou no VFP:  DO FORM showcase\totemapp\Cardapio.scx
```

## 2) `TotemApp.form.tsx` — fluxo visual (telas renderizadas)
Versão "passeio" pelo design completo: o front do app React virou um **app VFP navegável**
que você roda e clica pelo fluxo completo, com **animação no pagamento**. Sem backend
— tudo mocado.

## Fluxo (clique na tela para avançar)
`1 Home → 2 Modo de entrega → 3 Cardápio → 4 Item/Adicionais → 5 Carrinho →
6 Pagamento → 7 Processando (anima sozinho) → 8 Aprovado → (clique volta ao 1)`

## Como roda (tecnicamente)
- **Uma janela** (form `TotemApp`, modal, centrada): um `<Image>` mostra a tela atual.
- **Clique** (`Image.onClick` → `avancar()`): incrementa o passo e troca o `Picture`.
- **Animação** (`<Timer>` → `tick()`): no passo "processando" troca os 4 frames de
  progresso (0→100%) e, no fim, avança sozinho para "aprovado".
- **Estado**: os campos `step`/`frame` da classe viram propriedades do form.
- As telas são PNGs renderizados no Node (`../totem/build_flow.js`) a partir da paleta/
  assets reais do app React.

Tudo isso é TypeScript/TSX compilado pelo FoxTS para um SCX nativo do VFP — `switch`
vira `DO CASE`, `this.tela.picture = ...` vira `This.tela.Picture = ...`, etc.

## Rodar
```
# 1) gerar as telas (uma vez)
npm i @napi-rs/canvas
node showcase/totem/build_flow.js

# 2) compilar o form
node foxc.js build showcase/totemapp/TotemApp.form.tsx -o showcase/totemapp/TotemApp.scx

# 3) abrir e interagir (ate 10 min; feche a janela p/ sair)
C:\projectos\testesvf\foxcli\foxcli.exe run showcase/totemapp/run.prg --timeout 600
#  ou, dentro do VFP:  DO FORM showcase\totemapp\TotemApp.scx
```
> Os PNGs e o SCX são gerados (fora do git). Versionados: `TotemApp.form.tsx`, `run.prg`,
> o renderer e os assets-fonte em `../totem/assets/`.
