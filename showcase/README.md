# Showcase FoxTS — lista com grade + navegação

Demo isolada (não entra no `npm test` nem mistura com `../dist`) para ver o pipeline
TSX → SCX/SCT nativo do VFP de ponta a ponta.

## Arquivos
- `clientes.form.tsx` — **form de lista**: `<Grid>` com colunas reais ligado a um cursor
  + `<OpenFormButton>` que abre o detalhe. Mostra Frentes A (layout), B (grid), C (nav), E (tema).
- `cliente.form.tsx` — **form de detalhe**: binding + `@Form({ validate })` gerando
  `ThisForm.Validar()` direto do schema (Frente F).
- `dist/*.scx` / `dist/*.SCT` — os forms **nativos do VFP** (abrem/editam no próprio VFP).
- `dist/*.ir.json` — a **IR** (form transformado) que o `foxcli` compila no SCX. É o
  melhor lugar para ver "o que o JSX virou": controles, props, e os métodos em FoxPro.

## Como reproduzir
```
node foxc.js build showcase/cliente.form.tsx  -o showcase/dist/cliente.scx
node foxc.js build showcase/clientes.form.tsx -o showcase/dist/clientes.scx
```

## O que cada pedaço do JSX vira
| JSX | Saída no SCX/IR |
|-----|-----------------|
| `<Grid source="curClientes">` | controle `grid`, `RecordSource="curClientes"`, `RecordSourceType=1` |
| `<GridColumn header field width>` | `ColumnCount` + `ColumnN.Width`/`ColumnN.ControlSource` + header no `Init` |
| `Load()` com `createCursor` | `PROCEDURE Load` com `CREATE CURSOR` + `INSERT` (cursor pronto antes da grade vincular) |
| `<OpenFormButton form={ClienteForm}>` | `commandbutton` cujo `Click` = `DO FORM ClienteForm` |
| `<Column gap padding>` / `<Row>` | layout flex resolvido em build-time (Top/Left/Width/Height fixos) |
| `variant="primary"` / `bold` | `BackColor=RGB(...)` / `FontBold=.T.` |
| `@Form({ validate: Cliente })` | `PROCEDURE Validar` lendo `ThisForm.<campo>` (regras do schema) |
