'use strict';
// build-icons.js — pipeline SVG -> PNG (build-time). Rasteriza um conjunto de ícones
// estilo Lucide (stroke 2, currentColor) em PNG com alpha, recolorido pelos tokens do
// tema, para o controle Image do VFP exibir (VFP não renderiza SVG nativo). Cada ícone
// vira icons/<name>.png (cor padrão = onSurface) + variantes icons/<name>-<token>.png.
//
//   node build-icons.js            # gera todos os PNGs em ./
//
// É o passo que torna possível <Icon name="save"/> e <SaveIcon/> no TSX: o nome casa
// com o arquivo gerado aqui. Trocar o set de ícones = trocar os paths abaixo; trocar a
// paleta = vfp.theme.json. Único dep nativo: @resvg/resvg-js (binário napi pré-buildado).
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

// Paths internos de cada ícone (viewBox 24x24, stroke-based — compatíveis Lucide/Feather).
const ICONS = {
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
};

// Paleta: lê vfp.theme.json do showcase; faltando, usa defaults. As variantes de cor
// casam com a prop `color` de <Icon> (icons/save-primary.png etc.).
const theme = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vfp.theme.json'), 'utf8')).colors || {}; }
  catch { return {}; }
})();
const COLORS = {
  '': theme.onSurface || '#0f172a',          // padrão (sem sufixo) = texto onSurface
  primary: theme.primary || '#4f46e5',
  danger: theme.danger || '#dc2626',
  success: theme.success || '#16a34a',
  warning: theme.warning || '#f59e0b',
  muted: theme.muted || '#64748b',
  white: '#ffffff',
  onSurface: theme.onSurface || '#0f172a',
};

// IMPORTANTE: o controle Image do VFP9 NÃO redimensiona PNG com alpha de forma confiável
// (Stretch isométrico é ignorado p/ PNG 32-bit) — ele desenha no tamanho NATIVO. Por isso
// rasterizamos no tamanho EXATO de exibição (16px), casando com os controles do kit
// (sidebar/botões usam 16; <Icon size> idem). Assim não há overflow/sobreposição no texto.
const RENDER_PX = 16;
const svgFor = (inner, stroke) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ` +
  `stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

let n = 0;
for (const [name, inner] of Object.entries(ICONS)) {
  for (const [variant, hex] of Object.entries(COLORS)) {
    if (variant === 'onSurface') continue; // já coberto pelo padrão ''
    const svg = svgFor(inner, hex);
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: RENDER_PX }, background: 'rgba(0,0,0,0)' }).render().asPng();
    const file = path.join(__dirname, variant ? `${name}-${variant}.png` : `${name}.png`);
    fs.writeFileSync(file, png);
    n++;
  }
}
console.log(`build-icons: ${n} PNGs gerados (${Object.keys(ICONS).length} ícones x ${Object.keys(COLORS).length - 1} cores) em ${path.relative(process.cwd(), __dirname)}`);
