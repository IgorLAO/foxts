'use strict';
// verifyi18n.js — Frente F (i18n): as mensagens dos validadores vêm de um catálogo
// sobreponível (setMessages / vfp.messages.json). Aqui trocamos o catálogo para EN,
// transpilamos examples/validate.ts e confirmamos no VFP que ValidarCliente devolve
// as mensagens EM INGLÊS (mesma lógica, só o texto muda). As mensagens de .refine são
// explícitas no schema, então NÃO são traduzidas (continuam em PT) — também conferido.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { transpile, setMessages } = require('./transpile');

const FOXCLI = require('./foxcli-path');
const SRC = path.resolve('examples/validate.ts');
const PRG = path.resolve('dist/validate_en.prg');
const DRV = path.resolve('dist/_i18ndrv.prg');

// catálogo EN (templates com {field}/{n}) — sobrepõe o default PT antes de transpilar
setMessages({
  'str.min': '{field}: min {n} chars',
  'str.max': '{field}: max {n} chars',
  'str.len': '{field}: must be {n} chars',
  'str.email': '{field}: invalid email',
  'num.min': '{field}: min {n}',
  'num.max': '{field}: max {n}',
});

// [rótulo, props do objeto, mensagem esperada (EN p/ regras built-in; PT p/ refine)]
const CASES = [
  ['nome_min',   { nome: 'Al',   uf: 'SP', email: 'a@x.com', idade: 30 }, 'nome: min 3 chars'],
  ['uf_len',     { nome: 'Ana',  uf: 'S',  email: 'a@x.com', idade: 30 }, 'uf: must be 2 chars'],
  ['email_bad',  { nome: 'Ana',  uf: 'SP', email: 'axcom',   idade: 30 }, 'email: invalid email'],
  ['idade_min',  { nome: 'Ana',  uf: 'SP', email: 'a@x.com', idade: 16 }, 'idade: min 18'],
  ['refine_pt',  { nome: 'Root', uf: 'SP', email: 'a@x.com', idade: 30 }, 'nome: reservado'],
];

fs.mkdirSync(path.dirname(PRG), { recursive: true });
fs.writeFileSync(PRG, transpile(SRC), 'latin1');

const vfpVal = (v) => (typeof v === 'number' ? String(v) : `"${v}"`);
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
console.log('\n  caso          retorno do validador (catálogo EN)');
console.log('  ' + '-'.repeat(50));
CASES.forEach(([label, , exp], i) => {
  const got = out[i] === undefined ? '<sem saida>' : out[i];
  const pass = got === exp;
  if (pass) ok++;
  console.log(`  ${pass ? 'OK ' : 'XX '} ${label.padEnd(12)} ${JSON.stringify(got)}${pass ? '' : ' != ' + JSON.stringify(exp)}`);
});
console.log('  ' + '-'.repeat(50));
console.log(`\n  ${ok}/${CASES.length} mensagens i18n corretas (no VFP)\n`);
process.exit(ok === CASES.length ? 0 : 1);
