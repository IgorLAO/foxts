'use strict';
// verifystyle.js — Frente E (estilo) + animacao. Prova BUILD-TIME (IR) que o
// vocabulario de design e a animacao por Timer sao emitidos corretamente a partir
// do TSX (examples/anim.form.tsx). Os atributos viram propriedades VFP nativas:
//   fundo do form (@Form props BackColor), Shape com cor solida (FillColor+FillStyle)
//   + cantos (Curvature) + borda (BorderColor/BorderWidth), tipografia (FontSize/
//   FontName/FontBold/Alignment), estado (campo -> propriedade) e o Timer (Interval +
//   evento Timer -> ThisForm.tick()) que anima mutando a largura do Shape.
// (O build/instanciacao no VFP e coberto por test.js ao buildar examples/anim.form.tsx.)

const path = require('path');
const layout = require('./layout');
const { transpileForm } = require('./transpile');

const ir = transpileForm(path.resolve('examples/anim.form.tsx'));
const byName = {};
for (const c of ir.controls) byName[c.name] = c;

const checks = [];
function check(label, fn) {
  let ok = false, info = '';
  try { info = fn() || ''; ok = true; } catch (e) { ok = false; info = e.message; }
  checks.push({ label, ok, info });
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

check('fundo escuro do form (@Form props BackColor)', () => {
  must(ir.properties && ir.properties.BackColor === 'RGB(15, 23, 42)', 'BackColor do form ausente: ' + JSON.stringify(ir.properties));
  return 'BackColor = RGB(15, 23, 42)';
});

check('estado phase vira propriedade do form (default 0)', () => {
  const m = (ir.members || []).find((x) => x.name === 'phase');
  must(m, 'membro phase ausente');
  must(m.default === '0', 'default de phase != 0: ' + m.default);
  return 'phase property default 0';
});

check('tipografia da label (FontSize/FontName/FontBold/Alignment/ForeColor)', () => {
  const lbl = ir.controls.find((c) => c.type === 'label');
  must(lbl && lbl.properties, 'label sem properties');
  const p = lbl.properties;
  must(p.FontSize === 18, 'FontSize != 18: ' + p.FontSize);
  must(p.FontName === '"Segoe UI"', 'FontName != "Segoe UI": ' + p.FontName);
  must(p.FontBold === '.T.', 'FontBold ausente');
  must(p.Alignment === 2, 'Alignment (center=2) ausente: ' + p.Alignment);
  must(p.ForeColor === 'RGB(226, 232, 240)', 'ForeColor (textColor hex) errado: ' + p.ForeColor);
  must(p.BackStyle === 0, 'transparent deveria dar BackStyle 0: ' + p.BackStyle);
  return 'FontSize 18, Segoe UI, bold, center, #e2e8f0, transparente';
});

check('shape "bar" preenchido + arredondado (FillColor/FillStyle/Curvature)', () => {
  const p = byName.bar && byName.bar.properties;
  must(p, 'bar sem properties');
  must(p.FillColor === 'RGB(124, 58, 237)' && p.FillStyle === 0, 'shape sem preenchimento solido: ' + JSON.stringify(p));
  must(p.BackColor === 'RGB(124, 58, 237)' && p.BackStyle === 1, 'shape sem BackColor opaco');
  must(p.Curvature === 12, 'Curvature (rounded) != 12: ' + p.Curvature);
  return 'FillColor solido + Curvature 12';
});

check('shape "track" com borda (BorderColor/BorderWidth)', () => {
  const p = byName.track && byName.track.properties;
  must(p && p.BorderColor === 'RGB(51, 65, 85)' && p.BorderWidth === 1, 'borda do track ausente: ' + JSON.stringify(p));
  return 'BorderColor #334155 width 1';
});

check('Timer: Interval + evento Timer -> ThisForm.tick()', () => {
  const t = byName.tmr;
  must(t && t.type === 'timer', 'timer ausente');
  must(t.properties && t.properties.Interval === 50, 'Interval != 50: ' + JSON.stringify(t.properties));
  must(t.methods && t.methods.Timer === 'ThisForm.tick()', 'evento Timer nao ligado a tick(): ' + JSON.stringify(t.methods));
  return 'Interval 50, Timer -> ThisForm.tick()';
});

check('animacao: tick() muta a largura do shape', () => {
  const body = ir.methods && ir.methods.tick;
  must(body, 'metodo tick ausente');
  must(/This\.bar\.width = This\.bar\.width \+ 10/.test(body), 'tick nao incrementa bar.width: ' + body);
  must(/IF This\.bar\.width > 300/.test(body), 'tick sem reset condicional');
  return 'tick incrementa e reinicia bar.width';
});

console.log('\n  estilo/design + animacao (TSX -> props VFP, build-time)');
console.log('  ' + '-'.repeat(58));
let ok = 0;
for (const c of checks) {
  if (c.ok) ok++;
  console.log(`  ${c.ok ? 'OK ' : 'XX '} ${c.label}`);
  if (c.info) console.log(`        ${c.info.length > 80 ? c.info.slice(0, 80) + '…' : c.info}`);
}
console.log('  ' + '-'.repeat(58));
console.log(`\n  ${ok}/${checks.length} checks de estilo/animacao (build-time)\n`);
process.exit(ok === checks.length ? 0 : 1);
