# Showcase — Catraca PCI (modernizado)

Recriação **modernizada** do app VFP9 real `GIT/pci/Pwi_VF9_CatracaPCI` (kiosk de catraca
touch, ~26 telas) usando o **UI Kit do FoxTS**. Objetivo: mostrar o poder do framework —
pegar um app legado e gerar as mesmas telas, em TSX, saindo como **SCX/SCT nativos** com
cara de 2025/26 (Win11/Fluent), sem escrever uma linha de FoxPro de UI.

## Escopo (4 telas do fluxo principal)
| FoxTS (TSX)            | Original (SCX)         | O que é |
|-----------------------|------------------------|---------|
| `SplashPage`          | `pci_inicio`           | abertura / marca |
| `LoginPage`           | `system_logininicio`   | login por crachá |
| `PrincipalPage`       | `system_principal`     | validação de ingresso |
| `ResultPage`          | `system_autorizou`     | acesso liberado |

Fluxo: `SplashPage → LoginPage → PrincipalPage → ResultPage` (via `FormManager.open` + `Release`).

## Estrutura (projeto FoxTS padrao — empacotavel em EXE)
```
vfp.config.json          { srcDir: src, outDir: build, entry: SplashPage }
src/forms/*.form.tsx      as 4 telas (@Form + render())
src/components/Brand.tsx  componente reutilizavel (marca PCI)
icons/build-icons.js      SVG (Lucide) -> PNG (inline 16px + herois grandes)
vfp.theme.json            tema (primary azul) — tine tudo
build.sh                  icones + vfp build (SCX) + previews + report
report.js                 dist/report.html (previews + checklist)
run.prg                   roda o fluxo no VFP a partir de build/forms
```

## Como rodar (visual / dev)
```sh
sh build.sh                                  # icones + vfp build + previews (dist/) + report.html
node ../preview.js src/forms/SplashPage.form.tsx   # render PNG headless avulso (canvas + Yoga)
```

## Como buildar o EXE
```sh
cd showcase/catraca-app          # o `vfp` roda no cwd do projeto
node icons/build-icons.js        # 1. gera os PNGs (so na 1a vez ou se mudar icone/tema)
node ../../vfp.js pack           # 2. vfp build (SCX) + foxcli -> build/catraca-app.exe (+ .pjx + manifest)
cp -r icons build/icons          # 3. icons p/ runtime (o EXE resolve Picture relativo ao cwd)
build/catraca-app.exe            # 4. roda (a partir de build/, com icons/ ao lado)
```
`vfp pack` = `vfp build` (TSX -> `build/forms/*.scx` + `app.prg` + `vfp.json`) seguido do foxcli,
que monta o `.pjx` e compila o `.exe` (com manifest Common-Controls v6 ao lado). Os PNGs nao
entram no EXE (sao recursos de runtime) — por isso o passo 3 deixa `icons/` ao lado do executavel.

## Notas técnicas
- **Sem coordenadas**: layout declarativo (`Column`/`Row`/`Grid columns` + Yoga) → SCX.
- **Ícones herói**: o Image do VFP9 não escala PNG alpha — os ícones grandes são
  rasterizados no tamanho exato e usados via `<Image src width height>`.
- **`preview.js`** precarrega o Yoga (igual ao `foxc`) e respeita `Visible=.F.`, então o
  render headless bate com o SCX real.
