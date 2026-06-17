'use strict';
// build-icons.js (catraca-app) — SVG (Lucide) -> PNG com alpha, recolorido pelos tokens
// do tema. Dois grupos:
//  (1) ICONES inline a 16px (todas as cores) — p/ <Icon name size={16}>.
//  (2) HEROIS: PNGs grandes dedicados (splash/login/resultado), pois o controle Image
//      do VFP NAO escala PNG alpha — tem que rasterizar no tamanho EXATO de exibicao
//      e usar <Image src width height> casando o tamanho.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

// viewBox 24x24, stroke-based (Lucide/Feather)
const ICONS = {
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  contact: '<path d="M16 18a4 4 0 0 0-8 0"/><circle cx="12" cy="11" r="3"/><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="8" x2="8" y1="2" y2="4"/><line x1="16" x2="16" y1="2" y2="4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  wifi: '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};

// HEROIS: { icone, tamanho px, cor (token), arquivo de saida }
const HEROES = [
  { name: 'shield-check', size: 116, color: 'primary', out: 'hero-brand.png' },
  { name: 'check', size: 104, color: 'success', out: 'hero-ok.png' },
  { name: 'x', size: 104, color: 'danger', out: 'hero-deny.png' },
  { name: 'contact', size: 88, color: 'primary', out: 'hero-badge.png' },
  { name: 'scan', size: 72, color: 'primary', out: 'hero-scan.png' },
];

const theme = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vfp.theme.json'), 'utf8')).colors || {}; }
  catch { return {}; }
})();
const COLORS = {
  '': theme.onSurface || '#0f172a',
  primary: theme.primary || '#2563eb',
  danger: theme.danger || '#dc2626',
  success: theme.success || '#16a34a',
  warning: theme.warning || '#f59e0b',
  muted: theme.muted || '#64748b',
  white: '#ffffff',
  onSurface: theme.onSurface || '#0f172a',
};

const svgFor = (inner, stroke, sw) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ` +
  `stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const raster = (inner, hex, px, sw) =>
  new Resvg(svgFor(inner, hex, sw), { fitTo: { mode: 'width', value: px }, background: 'rgba(0,0,0,0)' }).render().asPng();

let n = 0;
// (1) inline 16px, todas as cores
const RENDER_PX = 16;
for (const [name, inner] of Object.entries(ICONS)) {
  for (const [variant, hex] of Object.entries(COLORS)) {
    if (variant === 'onSurface') continue;
    fs.writeFileSync(path.join(__dirname, variant ? `${name}-${variant}.png` : `${name}.png`), raster(inner, hex, RENDER_PX, 2));
    n++;
  }
}
// (2) herois grandes (stroke mais fino p/ ficar elegante no tamanho grande)
for (const h of HEROES) {
  const inner = ICONS[h.name];
  if (!inner) throw new Error('hero icon desconhecido: ' + h.name);
  fs.writeFileSync(path.join(__dirname, h.out), raster(inner, COLORS[h.color] || COLORS[''], h.size, 1.6));
  n++;
}
console.log(`build-icons (catraca): ${n} PNGs (${Object.keys(ICONS).length} inline x cores + ${HEROES.length} herois) em ${path.relative(process.cwd(), __dirname)}`);
