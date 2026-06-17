# preview/ — Contrato do React Preview Runtime

A 2ª implementação de `@vfp/core` (a 1ª, `decorators.ts`, gera VFP). Renderiza DOM real
no navegador para dev com HMR. **Não depende do VFP.** Ver plano completo em
`~/.claude/plans/velvet-bubbling-orbit.md`.

## Regras invioláveis (todos os agentes)
1. **Edite só os arquivos que te foram designados.** Conjuntos disjuntos → sem conflito.
2. **Props** = as interfaces de `decorators.ts` (raiz do repo). Mesmos nomes/atributos.
   Aceite `props: any` na assinatura, mas respeite os campos documentados lá.
3. **Estilo só por tokens.** Nunca cor literal. Use `token("primary")` → `var(--primary)`
   de `./theme` (ou `theme.ts`). Tokens: primary, onPrimary, success, danger, warning,
   surface, onSurface, border, altRow, muted, bg; fontes `--font`, `--font-title`,
   `--font-body`, `--font-data`; `--radius`. As CSS vars são aplicadas na raiz pelo host.
4. **Eventos são strings** (`onClick="continuar"`). Resolva com `useFormEvent(props.onClick)`
   de `./context` → handler `() => void | undefined`. Ex.: `<button onClick={useFormEvent(props.onClick)}>`.
5. **Layout = flexbox nativo.** `gap`→gap(px), `padding`/`pad`→padding(px),
   `justify`→justify-content (start/center/end/between→space-between/around/evenly),
   `align`→align-items (start/center/end/stretch), `width`/`height`→px,
   `grow`/`flexGrow`→flex-grow, `align`/`alignSelf`. `Column`=column, `Row`=row.
6. Não importe arquivos de outro agente diretamente; componha via `./index` se precisar.
7. TSX puro + React 19. A fábrica `h` (jsx.ts) é injetada pelo Vite — só escreva JSX normal.

## Como os componentes são chamados (fábrica `h`, já pronta em `jsx.ts`)
- Componentes do runtime (os que você escreve) são **FCs**: `(props) => JSX`. Recebem
  `props.children` já como elementos React. Renderize-os.
- Classes do usuário (form, `@Component`) são instanciadas pela `h` e seu `.render()` é
  chamado — você não lida com isso; só garanta que seus FCs renderizem `props.children`.

## Tema light/dark
O host aplica `themeToCss(theme, mode)` (de `theme.ts`) como style na raiz. Você só
referencia `var(--token)`. Não leia o JSON do tema você mesmo.

## Alvo da Fase 1 (o que precisa renderizar bonito)
`showcase/catraca-app/src/forms/*.form.tsx` (4 telas) + `src/components/Brand.tsx`.
Componentes usados lá: Column, Card, Label, Button (flat, variant, icon), Image, Grid
(columns), StatCard, FlatButton, FormManager. Priorize-os. Estética: Win11/Fluent, flat,
cantos `var(--radius)`, espaçamento em grade de 8px (ver rubrica em showcase/report.js).

## Propriedade dos arquivos
- **Agente A:** `preview/runtime/layout.tsx`, `preview/runtime/primitives.tsx`
- **Agente B:** `preview/runtime/kit.tsx`, `preview/runtime/icons.tsx`
- **Agente D:** `preview/host/*`, `preview/vite.config.mjs`, `vfp.js`, scaffold
- **Fundação (não mexer):** `jsx.ts`, `runtime/context.ts`, `runtime/theme.ts`,
  `runtime/forms-shim.ts`, `runtime/index.ts`, `runtime/misc.ts`
