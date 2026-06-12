'use strict';
// verifyformvalidate.js — Frente F: validação do form gerada direto do schema.
// @Form({ validate: Cliente }) gera ThisForm.Validar(), que aplica as regras do schema
// lendo ThisForm.<campo> (membro vinculado por bind) e devolve "" ou a 1ª mensagem.
// Constrói o SCX de examples/cadvalida.form.tsx, instancia NOSHOW LINKED, seta os
// campos de cada caso e confere o retorno de Validar() contra o esperado.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const layout = require('./layout');
const { transpileForm, finalizeFormIR } = require('./transpile');

const FOXCLI = process.env.FOXCLI || 'C:\\projectos\\testesvf\\foxcli\\foxcli.exe';

function buildScx(tsRel, outRel) {
  const ir = finalizeFormIR(transpileForm(path.resolve(tsRel)));
  const jsonPath = path.resolve(outRel.replace(/\.scx$/, '.json'));
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(ir, null, 2));
  const scx = path.resolve(outRel);
  const res = JSON.parse(execFileSync(FOXCLI, ['form', '--spec', jsonPath, '--out', scx, '--json'], { encoding: 'utf8' }));
  if (!res.ok) throw new Error('foxcli form falhou: ' + (res.errors || []).join('; '));
  return scx;
}

// [rótulo, { campo: valor }, mensagem esperada de ThisForm.Validar()]
const CASES = [
  ['valido',      { nome: 'Ana', uf: 'SP', idade: 30 }, ''],
  ['nome_curto',  { nome: 'Al',  uf: 'SP', idade: 30 }, 'nome: minimo 3 caracteres'],
  ['uf_errada',   { nome: 'Ana', uf: 'S',  idade: 30 }, 'uf: deve ter 2 caracteres'],
  ['idade_baixa', { nome: 'Ana', uf: 'SP', idade: 16 }, 'idade: minimo 18'],
];

const vfpVal = (v) => (typeof v === 'number' ? String(v) : `"${v}"`);

(async () => {
  if (process.env.FOXTS_LAYOUT !== 'flex' && await layout.loadYogaEngine()) layout.setEngine('yoga');

  const scx = buildScx('examples/cadvalida.form.tsx', 'dist/cadvalida.scx');

  let drv = `DO FORM ("${scx}") NAME loF NOSHOW LINKED\n`;
  CASES.forEach(([label, fields], i) => {
    for (const [k, v] of Object.entries(fields)) drv += `loF.${k} = ${vfpVal(v)}\n`;
    drv += `? "R${i}|" + loF.Validar()\n`;
  });
  drv += 'loF.Release()\n';
  const drvPath = path.resolve('dist', '_fvaldrv.prg');
  fs.writeFileSync(drvPath, drv, 'latin1');

  const raw = execFileSync(FOXCLI, ['run', drvPath, '--json', '--timeout', '60'], { encoding: 'utf8' });
  const stdout = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '');
  const map = {};
  for (const l of stdout.split(/\r?\n/)) { const i = l.indexOf('|'); if (i > 0) map[l.slice(0, i)] = l.slice(i + 1).replace(/\s+$/, ''); }

  let ok = 0;
  console.log('\n  validação do form gerada do schema (ThisForm.Validar() no VFP)');
  console.log('  ' + '-'.repeat(58));
  CASES.forEach(([label, , exp], i) => {
    const got = map[`R${i}`] === undefined ? '<sem saida>' : map[`R${i}`];
    const pass = got === exp;
    if (pass) ok++;
    console.log(`  ${pass ? 'OK ' : 'XX '} ${label.padEnd(12)} ${JSON.stringify(got)}${pass ? '' : ' != ' + JSON.stringify(exp)}`);
  });
  console.log('  ' + '-'.repeat(58));
  console.log(`\n  ${ok}/${CASES.length} validacoes de form corretas (no VFP)\n`);
  process.exit(ok === CASES.length ? 0 : 1);
})();
