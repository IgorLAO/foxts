'use strict';
// verifyqueryguard.js — guarda build-time: where("col", col) com o valor sendo um
// identificador de MESMO nome da coluna (vira WHERE col=col, sempre verdadeiro) deve ser
// REJEITADO; a versao renomeada (colId) deve compilar. Footgun descoberto portando a catraca.
const fs = require('fs');
const path = require('path');
const { transpile } = require('./transpile');

const checks = [];
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
function check(label, fn) { try { const i = fn() || ''; checks.push({ label, ok: true, info: i }); } catch (e) { checks.push({ label, ok: false, info: e.message }); } }

const dir = path.resolve('dist');
fs.mkdirSync(dir, { recursive: true });
const write = (name, body) => { const p = path.join(dir, name); fs.writeFileSync(p, body); return p; };

const BAD = `import { from } from "../decorators";
export function f(cracha: string): void { from("ingressos").where("cracha", cracha).all("cur"); }
`;
const GOOD = `import { from } from "../decorators";
export function f(crachaId: string): void { from("ingressos").where("cracha", crachaId).all("cur"); }
`;

check('rejeita where("cracha", cracha) — valor com mesmo nome da coluna', () => {
  const p = write('_qg_bad.ts', BAD);
  let threw = null;
  try { transpile(p); } catch (e) { threw = e; }
  must(threw, 'deveria ter lancado CompileError');
  must(/mesmo nome da coluna|crachaId/i.test(threw.message), 'mensagem deveria sugerir renomear: ' + threw.message);
  return threw.message.split('\n')[0].slice(0, 70);
});

check('aceita where("cracha", crachaId) — valor renomeado', () => {
  const p = write('_qg_good.ts', GOOD);
  const prg = transpile(p);
  must(/WHERE cracha = crachaId/i.test(prg), 'esperava WHERE cracha = crachaId no PRG');
  return 'compila: WHERE cracha = crachaId';
});

console.log('\n  guarda de query (parametro x coluna, build-time)');
console.log('  ' + '-'.repeat(56));
let ok = 0; for (const c of checks) { if (c.ok) ok++; console.log(`  ${c.ok ? 'OK ' : 'XX '} ${c.label}`); if (c.info) console.log(`        ${c.info.slice(0, 72)}`); }
console.log('  ' + '-'.repeat(56));
console.log(`\n  ${ok}/${checks.length} checks da guarda de query\n`);
process.exit(ok === checks.length ? 0 : 1);
