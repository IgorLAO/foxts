# Card "web moderno" no VFP — dois caminhos (comparação)

Pergunta: *dá pra atingir o mesmo design moderno web no VFP?* Resposta curta: **sim,
muito perto** — com renderização de pixels (gradiente, cantos arredondados, sombra,
texto anti-aliased). Aqui estão os dois caminhos, ambos **provados no VFP** (o card
vira PNG e é carregado num `<Image>` do form, instanciado NOSHOW via foxcli).

| | GDIPlusX (runtime) | Node @napi-rs/canvas (build-time) |
|---|---|---|
| Onde desenha | dentro do VFP, em runtime | no Node, no `vfp build` |
| Dinâmico / data-driven / anima | ✅ | ❌ (estático) |
| Dependência no app VFP | precisa do GDIPlusX (`system.app`) | nenhuma (só um PNG) |
| Dependência no build | nenhuma | `npm i @napi-rs/canvas` |
| Sombra | aproximada (rounds empilhados) | blur gaussiano real |
| Custo em runtime | desenha a cada Paint/Timer | zero (só exibe a imagem) |
| Arquivo gerado | `out_gdi.png` (~4.5 KB) | `out_node.png` (~16 KB) |

## Reproduzir
```
# A) GDIPlusX em runtime no VFP -> out_gdi.png
foxcli run showcase/moderncard/gdi_card.prg --json --timeout 90

# B) Node em build-time -> out_node.png
npm i @napi-rs/canvas
node showcase/moderncard/build_card.js

# Prova no VFP: form com os dois PNGs em <Image>, instanciado NOSHOW
node foxc.js build showcase/moderncard/cards.form.tsx -o showcase/moderncard/CardsForm.scx
```

## Veredito
- **Visual:** os dois ficam com cara de web (gradiente + canto arredondado + sombra +
  texto AA). O Node tem blur de sombra mais suave; o GDIPlusX desenha igualmente nítido
  e ainda **anima / responde a dados** em runtime.
- **Recomendação:** assets estáticos (cards de KPI, headers, ilustrações) → **Node
  build-time** (mais simples, zero dep no app). Algo que muda em runtime (gráfico de
  dados, medidor animado, hover) → **GDIPlusX**.
- **Teto:** o que NÃO dá pra igualar ao web é blur/glass em tempo real (GPU),
  responsividade fluida e easing de transição pronto. O resto do "flat/material
  moderno" é alcançável.

## Como o FoxTS expõe isso
`<Image src="...">` → `Picture` do controle (PNG com alpha). O passo natural seguinte
é um `<Card gradient shadow rounded>` que o transpilador compila para um dos dois
caminhos (PNG no build, ou método `Render()` GDIPlusX em runtime).
