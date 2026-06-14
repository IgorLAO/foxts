#!/usr/bin/env node
'use strict';
// foxc.js — orquestrador do pipeline completo:
//   <form.ts>  --(foxts: logica TS->FoxPro)-->  form.json  --(foxcli)-->  .scx/.sct
//
//   foxc build examples/dias.form.ts -o dist/frmdiasts.scx
//
// Lê o `export const form` (layout) avaliando o módulo, transpila as funções de
// lógica (export function ...) e as injeta como métodos do form, escreve a IR
// form.json e chama o foxcli. Se o módulo exportar `cases`, valida cada método
// transpilado JÁ DENTRO do SCX contra a mesma função rodando em Node (oráculo).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');
const { analyze, transpileForm, methodBodyText, finalizeFormIR } = require('./transpile');

const FOXCLI = process.env.FOXCLI || 'C:\\projectos\\testesvf\\foxcli\\foxcli.exe';

function emitJs(tsRel, outRel) {
  const js = ts.transpileModule(fs.readFileSync(tsRel, 'utf8'), {
    compilerOptions: { module: 'commonjs', target: 'es2020', experimentalDecorators: true },
  }).outputText;
  const p = path.resolve(outRel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, js);
  return p;
}

function loadModule(tsPath) {
  // compila as libs (tipos+runtime) para o oráculo resolver "../fox"/"../decorators"
  if (fs.existsSync('fox.ts')) emitJs('fox.ts', 'dist/fox.js');
  if (fs.existsSync('decorators.ts')) emitJs('decorators.ts', 'dist/decorators.js');
  // o módulo vai para dist/oracle/ — assim "../fox" aponta para dist/fox.js
  const jsPath = emitJs(tsPath, path.join('dist/oracle', path.basename(tsPath).replace(/\.tsx?$/, '') + '.cjs'));
  delete require.cache[jsPath];
  return require(jsPath);
}

const jsToFox = (v) => (typeof v === 'boolean' ? (v ? '.T.' : '.F.') : String(v));
const foxArg = (v) => (typeof v === 'string' ? `"${v}"` : String(v));

function build(tsPath, outScx) {
  // o oráculo (Node) só é necessário quando o módulo exporta `cases`; imports como
  // "@vfp/core" não resolvem em require — toleramos a falha e seguimos sem oráculo.
  let mod = {};
  try { mod = loadModule(tsPath); } catch (_e) { /* sem oráculo */ }
  const classIr = transpileForm(tsPath); // não-null se o arquivo for `class ... extends Form`

  let form, transpiled, oracleTarget;
  if (classIr) {
    // modo CLASSE: estrutura e métodos vêm da classe
    form = classIr;
    transpiled = Object.keys(form.methods);
    const Cls = mod.default || Object.values(mod).find((v) => typeof v === 'function' && /class/.test(v.toString().slice(0, 6)));
    oracleTarget = Cls ? new Cls() : mod;
  } else {
    // modo OBJETO: `export const form = {...}` + funções soltas
    if (!mod.form) throw new Error(`${tsPath} precisa de uma "class ... extends Form" ou "export const form = {...}"`);
    form = mod.form;
    const fns = analyze(tsPath);
    form.methods = form.methods || {};
    for (const fn of fns) form.methods[fn.name] = methodBodyText(fn);
    transpiled = fns.map((f) => f.name);
    oracleTarget = mod;
  }
  // liga botões a ThisForm.<método>() e registra membros custom (compartilhado c/ vfp)
  finalizeFormIR(form, transpiled);

  fs.mkdirSync('dist', { recursive: true });
  const jsonPath = path.resolve('dist', path.basename(tsPath).replace(/\.tsx?$/, '').replace(/\.form$/, '') + '.json');
  fs.writeFileSync(jsonPath, JSON.stringify(form, null, 2));

  console.log(`[foxc] ${tsPath}`);
  console.log(`[foxc]   lógica transpilada (TS -> FoxPro): ${transpiled.join(', ') || '(nenhuma)'}`);
  console.log(`[foxc]   IR -> ${jsonPath}`);

  const res = execFileSync(FOXCLI, ['form', '--spec', jsonPath, '--out', outScx, '--json'], { encoding: 'utf8' });
  const j = JSON.parse(res);
  console.log(`[foxc]   foxcli: ${j.ok ? 'OK' : 'FALHOU'}  ${j.output || (j.errors || []).join('; ')}`);
  if (!j.ok) process.exit(1);

  if (Array.isArray(mod.cases) && mod.cases.length) verify(outScx, oracleTarget, mod.cases);
}

// oráculo: chama cada método transpilado DENTRO do SCX e compara com a mesma
// função em Node — prova que a lógica TypeScript virou método VFP equivalente.
function verify(scx, mod, cases) {
  const scxAbs = path.resolve(scx);
  let drv = `DO FORM ("${scxAbs}") NAME loF NOSHOW LINKED\n`;
  for (const [fn, args] of cases) drv += `? "FOXC|" + TRANSFORM(loF.${fn}(${args.map(foxArg).join(', ')}))\n`;
  drv += 'loF.Release()\n';
  const drvPath = path.resolve('dist', '_driver.prg');
  fs.writeFileSync(drvPath, drv, 'latin1');

  const raw = execFileSync(FOXCLI, ['run', drvPath, '--json', '--timeout', '60'], { encoding: 'utf8' });
  const stdout = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '');
  const got = stdout.split(/\r?\n/).filter((l) => l.startsWith('FOXC|')).map((l) => l.slice(5).trim());

  let ok = 0;
  console.log('\n  método transpilado, chamado DENTRO do SCX     SCX/VFP        JS (oráculo)');
  console.log('  ' + '-'.repeat(66));
  cases.forEach(([fn, args], i) => {
    const expected = jsToFox(mod[fn](...args));
    const pass = got[i] === expected;
    if (pass) ok++;
    const call = `${fn}(${args.map((a) => JSON.stringify(a)).join(',')})`;
    console.log(`  ${pass ? 'OK ' : 'XX '} ${call.padEnd(38)} ${String(got[i]).padEnd(13)} ${expected}`);
  });
  console.log('  ' + '-'.repeat(66));
  console.log(`\n  ${ok}/${cases.length} métodos batem (lógica TS no SCX == JS)\n`);
  if (ok !== cases.length) process.exit(1);
}

// ---- CLI ----
const argv = process.argv.slice(2);
const cmd = argv[0];
const tsPath = argv[1];
let out = 'dist/form.scx';
const oi = argv.indexOf('-o');
if (oi >= 0 && argv[oi + 1]) out = argv[oi + 1];

if (cmd !== 'build' || !tsPath) {
  console.log('uso: foxc build <form.ts> [-o saida.scx]');
  process.exit(2);
}
(async () => {
  try {
    const layout = require('./layout'); // motor de layout: usa Yoga se disponível
    if (process.env.FOXTS_LAYOUT !== 'flex' && await layout.loadYogaEngine()) layout.setEngine('yoga');
    if (fs.existsSync('vfp.theme.json')) require('./transpile').setTheme(JSON.parse(fs.readFileSync('vfp.theme.json', 'utf8')));
    if (fs.existsSync('vfp.messages.json')) require('./transpile').setMessages(JSON.parse(fs.readFileSync('vfp.messages.json', 'utf8')));
    build(tsPath, out);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
})();
