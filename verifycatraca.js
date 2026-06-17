'use strict';
// verifycatraca.js — PROVA DE PROFUNDIDADE (#1): a logica real de validacao da catraca
// (examples/catraca.ts, modela o Pwi_VF9_CatracaPCI) executada no VFP de verdade. Exercita
// regras de negocio + cursor lookup (count) + UPDATE/increment keyed. Golden test: o
// resultado no VFP deve bater com o calculado a mao.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { transpile } = require('./transpile');

const FOXCLI = require('./foxcli-path');
const SRC = path.resolve('examples/catraca.ts');
const PRG = path.resolve('dist/catraca.prg');
const DRV = path.resolve('dist/_catracadrv.prg');

// [função, esperado] — cada caso roda no VFP:
//   statusA1   A1 = 0/2 (tem saldo)        -> LIBERADO
//   statusB2   B2 = 1/1 (esgotado)         -> SEM SALDO
//   statusZ9   cracha inexistente          -> NAO ENCONTRADO
//   consumosA1 consome A1 (total 2) em laco -> 2 (3o consumo barrado)
//   resetUsado update usado:=0 e reconfere  -> 1 (voltou a ter saldo)
const CASES = [
  ['statusA1', 'LIBERADO'],
  ['statusB2', 'SEM SALDO'],
  ['statusZ9', 'NAO ENCONTRADO'],
  ['nomeA1', 'Joao'],         // .first() (objeto-linha) + leitura de campo
  ['nomeZ9', '?'],            // .first() vazio -> ISNULL(row) (row == null)
  ['consumosA1', '2'],
  ['resetUsado', '1'],
];

fs.mkdirSync(path.dirname(PRG), { recursive: true });
fs.writeFileSync(PRG, transpile(SRC), 'latin1');

let drv = `SET PROCEDURE TO ("${PRG}") ADDITIVE\n`;
for (const [fn] of CASES) drv += `? "C|" + TRANSFORM(${fn}())\n`;
fs.writeFileSync(DRV, drv, 'latin1');

const raw = execFileSync(FOXCLI, ['run', DRV, '--json', '--timeout', '60'], { encoding: 'utf8' });
const out = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '').split(/\r?\n/)
  .filter((l) => l.startsWith('C|')).map((l) => l.slice(2).trim());

let ok = 0;
console.log('\n  catraca (logica real no VFP)   VFP              esperado');
console.log('  ' + '-'.repeat(52));
CASES.forEach(([fn, exp], i) => {
  const got = out[i];
  const pass = got === exp;
  if (pass) ok++;
  console.log(`  ${pass ? 'OK ' : 'XX '} ${(fn + '()').padEnd(14)} ${String(got).padEnd(16)} ${exp}`);
});
console.log('  ' + '-'.repeat(52));
console.log(`\n  ${ok}/${CASES.length} regras da catraca corretas (cursor lookup + UPDATE keyed no VFP)\n`);
process.exit(ok === CASES.length ? 0 : 1);
