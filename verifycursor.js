'use strict';
// verifycursor.js — prova o pipeline de CURSORES de ponta a ponta:
//   examples/cursor.ts --(foxts)--> FoxPro com CREATE CURSOR/INSERT/SCAN
//   roda no VFP (foxcli) e compara com o MESMO .ts executado em Node (runtime fox.ts).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');
const { transpile } = require('./transpile');

const FOXCLI = require('./foxcli-path');
const SRC = path.resolve('examples/cursor.ts');
const PRG = path.resolve('dist/cursor.prg');
const DRV = path.resolve('dist/_curdriver.prg');

// casos: nome da função + datas (literal FoxPro e equivalente JS)
const CASES = [
  { fn: 'totalLinhas', fox: '{^2026-06-08}, {^2026-06-14}', js: [new Date(2026, 5, 8), new Date(2026, 5, 14)] },
  { fn: 'contarUteis', fox: '{^2026-06-08}, {^2026-06-14}', js: [new Date(2026, 5, 8), new Date(2026, 5, 14)] },
  { fn: 'contarUteis', fox: '{^2026-06-08}, {^2026-06-10}', js: [new Date(2026, 5, 8), new Date(2026, 5, 10)] },
  { fn: 'contarUteis', fox: '{^2026-06-01}, {^2026-06-30}', js: [new Date(2026, 5, 1), new Date(2026, 5, 30)] },
];

// 1. transpila TS -> FoxPro (.prg)
fs.mkdirSync(path.dirname(PRG), { recursive: true });
const prg = transpile(SRC);
fs.writeFileSync(PRG, prg, 'latin1');
const schema = (prg.match(/CREATE CURSOR .*/g) || [])[0] || '(nenhum)';
console.log(`\n  schema transplantado da interface TS:\n    ${schema}\n`);

// 2. oráculo: compila fox.ts + cursor.ts para JS e carrega (runtime real em Node)
function emitJs(tsRel, outRel) {
  const js = ts.transpileModule(fs.readFileSync(tsRel, 'utf8'), {
    compilerOptions: { module: 'commonjs', target: 'es2020' },
  }).outputText;
  const p = path.resolve(outRel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, js);
  return p;
}
emitJs('fox.ts', 'dist/fox.js');
const oraclePath = emitJs('examples/cursor.ts', 'dist/oracle/cursor.js'); // "../fox" -> dist/fox.js
delete require.cache[oraclePath];
const oracle = require(oraclePath);

// 3. driver FoxPro: chama cada função e imprime "FOXC|<resultado>"
let drv = `SET PROCEDURE TO ("${PRG}") ADDITIVE\n`;
for (const c of CASES) drv += `? "FOXC|" + TRANSFORM(${c.fn}(${c.fox}))\n`;
fs.writeFileSync(DRV, drv, 'latin1');

// 4. executa no VFP
const raw = execFileSync(FOXCLI, ['run', DRV, '--json', '--timeout', '60'], { encoding: 'utf8' });
const stdout = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '');
const got = stdout.split(/\r?\n/).filter((l) => l.startsWith('FOXC|')).map((l) => l.slice(5).trim());

// 5. compara FoxPro (cursor real no VFP) x Node (runtime fox.ts)
let ok = 0;
console.log('  caso                                        FoxPro   JS (oráculo)');
console.log('  ' + '-'.repeat(58));
CASES.forEach((c, i) => {
  const expected = String(oracle[c.fn](...c.js));
  const pass = got[i] === expected;
  if (pass) ok++;
  const label = `${c.fn}(${c.fox})`;
  console.log(`  ${pass ? 'OK ' : 'XX '} ${label.padEnd(40)} ${String(got[i]).padEnd(8)} ${expected}`);
});
console.log('  ' + '-'.repeat(58));
console.log(`\n  ${ok}/${CASES.length} casos batem (cursor no VFP == runtime em Node)\n`);
process.exit(ok === CASES.length ? 0 : 1);
