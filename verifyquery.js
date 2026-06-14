'use strict';
// verifyquery.js — query builder (from().where().orderBy().all()) executado no VFP.
// from() é no-op em Node, então não há oráculo JS: é um teste "golden" — o resultado
// do SELECT no VFP deve bater com o valor calculado à mão.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { transpile } = require('./transpile');

const FOXCLI = require('./foxcli-path');
const SRC = path.resolve('examples/query.ts');
const PRG = path.resolve('dist/query.prg');
const DRV = path.resolve('dist/_qdrv.prg');

// [função, args, esperado] — cada caso roda no VFP e o resultado deve bater à mão:
//   ativosSP        ativo=.T. AND uf="SP"            -> Ana, Davi          = 2
//   contaAtivos     COUNT(*) WHERE ativo=.T.         -> Ana, Bia, Davi     = 3
//   primeiroPorNome TOP 1 ORDER BY nome (1 linha)    -> cursor com 1 reg   = 1
//   ufsComMais      GROUP BY uf HAVING COUNT(*)>1    -> só SP              = 1
//   pedidosSP       cli JOIN ped WHERE uf="SP"       -> Ana, Davi          = 2
const CASES = [
  ['ativosSP', [], '2'],
  ['contaAtivos', [], '3'],
  ['primeiroPorNome', [], '1'],
  ['primeiroSP', [], 'Davi'],
  ['ufsComMais', [], '1'],
  ['pedidosSP', [], '2'],
];

fs.mkdirSync(path.dirname(PRG), { recursive: true });
fs.writeFileSync(PRG, transpile(SRC), 'latin1');

let drv = `SET PROCEDURE TO ("${PRG}") ADDITIVE\n`;
for (const [fn, args] of CASES) drv += `? "Q|" + TRANSFORM(${fn}(${args.join(', ')}))\n`;
fs.writeFileSync(DRV, drv, 'latin1');

const raw = execFileSync(FOXCLI, ['run', DRV, '--json', '--timeout', '60'], { encoding: 'utf8' });
const out = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '').split(/\r?\n/)
  .filter((l) => l.startsWith('Q|')).map((l) => l.slice(2).trim());

let ok = 0;
console.log('\n  query            VFP   esperado');
console.log('  ' + '-'.repeat(34));
CASES.forEach(([fn, , exp], i) => {
  const got = out[i];
  const pass = got === exp;
  if (pass) ok++;
  console.log(`  ${pass ? 'OK ' : 'XX '} ${(fn + '()').padEnd(12)} ${String(got).padEnd(5)} ${exp}`);
});
console.log('  ' + '-'.repeat(34));
console.log(`\n  ${ok}/${CASES.length} queries corretas (SELECT no VFP)\n`);
process.exit(ok === CASES.length ? 0 : 1);
