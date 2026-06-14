'use strict';
// verifyguard.js — Frente D / dívida técnica: guarda de variável de 1 letra a-j.
//
// Em VFP as letras a-j são ALIASES de work area. Uma variável de 1 letra que segura
// um OBJETO e é usada como `c.campo` é lida pelo VFP como ALIAS(C).campo e falha em
// runtime ("Variable not found"). O transpilador REJEITA esse caso (CompileError com
// linha/coluna, sugerindo nome >=2 letras) — nunca palpita.
//
// Oráculo BUILD-TIME (não precisa de VFP): prova
//   (1) que o caso ruim (examples/guard_badvar.ts) é REJEITADO com a mensagem certa,
//       contendo a localização (linha/coluna);
//   (2) que escalares de 1 letra (contador `i`, string `s`) NÃO são rejeitados
//       (examples/guard_okscalar.ts compila normalmente).

const path = require('path');
const { transpile, CompileError } = require('./transpile');

const checks = [];
function check(label, fn) {
  let ok = false, info = '';
  try { info = fn() || ''; ok = true; } catch (e) { ok = false; info = e.message; }
  checks.push({ label, ok, info });
}

// (1) caso ruim: deve lançar CompileError mencionando work area / 1 letra + localização
check('rejeita objeto em var de 1 letra (c.nome)', () => {
  let threw = null;
  try { transpile(path.resolve('examples/guard_badvar.ts')); }
  catch (e) { threw = e; }
  if (!threw) throw new Error('NAO rejeitou (esperava CompileError)');
  if (threw.name !== 'CompileError') throw new Error('erro de tipo errado: ' + threw.name);
  const m = threw.message;
  if (!/work area|aliases? de work area|ALIAS/i.test(m)) throw new Error('mensagem nao explica work area: ' + m);
  if (!/2\+? *letras|loRow|loCli/i.test(m)) throw new Error('mensagem nao sugere nome maior: ' + m);
  if (!/linha \d+, coluna \d+/.test(m)) throw new Error('mensagem sem linha/coluna: ' + m);
  return m.replace(/^\[foxts\] nao suportado: /, '');
});

// (2) caso bom: contador/escalar de 1 letra compila sem erro
check('aceita contador/escalar de 1 letra (i, s.length)', () => {
  const prg = transpile(path.resolve('examples/guard_okscalar.ts'));
  if (!/FOR i = 0|i = i \+ 1/.test(prg)) throw new Error('loop com i nao emitido');
  if (!/LEN\(s\)/.test(prg)) throw new Error('s.length nao virou LEN(s)');
  return 'compilou (loop i + LEN(s))';
});

console.log('\n  guarda de variavel de 1 letra a-j (objeto vs escalar)');
console.log('  ' + '-'.repeat(58));
let ok = 0;
for (const c of checks) {
  if (c.ok) ok++;
  console.log(`  ${c.ok ? 'OK ' : 'XX '} ${c.label}`);
  if (c.info) console.log(`        ${c.info.length > 80 ? c.info.slice(0, 80) + '…' : c.info}`);
}
console.log('  ' + '-'.repeat(58));
console.log(`\n  ${ok}/${checks.length} checks da guarda (build-time)\n`);
process.exit(ok === checks.length ? 0 : 1);
