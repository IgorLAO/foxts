'use strict';
// verifycompound.js — prova (build-time) os COMPOUND COMPONENTS <Card.Header>/
// <Card.Body>/<Card.Footer> (estilo React). O <Card> coleta os filhos tipados e monta:
// Header = título (label bold) + divisória (shape); Body = conteúdo; Footer = linha de
// ações. Fixture: examples/reactkit.form.tsx.
const path = require('path');
const { transpileForm } = require('./transpile');

const checks = [];
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
function check(label, fn) { try { const i = fn() || ''; checks.push({ label, ok: true, info: i }); } catch (e) { checks.push({ label, ok: false, info: e.message }); } }

const ir = transpileForm(path.resolve('examples/reactkit.form.tsx'));
const labels = ir.controls.filter((c) => c.type === 'label').map((c) => c.caption);

check('Card.Header vira título (label bold) + divisória (shape)', () => {
  const hdr = ir.controls.find((c) => c.type === 'label' && c.caption === 'Cabecalho');
  must(hdr, 'titulo "Cabecalho" do Card.Header ausente: ' + JSON.stringify(labels));
  must(hdr.properties && hdr.properties.FontBold === '.T.', 'titulo do header nao e bold');
  // divisória: um shape de 1px (height 1) logo após o header
  must(ir.controls.some((c) => c.type === 'shape' && c.height === 1), 'divisória (shape 1px) do header ausente');
  return 'titulo bold + divisória';
});

check('Card.Body contém o conteúdo (FormField -> txtEmail)', () => {
  must(ir.controls.some((c) => c.type === 'textbox' && c.name === 'txtEmail'), 'campo do Card.Body (txtEmail) ausente');
  must(labels.includes('Email'), 'label "Email" do Card.Body ausente');
  return 'txtEmail + label Email no body';
});

check('Card.Footer contém a ação (botao flat "Salvar")', () => {
  must(labels.includes('Salvar'), 'caption "Salvar" do footer ausente: ' + JSON.stringify(labels));
  // o botao flat emite a caption como label dentro de um container transparente
  const sal = ir.controls.find((c) => c.caption === 'Salvar');
  must(sal && sal.parent, 'botao do footer sem container/parent');
  return 'botao "Salvar" no footer';
});

check('ordem visual: Header acima do Body (mesmo container do Card)', () => {
  // header e body são filhos diretos do container do Card -> tops comparáveis.
  // (o footer fica numa Row própria, com top relativo a ela; sua posição na base é
  //  garantida por construção: children = [...head, ...body, ...footer].)
  const hdr = ir.controls.find((x) => x.caption === 'Cabecalho');
  const email = ir.controls.find((x) => x.caption === 'Email');
  must(hdr && email && hdr.parent === email.parent, 'header e body deveriam compartilhar o container do Card');
  must(hdr.top < email.top, `header (${hdr.top}) deveria estar acima do body (${email.top})`);
  return `header top ${hdr.top} < body top ${email.top} (parent ${hdr.parent})`;
});

console.log('\n  compound components <Card.Header/Body/Footer> (build-time)');
console.log('  ' + '-'.repeat(58));
let ok = 0; for (const c of checks) { if (c.ok) ok++; console.log(`  ${c.ok ? 'OK ' : 'XX '} ${c.label}`); if (c.info) console.log(`        ${c.info.slice(0, 80)}`); }
console.log('  ' + '-'.repeat(58));
console.log(`\n  ${ok}/${checks.length} checks de compound\n`);
process.exit(ok === checks.length ? 0 : 1);
