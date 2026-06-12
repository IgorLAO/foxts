'use strict';
// test.js — consolidated regression runner for the foxts framework.
// Runs all oracle scripts (verify.js, verifycursor.js, verifysql.js, verifyclass.js)
// and builds all example form files (examples/*.form.ts and examples/*.form.tsx)
// via `node foxc.js build`. Each check is isolated: a failure or timeout is recorded
// as FAIL but does not crash the runner. Prints a summary table at the end and
// exits 0 only if all checks pass, else 1.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Run a child process and return { ok, output }. Never throws. */
function run(cmd, args, opts) {
  let output = '';
  try {
    const result = execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: opts.timeout || 180000,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    output = result || '';
    return { ok: true, output };
  } catch (err) {
    // execFileSync throws on non-zero exit, timeout, or spawn error
    const stdout = (err.stdout || '');
    const stderr = (err.stderr || '');
    output = [stdout, stderr].filter(Boolean).join('\n');
    if (err.code === 'ETIMEDOUT' || (err.signal && err.signal.includes('KILL'))) {
      output = '[TIMEOUT] ' + output;
    }
    return { ok: false, output };
  }
}

// ── Collect oracle scripts ────────────────────────────────────────────────────

// auto-descobre todos os oráculos verify*.js (novos são incluídos sem editar aqui)
const ORACLE_SCRIPTS = fs.readdirSync(__dirname)
  .filter((f) => /^verify.*\.js$/.test(f))
  .sort();

// ── Collect example form files via readdir ────────────────────────────────────

function collectForms() {
  const examplesDir = path.join(ROOT, 'examples');
  let files;
  try {
    files = fs.readdirSync(examplesDir);
  } catch (_e) {
    return [];
  }
  return files
    .filter((f) => /\.form\.tsx?$/.test(f))
    .sort()
    .map((f) => path.join('examples', f));
}

// ── Run all checks ────────────────────────────────────────────────────────────

const results = []; // { name, ok, output }

console.log('');
console.log('foxts regression runner');
console.log('='.repeat(60));

// 1. Oracle scripts
for (const script of ORACLE_SCRIPTS) {
  const scriptPath = path.join(ROOT, script);
  if (!fs.existsSync(scriptPath)) {
    results.push({ name: script, ok: false, output: `[NOT FOUND] ${scriptPath}` });
    console.log(`  running ${script} ... (not found)`);
    continue;
  }
  console.log(`  running ${script} ...`);
  const { ok, output } = run(process.execPath, [scriptPath], { timeout: 180000 });
  results.push({ name: script, ok, output });
  console.log(`    -> ${ok ? 'PASS' : 'FAIL'}`);
}

// 2. Form builds
const formFiles = collectForms();
const foxcPath = path.join(ROOT, 'foxc.js');

for (const formFile of formFiles) {
  const base = path.basename(formFile).replace(/\.form\.tsx?$/, '');
  const outScx = path.join('dist', base + '.scx');
  const label = `foxc build ${formFile}`;

  console.log(`  building ${formFile} ...`);
  const { ok, output } = run(process.execPath, [foxcPath, 'build', formFile, '-o', outScx], {
    timeout: 180000,
  });
  results.push({ name: label, ok, output });
  console.log(`    -> ${ok ? 'PASS' : 'FAIL'}`);
}

// ── Summary table ─────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length;
const total = results.length;

console.log('');
console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
const maxNameLen = Math.max(...results.map((r) => r.name.length), 10);
for (const r of results) {
  const status = r.ok ? 'OK  ' : 'FAIL';
  console.log(`  [${status}] ${r.name}`);
}
console.log('');
console.log(`${passed}/${total} checks passed`);
console.log('');

// ── Print output of failed checks ─────────────────────────────────────────────

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.log('='.repeat(60));
  console.log('FAILED CHECK OUTPUT');
  console.log('='.repeat(60));
  for (const r of failed) {
    console.log('');
    console.log(`--- ${r.name} ---`);
    console.log(r.output || '(no output)');
  }
  console.log('');
}

process.exit(passed === total ? 0 : 1);
