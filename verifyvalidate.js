'use strict';
// verifyvalidate.js — Frente F: o validador gerado (PROCEDURE Validar<Nome>) roda no
// VFP e devolve "" para objeto válido ou a 1ª mensagem de erro. Teste golden: monta
// um objeto Empty com SCATTER-like (ADDPROPERTY) e confere o retorno contra o esperado.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { transpile } = require('./transpile');

const FOXCLI = require('./foxcli-path');
const SRC = path.resolve('examples/validate.ts');
const PRG = path.resolve('dist/validate.prg');
const DRV = path.resolve('dist/_valdrv.prg');

// [rótulo, props do objeto, mensagem esperada do validador]
const CASES = [
  ['valido',      { nome: 'Ana',  uf: 'SP', email: 'a@x.com', idade: 30 }, ''],
  ['nome_curto',  { nome: 'Al',   uf: 'SP', email: 'a@x.com', idade: 30 }, 'nome: minimo 3 caracteres'],
  ['nome_refine', { nome: 'Root', uf: 'SP', email: 'a@x.com', idade: 30 }, 'nome: reservado'],
  ['uf_errada',   { nome: 'Ana',  uf: 'S',  email: 'a@x.com', idade: 30 }, 'uf: deve ter 2 caracteres'],
  ['email_ruim',  { nome: 'Ana',  uf: 'SP', email: 'axcom',   idade: 30 }, 'email: email invalido'],
  ['menor',       { nome: 'Ana',  uf: 'SP', email: 'a@x.com', idade: 16 }, 'idade: minimo 18'],
  ['idade_refine',{ nome: 'Ana',  uf: 'SP', email: 'a@x.com', idade: 99 }, 'idade: 99 reservado'],
];

fs.mkdirSync(path.dirname(PRG), { recursive: true });
fs.writeFileSync(PRG, transpile(SRC), 'latin1');

const vfpVal = (v) => typeof v === 'number' ? String(v) : `"${v}"`;
let drv = `SET PROCEDURE TO ("${PRG}") ADDITIVE\n`;
CASES.forEach(([label, obj], i) => {
  drv += `loObj${i} = CREATEOBJECT("Empty")\n`;
  for (const [k, v] of Object.entries(obj)) drv += `ADDPROPERTY(loObj${i}, "${k}", ${vfpVal(v)})\n`;
  drv += `? "V|" + ValidarCliente(loObj${i})\n`;
});
fs.writeFileSync(DRV, drv, 'latin1');

const raw = execFileSync(FOXCLI, ['run', DRV, '--json', '--timeout', '60'], { encoding: 'utf8' });
const out = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '').split(/\r?\n/)
  .filter((l) => l.startsWith('V|')).map((l) => l.slice(2).replace(/\s+$/, ''));

let ok = 0;
console.log('\n  caso          retorno do validador (VFP)');
console.log('  ' + '-'.repeat(50));
CASES.forEach(([label, , exp], i) => {
  const got = out[i] === undefined ? '<sem saida>' : out[i];
  const pass = got === exp;
  if (pass) ok++;
  console.log(`  ${pass ? 'OK ' : 'XX '} ${label.padEnd(12)} ${JSON.stringify(got)}${pass ? '' : ' != ' + JSON.stringify(exp)}`);
});
console.log('  ' + '-'.repeat(50));
console.log(`\n  ${ok}/${CASES.length} validacoes corretas (no VFP)\n`);
process.exit(ok === CASES.length ? 0 : 1);
