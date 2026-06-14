'use strict';
// verifysql.js — prova a lib de SQL Server (db.ts):
//   1. transpila examples/sql.ts -> FoxPro e confere o SQL pass-through gerado;
//   2. COMPILA o .prg no VFP de verdade (foxcli compile) — valida a sintaxe
//      sem precisar de um servidor SQL conectado.
//
// Round-trip contra um SQL Server real exige um servidor; defina a variável
// FOXTS_SQLCONN com uma connection string para um teste vivo (opcional, manual).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { transpile } = require('./transpile');

const FOXCLI = require('./foxcli-path');
const SRC = path.resolve('examples/sql.ts');
const PRG = path.resolve('dist/sql.prg');

// 1. transpila
fs.mkdirSync(path.dirname(PRG), { recursive: true });
const prg = transpile(SRC);
fs.writeFileSync(PRG, prg, 'latin1');

// 2. asserções estruturais sobre o FoxPro gerado
const EXPECT = [
  '#DEFINE CONN "DRIVER=SQL Server',
  'SQLSTRINGCONNECT(CONN)',
  'SQLEXEC(db, "SELECT id, nome, uf FROM clientes WHERE uf = ?uf ORDER BY nome", "clientes")',
  'SQLEXEC(db, "SELECT uf, COUNT(*) AS qt FROM clientes GROUP BY uf", "poruf")',
  'SQLCONNECT("vendasDSN", "sa", "senha")',
  'IF (db > 0)',
  'SQLDISCONNECT(db)',
];
let structOk = 0;
console.log('\n  SQL pass-through gerado:');
console.log('  ' + '-'.repeat(56));
for (const e of EXPECT) {
  const ok = prg.includes(e);
  if (ok) structOk++;
  console.log(`  ${ok ? 'OK ' : 'XX '} ${e.length > 50 ? e.slice(0, 50) + '…' : e}`);
}
console.log('  ' + '-'.repeat(56));

// 3. compila no VFP de verdade — prova que é FoxPro sintaticamente válido
const raw = execFileSync(FOXCLI, ['compile', PRG, '--json', '--timeout', '60'], { encoding: 'utf8' });
const j = JSON.parse(raw);
console.log(`\n  foxcli compile: ${j.ok ? 'OK (FoxPro válido)' : 'FALHOU'}`);
if (!j.ok) (j.errors || []).forEach((e) => console.log('    ' + e));

const pass = structOk === EXPECT.length && j.ok;
console.log(`\n  ${structOk}/${EXPECT.length} asserções + compilação ${j.ok ? 'OK' : 'FALHOU'} -> ${pass ? 'SUCESSO' : 'FALHA'}\n`);
process.exit(pass ? 0 : 1);
