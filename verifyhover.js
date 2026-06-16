'use strict';
// verifyhover.js — regressão dos eventos de HOVER (botões flat / itens de sidebar /
// toolbar). Dois bugs que quebravam o hover em TODOS os apps:
//  (1) o VFP dispara MouseEnter/MouseLeave COM parâmetros; sem um LPARAMETERS no corpo
//      do método, erra "No PARAMETER statement is found" no 1º hover.
//  (2) o SHAPE recolorido é IRMÃO do container do botão; a label/imagem (filhas do
//      container) precisam de This.Parent.Parent.<shp>, não This.Parent.<shp>.
// Build-time: roda transpileForm + finalizeFormIR (onde o LPARAMETERS é injetado).
const path = require('path');
const { transpileForm, finalizeFormIR } = require('./transpile');

const checks = [];
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
function check(label, fn) { try { const i = fn() || ''; checks.push({ label, ok: true, info: i }); } catch (e) { checks.push({ label, ok: false, info: e.message }); } }

const ir = finalizeFormIR(transpileForm(path.resolve('examples/hover.form.tsx')));
const withHover = ir.controls.filter((c) => c.methods && (c.methods.MouseEnter || c.methods.MouseLeave));

check('existem handlers de hover (botao flat + itens de sidebar)', () => {
  must(withHover.length >= 4, 'esperava varios controles com MouseEnter/Leave: ' + withHover.length);
  return withHover.length + ' controles com hover';
});

check('todo MouseEnter/MouseLeave comeca com LPARAMETERS (senao erro 1229 no VFP)', () => {
  let n = 0;
  for (const c of withHover) for (const ev of ['MouseEnter', 'MouseLeave']) {
    const body = c.methods[ev];
    if (!body) continue;
    must(/^\s*LPARAMETERS\s+nButton\s*,\s*nShift\s*,\s*nXCoord\s*,\s*nYCoord/i.test(body),
      `${c.name}.${ev} sem LPARAMETERS: ${JSON.stringify(body.slice(0, 40))}`);
    n++;
  }
  return n + ' metodos de hover com LPARAMETERS';
});

check('label/imagem (filhas do container) usam This.Parent.Parent.<shp>', () => {
  const deep = ir.controls.filter((c) => (c.type === 'label' || c.type === 'image') && c.methods && c.methods.MouseEnter);
  must(deep.length >= 1, 'nenhuma label/imagem com MouseEnter');
  for (const c of deep) must(/This\.Parent\.Parent\./.test(c.methods.MouseEnter),
    `${c.name} (filha) deveria usar This.Parent.Parent: ${JSON.stringify(c.methods.MouseEnter.slice(0, 80))}`);
  return deep.length + ' filhas com caminho profundo';
});

check('container do botao usa This.Parent.<shp> (1 nivel, nao Parent.Parent)', () => {
  const conts = ir.controls.filter((c) => c.type === 'container' && c.methods && c.methods.MouseEnter && /shp/i.test(c.methods.MouseEnter));
  must(conts.length >= 1, 'nenhum container de botao com hover');
  for (const c of conts) {
    const body = c.methods.MouseEnter.replace(/^.*LPARAMETERS.*$/im, ''); // ignora a linha do LPARAMETERS
    must(/This\.Parent\./.test(body), `${c.name} sem This.Parent`);
    must(!/This\.Parent\.Parent\./.test(body), `${c.name} (container) NAO deveria usar This.Parent.Parent`);
  }
  return conts.length + ' containers com caminho de 1 nivel';
});

console.log('\n  hover de botoes/sidebar (LPARAMETERS + caminho do shape, build-time)');
console.log('  ' + '-'.repeat(58));
let ok = 0; for (const c of checks) { if (c.ok) ok++; console.log(`  ${c.ok ? 'OK ' : 'XX '} ${c.label}`); if (c.info) console.log(`        ${c.info.slice(0, 80)}`); }
console.log('  ' + '-'.repeat(58));
console.log(`\n  ${ok}/${checks.length} checks de hover\n`);
process.exit(ok === checks.length ? 0 : 1);
