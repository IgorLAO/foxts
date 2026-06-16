'use strict';
// verifyicons.js — prova (build-time) o SISTEMA DE ÍCONES: <Icon name>/<SaveIcon/> viram
// um controle Image apontando p/ o PNG (rasterizado do SVG do Lucide por build-icons.js),
// com BackStyle 0 (alpha) e Stretch. `color` escolhe a variante recolorida. Também
// confere que os PNGs referenciados existem em disco (pipeline SVG->PNG executado).
const path = require('path');
const fs = require('fs');
const { transpileForm } = require('./transpile');

const checks = [];
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
function check(label, fn) { try { const i = fn() || ''; checks.push({ label, ok: true, info: i }); } catch (e) { checks.push({ label, ok: false, info: e.message }); } }

const ir = transpileForm(path.resolve('examples/reactkit.form.tsx'));
const imgs = ir.controls.filter((c) => c.type === 'image');
const pics = imgs.map((c) => c.properties && c.properties.Picture);

check('<Icon name="search"> vira Image com Picture=icons/search.png', () => {
  must(pics.includes('"icons/search.png"'), 'Picture do <Icon name="search"> ausente: ' + JSON.stringify(pics));
  return 'icons/search.png';
});

check('alias <SaveIcon color="primary"> -> icons/save-primary.png (variante recolorida)', () => {
  must(pics.includes('"icons/save-primary.png"'), 'variante de cor do <SaveIcon> ausente: ' + JSON.stringify(pics));
  return 'icons/save-primary.png';
});

check('Image de ícone usa BackStyle 0 (alpha) e Stretch', () => {
  const ic = imgs.find((c) => c.properties && c.properties.Picture === '"icons/search.png"');
  must(ic && ic.properties.BackStyle === 0, 'BackStyle != 0 (sem alpha): ' + JSON.stringify(ic && ic.properties));
  must(ic.properties.Stretch != null, 'Stretch ausente');
  return 'BackStyle 0 + Stretch';
});

check('pipeline SVG->PNG executado: PNGs referenciados existem em disco', () => {
  const base = path.resolve('showcase/react-app');
  for (const name of ['icons/search.png', 'icons/save.png', 'icons/save-primary.png', 'icons/user.png', 'icons/trash-danger.png']) {
    const p = path.join(base, name);
    must(fs.existsSync(p), 'PNG ausente (rode build-icons.js): ' + name);
    must(fs.statSync(p).size > 0 && fs.readFileSync(p).slice(0, 4).toString('hex') === '89504e47', 'nao e um PNG valido: ' + name);
  }
  return 'PNGs validos (magic 89504e47)';
});

console.log('\n  sistema de icones <Icon>/<SaveIcon> (SVG->PNG, build-time)');
console.log('  ' + '-'.repeat(58));
let ok = 0; for (const c of checks) { if (c.ok) ok++; console.log(`  ${c.ok ? 'OK ' : 'XX '} ${c.label}`); if (c.info) console.log(`        ${c.info.slice(0, 80)}`); }
console.log('  ' + '-'.repeat(58));
console.log(`\n  ${ok}/${checks.length} checks de icones\n`);
process.exit(ok === checks.length ? 0 : 1);
