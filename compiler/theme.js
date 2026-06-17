'use strict';
// theme.js — tokens de cor/tipografia (THEME) + helpers de cor. Extraido do transpile.js
// (modularizacao do monolito). ESTADO COMPARTILHADO: setTheme MUTA o objeto THEME no
// lugar (nunca reatribui), entao quem fizer `const { THEME } = require('./compiler/theme')`
// le as mudancas pela mesma referencia — o transpile.js depende disso (todos os
// `THEME.win11`/`THEME._mode`/... continuam funcionando sem alteracao).

const THEME = {
  primary: '#2563eb', success: '#16a34a', danger: '#dc2626', warning: '#f59e0b',
  white: '#ffffff', black: '#000000', gray: '#6b7280', blue: '#2563eb', red: '#dc2626', green: '#16a34a',
  // tokens semânticos do UI Kit (consumidos por <Card>/<FormField> e por variant/class).
  // Trocar estes (via vfp.theme.json) re-estiliza o app inteiro no próximo build.
  surface: '#ffffff',   // fundo de card/painel
  onSurface: '#0f172a', // texto sobre surface (títulos)
  border: '#e2e8f0',    // borda neutra de card/input
  altRow: '#f1f5f9',    // linha alternada da grade (zebra)
  muted: '#64748b',     // texto secundário (labels de campo)
  onPrimary: '#ffffff', // texto sobre primary
  bg: '#f8fafc',        // fundo do form
};
// fonte default do app (token de tipografia). null = não força (mantém o do VFP).
// Definida por vfp.theme.json: { "font": "Segoe UI" } — o maior ganho visual barato.
THEME.font = null;

// setTheme: mescla cores de um vfp.theme.json do projeto (aceita { primary: "#.." }
// ou { colors: { primary: "#.." } }). Chamado por vfp/foxc antes de transpilar.
// Aceita também { font, mode, light:{...}, dark:{...} }: mescla a base (chaves de
// cor no topo / em `colors`), depois o set do modo ativo (`mode`, default "light").
// Assim um único vfp.theme.json carrega claro E escuro; trocar `mode` re-tematiza.
function setTheme(obj) {
  if (!obj || typeof obj !== 'object') return;
  const merge = (src) => {
    const colors = src && src.colors ? src.colors : src;
    if (colors && typeof colors === 'object') {
      for (const k of Object.keys(colors)) {
        if (k === 'colors' || k === 'light' || k === 'dark' || k === 'mode' || k === 'font') continue;
        if (typeof colors[k] === 'string') THEME[k] = colors[k];
      }
    }
  };
  if (typeof obj.font === 'string') THEME.font = obj.font;
  // tipografia em 3 papéis (como o FLAT: título/conteúdo/dados). font = fallback.
  for (const k of ['fontTitle', 'fontBody', 'fontData']) if (typeof obj[k] === 'string') THEME[k] = obj[k];
  if (typeof obj.win11 === 'boolean') THEME.win11 = obj.win11; // chrome DWM (opt-in)
  if (typeof obj.flat === 'boolean') THEME.flat = obj.flat;   // modo flat (chrome custom)
  merge(obj); // base (cores no topo / em colors)
  const mode = obj.mode === 'dark' ? 'dark' : (obj.mode === 'light' ? 'light' : null);
  THEME._mode = mode || THEME._mode || 'light';
  if (mode && obj[mode]) merge(obj[mode]); // sobrepõe com o set do modo ativo
}

// hexToRGB: "#rrggbb" (ou "#rgb") -> número de cor do VFP (0x00BBGGRR). VFP em
// design-time corrompe cor; por isso emitimos NÚMERO e reaplicamos em runtime.
function hexToRGB(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return ((n >> 16) & 255) + ((n >> 8) & 255) * 256 + (n & 255) * 65536;
}
// themeColor: token do tema OU hex direto -> número de cor do VFP; null se não casar.
function themeColor(name) {
  if (THEME[name]) return hexToRGB(THEME[name]);
  if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(name)) return hexToRGB(name[0] === '#' ? name : '#' + name);
  return null;
}
// shade: deriva um tom mais claro (amt>0) ou escuro (amt<0) de uma cor base — como
// o ALTERARGB do "FLAT". Aceita token ou hex; devolve número VFP. Usado p/ gerar
// estados (hover/zebra/borda) de UMA cor, em vez de hardcodar cada tom.
function shade(nameOrHex, amt) {
  const hex = THEME[nameOrHex] || nameOrHex;
  const h = String(hex).replace('#', '');
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(h)) return null;
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const clamp = (v) => Math.max(0, Math.min(255, v + amt));
  return clamp((n >> 16) & 255) + clamp((n >> 8) & 255) * 256 + clamp(n & 255) * 65536; // número VFP
}

module.exports = { THEME, setTheme, hexToRGB, themeColor, shade };
