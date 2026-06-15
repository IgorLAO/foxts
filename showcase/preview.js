'use strict';
// preview.js — render PNG de um form foxts a partir da IR REAL (não é mockup à mão).
// Transpila o .tsx, resolve coords absolutas (anda na cadeia de PARENT) e pinta cada
// controle pelas props que o transpilador gerou (BackColor/ForeColor/Curvature/borda/
// caption/Picture). É uma prova visual fiel do SCX. Uso: node preview.js <form.tsx>
//   (rode de dentro de showcase/, p/ icons/ e vfp.theme.json resolverem)
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const t = require('../transpile');

const args = process.argv.slice(2).filter((a) => a !== '--dark');
const dark = process.argv.includes('--dark');
const entry = args[0] || 'ui-kit-gallery.form.tsx';
if (fs.existsSync('vfp.theme.json')) {
  const th = JSON.parse(fs.readFileSync('vfp.theme.json', 'utf8'));
  if (dark) th.mode = 'dark';
  t.setTheme(th);
}

const ir = t.transpileForm(entry);
const W = ir.width || 480, H = ir.height || 360;

// ---- helpers ----------------------------------------------------------------
const rgb = (v) => { // cor VFP -> css. Aceita NÚMERO BGR (0x00BBGGRR, como themeColor/
  // hexToRGB/shade emitem) OU a string "RGB(r,g,b)". Sem isso o preview fica cego às
  // cores reais (que viraram número no commit "cores em runtime").
  if (typeof v === 'number') return `rgb(${v & 255},${(v >> 8) & 255},${(v >> 16) & 255})`;
  const m = /RGB\((\d+),\s*(\d+),\s*(\d+)\)/i.exec(String(v || ''));
  return m ? `rgb(${m[1]},${m[2]},${m[3]})` : null;
};
const unq = (s) => String(s == null ? '' : s).replace(/^"|"$|^\[|\]$/g, '');
const num = (v) => (typeof v === 'number' ? v : parseFloat(v)) || 0;

// mapa nome->controle e coords absolutas (filhos guardam coord relativa ao pai)
const byName = {};
for (const c of ir.controls) byName[(c.name || '').toLowerCase()] = c;
function abs(c) {
  let x = c.left || 0, y = c.top || 0, p = c.parent && byName[c.parent.toLowerCase()];
  while (p) { x += p.left || 0; y += p.top || 0; p = p.parent && byName[p.parent.toLowerCase()]; }
  return { x, y };
}
const lum = (s) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(s || ''); return m ? (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255 : 1; };
const shadePx = (s, d) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(s || ''); if (!m) return s; const cl = (v) => Math.max(0, Math.min(255, +v + d)); return `rgb(${cl(m[1])},${cl(m[2])},${cl(m[3])})`; };
function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// cabeçalhos reais da grade: lidos das atribuições no Init (Column<N>.Header1.Caption)
function gridHeaders() {
  const out = {};
  const re = /\.(grd\w*|grid\w*)\.Column(\d+)\.Header1\.Caption = "([^"]*)"/gi;
  let m; const init = ir.methods && ir.methods.Init || '';
  while ((m = re.exec(init))) out[m[2]] = m[3];
  return out;
}

// ---- render -----------------------------------------------------------------
(async () => {
  const cv = createCanvas(W, H), c = cv.getContext('2d');
  // fundo do form
  c.fillStyle = rgb(ir.properties && ir.properties.BackColor) || '#f8fafc';
  c.fillRect(0, 0, W, H);
  const headers = gridHeaders();

  for (const ctrl of ir.controls) {
    const p = ctrl.properties || {};
    const { x, y } = abs(ctrl);
    const w = ctrl.width || 0, h = ctrl.height || 0;
    const back = rgb(p.BackColor);
    const filled = p.BackStyle === 1 || (back && p.BackStyle !== 0);
    const rad = num(p.Curvature) > 0 ? Math.min(num(p.Curvature), w / 2, h / 2) : 0;

    if (ctrl.type === 'shape') {
      // shape arredondado: fundo de card/botão + sombra de elevação. Preenche com
      // FillColor (FillStyle 0 = sólido); borda por BorderWidth/BorderColor. Curvature
      // = raio. É o que dá cantos suaves de verdade (Container.Curvature é no-op no VFP).
      const fill = rgb(p.FillColor) || back;
      if (fill && p.FillStyle === 0 && (p.BackStyle === 1 || p.FillColor != null)) { c.fillStyle = fill; rrect(c, x, y, w, h, rad); c.fill(); }
      if (num(p.BorderWidth) > 0) { c.strokeStyle = rgb(p.BorderColor) || 'rgba(148,163,184,0.4)'; c.lineWidth = num(p.BorderWidth); rrect(c, x + 0.5, y + 0.5, w - 1, h - 1, rad); c.stroke(); }
    } else if (ctrl.type === 'container') {
      if (filled && back) { c.fillStyle = back; rrect(c, x, y, w, h, rad); c.fill(); }
      if (num(p.BorderWidth) > 0) { c.strokeStyle = rgb(p.BorderColor) || '#e2e8f0'; c.lineWidth = 1; rrect(c, x + 0.5, y + 0.5, w - 1, h - 1, rad); c.stroke(); }
    } else if (ctrl.type === 'textbox') {
      c.fillStyle = rgb(p.BackColor) || '#ffffff'; rrect(c, x, y, w, h, 3); c.fill(); // cor real do token
      c.strokeStyle = 'rgba(148,163,184,0.55)'; c.lineWidth = 1; rrect(c, x + 0.5, y + 0.5, w - 1, h - 1, 3); c.stroke();
    } else if (ctrl.type === 'grid') {
      // moldura + header + 4 linhas zebra; cores REAIS extraídas do DynamicBackColor
      const cols = []; let i = 1;
      while (p[`Column${i}.Width`] != null) { cols.push({ w: num(p[`Column${i}.Width`]), h: headers[i] || '' }); i++; }
      const zz = [...String(p['Column1.DynamicBackColor'] || '').matchAll(/RGB\((\d+),\s*(\d+),\s*(\d+)\)/gi)].map((m) => `rgb(${m[1]},${m[2]},${m[3]})`);
      const altRow = zz[0] || '#f1f5f9', surface = zz[1] || '#ffffff'; // IIF(MOD=0, altRow, surface)
      const headBg = shadePx(surface, -10), txt = lum(surface) < 0.5 ? '#e2e8f0' : '#0f172a';
      const hH = 22, rH = 22;
      c.fillStyle = surface; c.fillRect(x, y, w, h); c.strokeStyle = 'rgba(148,163,184,0.4)'; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      c.fillStyle = headBg; c.fillRect(x, y, w, hH); // header
      for (let r = 0; r < Math.min(4, Math.floor((h - hH) / rH)); r++) {
        c.fillStyle = r % 2 === 0 ? surface : altRow; // RECNO ímpar=surface, par=altRow
        c.fillRect(x + 1, y + hH + r * rH, w - 2, rH);
      }
      let cx = x; c.textBaseline = 'middle'; c.textAlign = 'left';
      for (const col of cols) {
        c.fillStyle = txt; c.font = 'bold 12px "Segoe UI"'; c.fillText(col.h, cx + 8, y + hH / 2 + 1);
        cx += col.w; c.strokeStyle = 'rgba(148,163,184,0.25)'; c.beginPath(); c.moveTo(cx, y); c.lineTo(cx, y + h); c.stroke();
      }
    } else if (ctrl.type === 'image') {
      try { const img = await loadImage(unq(p.Picture)); c.drawImage(img, x, y, w, h); } catch (_e) {}
    } else if (ctrl.type === 'label') {
      if (filled && back) { c.fillStyle = back; c.fillRect(x, y, w, h); }
      const cap = ctrl.caption != null ? ctrl.caption : '';
      const isMarlett = /Marlett/i.test(unq(p.FontName));
      const fg = rgb(p.ForeColor) || '#0f172a';
      if (isMarlett) { drawGlyph(c, cap, x, y, w, h, fg); continue; }
      const sz = num(p.FontSize) || 9;
      const fname = unq(p.FontName) || 'Segoe UI';
      c.font = `${p.FontBold === '.T.' ? 'bold ' : ''}${Math.round(sz * 1.33)}px "${fname}"`;
      c.fillStyle = fg; c.textBaseline = 'middle';
      const al = p.Alignment; c.textAlign = al === 2 ? 'center' : al === 1 ? 'right' : 'left';
      const tx = al === 2 ? x + w / 2 : al === 1 ? x + w - 2 : x;
      c.fillText(cap, tx, y + h / 2 + 1);
    }
  }
  const out = path.join('dist', path.basename(entry).replace(/\.form\.tsx$/, '') + (dark ? '-dark' : '') + '.png');
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync(out, cv.toBuffer('image/png'));
  console.log('preview ->', out, `(${W}x${H})`);
})();

// glifos do controlbox (Marlett não renderiza como símbolo no canvas): desenha à mão
function drawGlyph(c, ch, x, y, w, h, color) {
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 1.5;
  const cx = x + w / 2, cy = y + h / 2;
  if (ch === '0') { c.beginPath(); c.moveTo(cx - 6, cy + 4); c.lineTo(cx + 6, cy + 4); c.stroke(); } // min
  else if (ch === '1') { c.strokeRect(cx - 6, cy - 5, 12, 11); } // max
  else if (ch === 'r') { c.beginPath(); c.moveTo(cx - 5, cy - 5); c.lineTo(cx + 5, cy + 5); c.moveTo(cx + 5, cy - 5); c.lineTo(cx - 5, cy + 5); c.stroke(); } // close
}
