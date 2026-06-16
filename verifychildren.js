'use strict';
// verifychildren.js — prova (build-time) o CHILDREN THREADING / <Slot/> (composição
// estilo React): os filhos passados no USO de um @Component fluem para onde o <Slot/>
// está dentro do render() dele. Cobre o caso single-file (examples/reactkit.form.tsx:
// <Panel> envolve um <Card> e reinjeta os filhos) E o caso CROSS-FILE (showcase
// react-app: <PanelCard> em arquivo separado recebe <FormField> da página).
const path = require('path');
const { transpileForm } = require('./transpile');

const checks = [];
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
function check(label, fn) { try { const i = fn() || ''; checks.push({ label, ok: true, info: i }); } catch (e) { checks.push({ label, ok: false, info: e.message }); } }

const ir = transpileForm(path.resolve('examples/reactkit.form.tsx'));
const labels = ir.controls.filter((c) => c.type === 'label').map((c) => c.caption);
const containers = ir.controls.filter((c) => c.type === 'container');

check('children do uso aparecem no render do @Component (single-file)', () => {
  must(labels.includes('Dentro do slot'), 'label do slot ausente: ' + JSON.stringify(labels));
  must(ir.controls.some((c) => c.type === 'textbox' && c.name === 'txtNome'), 'textbox do slot (txtNome) ausente');
  return 'label + textbox injetados via <Slot/>';
});

check('children slotados ficam ANINHADOS no container do componente (PARENT)', () => {
  const slotLbl = ir.controls.find((c) => c.caption === 'Dentro do slot');
  must(slotLbl && slotLbl.parent, 'label do slot sem PARENT (deveria estar dentro do Card do Panel): ' + JSON.stringify(slotLbl));
  must(containers.length >= 1, 'sem container (Card do Panel) na IR');
  return 'PARENT=' + slotLbl.parent;
});

// ── Cross-file: o @Component <PanelCard> vive em components/, a página em pages/ ──
const pageDir = 'showcase/react-app/pages/DashboardPage.form.tsx';
check('CROSS-FILE: <PanelCard> (components/) recebe children da página (pages/)', () => {
  const pir = transpileForm(path.resolve(pageDir));
  const caps = pir.controls.filter((c) => c.type === 'label').map((c) => c.caption);
  must(caps.includes('Meta'), 'FormField "Meta" (slotado no PanelCard) ausente: ' + JSON.stringify(caps));
  must(caps.includes('Realizado'), 'FormField "Realizado" (slotado) ausente');
  return 'PanelCard reinjetou os FormFields da página (cross-file)';
});

console.log('\n  children threading / <Slot/> (composição React, build-time)');
console.log('  ' + '-'.repeat(58));
let ok = 0; for (const c of checks) { if (c.ok) ok++; console.log(`  ${c.ok ? 'OK ' : 'XX '} ${c.label}`); if (c.info) console.log(`        ${c.info.slice(0, 80)}`); }
console.log('  ' + '-'.repeat(58));
console.log(`\n  ${ok}/${checks.length} checks de children/slot\n`);
process.exit(ok === checks.length ? 0 : 1);
