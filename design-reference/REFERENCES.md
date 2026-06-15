# Design Reference — benchmark visual do FoxTS UI Kit

Toda tela nova deve ser comparada contra apps de referência antes de ser dada como
"pronta". Como não dá para versionar screenshots de apps proprietários neste repo,
aqui ficam **os princípios destiláveis** de cada um. Jogue PNGs reais nesta pasta
(`powerbi-dashboard.png`, `linear-list.png`, …) quando puder, para comparação 1:1.

O `showcase/report.js` embute esta rubrica no `report.html` (seção "Parece profissional?").

---

## Princípios por referência

### Power BI / Azure Portal — densidade de dados
- Cards de métrica (KPI) com **valor gigante** + label pequeno muted + delta colorido.
- Cor só para sinal (verde sobe / vermelho cai); resto neutro. → nosso `<StatCard>`.
- Grids densas mas legíveis: header destacado, zebra sutil, sem cromo 3D.

### Linear — hierarquia e calma
- Espaçamento generoso num **grid de 8px**; nada colado.
- Tipografia em poucos tamanhos, muito peso para hierarquia (não cor).
- Neutros frios (slate); 1 cor primária. Estados de hover sutis, sempre presentes.

### Stripe Dashboard — clareza de formulário
- Labels pequenos muted **acima** do campo (não ao lado). → nosso `<FormField>`/`<Lookup>`.
- Campos flat com borda fina; foco com realce claro.
- Ações primárias coloridas e à direita; secundárias neutras. → `<FormActions>`.

### Notion / Windows 11 (Settings, Widgets) — superfícies
- Cards "surface" com cantos arredondados (raio ~8–12) e **elevação suave** (sombra baixa).
- Divisória fina sob títulos de seção. → nosso `<Card title>`.
- Dark mode real: superfícies escuras distintas do fundo, texto alto-contraste.

### GitHub Desktop / Discord / Figma — chrome e navegação
- Header/Toolbar enxutos; ícones consistentes (mesmo grid, mesmo peso).
- Sidebar com itens densos, item ativo destacado por fundo (não só texto).
- (Backlog FoxTS: `<Toolbar>`, `<Sidebar>`, `<Dialog>`.)

---

## Rubrica "parece profissional?" (a mesma do report.html)

1. Espaçamento num grid de 8px (gaps/paddings múltiplos de 4–8).
2. Hierarquia tipográfica clara (título ≠ corpo ≠ dado).
3. Contraste de texto adequado em light E dark (WCAG AA ~4.5:1).
4. Cor com parcimônia (1 primária + neutros; cor = estado/ação).
5. Densidade equilibrada (nem aperto, nem deserto).
6. Estados visíveis (hover/foco/disabled), não só repouso.
7. Cantos e elevação coerentes entre cards/botões/inputs.
8. Alinhamento em grade (labels/campos/ações em colunas/linhas).

---

## Lacunas conhecidas vs. referências (atacar nesta ordem)

- [ ] Dark mode: inputs/grid ainda claros (não acompanham `surface` escuro).
- [ ] Estado de **foco** dos inputs (Stripe/Linear realçam; hoje sem realce).
- [ ] `<SearchBox>` e refinar `<Lookup>` (painel custom no futuro).
- [ ] `<Toolbar>` / `<Sidebar>` / `<Dialog>` (chrome de navegação).
