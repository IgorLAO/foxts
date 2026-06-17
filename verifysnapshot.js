'use strict';
// verifysnapshot.js — REDE DE REGRESSAO DE OUTPUT. O test.js so prova que cada form
// "ainda compila"; nao pega quando uma mudanca no compilador ALTERA SILENCIOSAMENTE o
// SCX gerado. Este oraculo congela a IR (o que vira SCX) de cada examples/*.form.ts(x)
// em snapshots/<name>.json e falha se a IR mudar. E a malha de seguranca que torna
// seguro refatorar o transpile.js (o monolito): refatorou e o snapshot bateu = output
// identico, byte a byte logico. Atualizar baselines (apos mudanca INTENCIONAL):
//   FOXTS_UPDATE_SNAPSHOTS=1 node verifysnapshot.js   (ou node test.js)
const fs = require('fs');
const path = require('path');
const t = require('./transpile');
const layout = require('./layout');

const SNAP_DIR = path.resolve('snapshots');
const UPDATE = process.env.FOXTS_UPDATE_SNAPSHOTS === '1';

// serializacao estavel: ordena chaves recursivamente -> robusta a reordenacao inocente
// de chaves num refactor (so VALORES contam). Arrays preservam ordem (significativa).
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = stable(v[k]);
    return o;
  }
  return v;
}
const canon = (ir) => JSON.stringify(stable(ir), null, 2);

// primeiro ponto de divergencia entre dois JSON canonicos (p/ mensagem util)
function firstDiff(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return `linha ${i + 1}:\n      base: ${(la[i] || '<vazio>').trim()}\n      novo: ${(lb[i] || '<vazio>').trim()}`;
  }
  return 'tamanho diferente';
}

function forms() {
  const dir = path.resolve('examples');
  return fs.readdirSync(dir).filter((f) => /\.form\.tsx?$/.test(f)).sort()
    .map((f) => path.join('examples', f));
}

(async () => {
  if (process.env.FOXTS_LAYOUT !== 'flex' && await layout.loadYogaEngine()) layout.setEngine('yoga'); // igual ao foxc
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  const checks = [];
  for (const f of forms()) {
    const name = path.basename(f).replace(/\.form\.tsx?$/, '');
    const snap = path.join(SNAP_DIR, name + '.json');
    let got;
    try {
      const ir = t.transpileForm(f);
      if (!ir) { checks.push({ name, ok: true, skip: true, info: 'objeto-mode (fora do path AST->IR)' }); continue; }
      got = canon(t.finalizeFormIR(ir));
    } catch (e) {
      checks.push({ name, ok: false, info: 'erro ao transpilar: ' + e.message });
      continue;
    }
    if (UPDATE || !fs.existsSync(snap)) {
      fs.writeFileSync(snap, got);
      checks.push({ name, ok: true, info: UPDATE ? 'baseline atualizado' : 'baseline criado' });
      continue;
    }
    const base = fs.readFileSync(snap, 'utf8');
    if (base === got) checks.push({ name, ok: true, info: 'igual' });
    else checks.push({ name, ok: false, info: 'IR MUDOU -> ' + firstDiff(base, got) });
  }

  console.log('\n  snapshot da IR (regressao de output do compilador)');
  console.log('  ' + '-'.repeat(58));
  let ok = 0, skipped = 0;
  for (const c of checks) { if (c.ok) ok++; if (c.skip) skipped++; console.log(`  ${c.skip ? '-- ' : c.ok ? 'OK ' : 'XX '} ${c.name.padEnd(22)} ${c.info}`); }
  console.log('  ' + '-'.repeat(58));
  console.log(`\n  ${ok}/${checks.length} forms com IR estavel (${skipped} objeto-mode pulados)${UPDATE ? ' (baselines reescritos)' : ''}\n`);
  process.exit(ok === checks.length ? 0 : 1);
})();
