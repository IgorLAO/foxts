'use strict';
// verify.js — prova a fatia vertical de ponta a ponta:
//   examples/calc.ts --(foxts)--> dist/calc.prg --(foxcli/VFP)--> resultados
// e compara com a execucao do MESMO .ts em Node (oraculo). Dois backends, uma fonte.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');
const { transpile } = require('./transpile');

const FOXCLI = require('./foxcli-path');
const SRC = path.resolve('examples/calc.ts');
const PRG = path.resolve('dist/calc.prg');
const DRV = path.resolve('dist/_driver.prg');
const ORACLE = path.resolve('dist/_oracle.cjs');

// casos de teste: [funcao, argumentos]
const CASES = [
  ['fatorial', [5]],
  ['somaPares', [10]],
  ['grita', ['oi']],
  ['ehDiaUtil', [1]],
  ['ehDiaUtil', [3]],
  ['etiqueta', [42]],
  ['somaQuadrados', [4]],
  ['maiorDe3', [3, 9, 5]],
  ['classifica', [0]],
  ['classifica', [2]],
  ['classifica', [9]],
];

function jsToFox(v) {
  if (typeof v === 'boolean') return v ? '.T.' : '.F.';
  return String(v);
}
function foxArg(v) {
  return typeof v === 'string' ? `"${v}"` : String(v);
}

// 1. transpila TS -> FoxPro
fs.mkdirSync(path.dirname(PRG), { recursive: true });
fs.writeFileSync(PRG, transpile(SRC), 'latin1');

// 2. oraculo: compila o MESMO TS -> JS e carrega em Node
const jsSrc = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
  compilerOptions: { module: 'commonjs', target: 'es2020' },
}).outputText;
fs.writeFileSync(ORACLE, jsSrc);
const oracle = require(ORACLE);

// 3. gera o driver FoxPro: chama cada funcao e imprime "FOXTS|<resultado>"
let drv = `SET PROCEDURE TO ("${PRG}") ADDITIVE\n`;
for (const [fn, args] of CASES) {
  drv += `? "FOXTS|" + TRANSFORM(${fn}(${args.map(foxArg).join(', ')}))\n`;
}
fs.writeFileSync(DRV, drv, 'latin1');

// 4. executa no VFP via foxcli
const raw = execFileSync(FOXCLI, ['run', DRV, '--json', '--timeout', '60'], { encoding: 'utf8' });
const stdout = (JSON.parse(raw).stdout || '').replace(/\x1a/g, ''); // remove EOF (CHR(26)) do SET ALTERNATE
const foxResults = stdout
  .split(/\r?\n/)
  .filter((l) => l.startsWith('FOXTS|'))
  .map((l) => l.slice('FOXTS|'.length).trim());

// 5. compara backend FoxPro x oraculo JS
let ok = 0;
console.log('\n  caso                         FoxPro        JS (oraculo)   ');
console.log('  ' + '-'.repeat(60));
CASES.forEach(([fn, args], i) => {
  const expected = jsToFox(oracle[fn](...args));
  const got = foxResults[i];
  const pass = got === expected;
  if (pass) ok++;
  const call = `${fn}(${args.map((a) => JSON.stringify(a)).join(',')})`;
  console.log(
    `  ${pass ? 'OK ' : 'XX '} ${call.padEnd(26)} ${String(got).padEnd(13)} ${expected}`
  );
  if (!pass) console.log(`      got=${JSON.stringify(got)} exp=${JSON.stringify(expected)}`);
});
console.log('  ' + '-'.repeat(60));
console.log(`\n  ${ok}/${CASES.length} casos batem (FoxPro == JS)\n`);
process.exit(ok === CASES.length ? 0 : 1);
