#!/usr/bin/env node
// build.js — build de UM comando para uma pasta de projeto.
//   npm run build <pasta>        (ex.: npm run build showcase/totem-app)
//
// Detecta o tipo de projeto e faz o pipeline inteiro num passo so:
//   * projeto vfp (tem vfp.config.json)  -> `vfp pack`  (forms->SCX + servicos->PRG + EXE)
//   * projeto "solto" (tem build_exe.prg) -> compila os *.form.tsx -> .scx e roda o
//     build_exe.prg (ex.: o totem). O foxcli reporta "FALHOU" para scripts que dao
//     QUIT sem o protocolo dele — por isso a validacao e pelo ARTEFATO (EXE existe +
//     nenhum .err de compilacao), nao pelo exit do foxcli.
//
// Em QUALQUER erro mostra a saida real (erro de compilacao / .err / saida do foxcli),
// nunca um stack trace cru do Node.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const FOXCLI = require('./foxcli-path');

const log = (m) => console.log('[build] ' + m);
function fail(msg, out) {
  if (out && String(out).trim()) console.error(String(out).trim());
  console.error('[build] FALHOU: ' + msg);
  process.exit(1);
}

// roda um comando capturando stdout+stderr juntos. Nunca lanca: devolve { ok, out }.
function runCap(cmd, args, opts) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    return { ok: true, out: out || '' };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') || String(e.message || e) };
  }
}

const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') {
  console.log('uso: npm run build <pasta-do-projeto>\n  ex.: npm run build showcase/totem-app');
  process.exit(arg ? 0 : 1);
}
const root = path.resolve(arg);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail('pasta nao encontrada: ' + root);

const node = process.execPath;

// --- caminho 1: projeto vfp padrao (vfp.config.json) -> vfp pack ------------
if (fs.existsSync(path.join(root, 'vfp.config.json'))) {
  log(`projeto vfp em ${arg} -> vfp pack`);
  const r = runCap(node, [path.join(__dirname, 'vfp.js'), 'pack'], { cwd: root });
  if (r.out.trim()) console.log(r.out.trim());
  if (!r.ok) fail('vfp pack retornou erro (veja a saida acima)');
  log('OK');
  process.exit(0);
}

// --- caminho 2: projeto solto com build_exe.prg (ex.: totem) ----------------
const buildPrg = path.join(root, 'build_exe.prg');
const forms = fs.readdirSync(root).filter((f) => /\.form\.tsx?$/i.test(f));
if (!forms.length) fail(`nada para compilar em ${arg} (sem vfp.config.json e sem *.form.tsx)`);

// 1) cada *.form.tsx -> <nome>.scx (mesma pasta). Erro de compilacao -> mostra e para.
for (const f of forms) {
  const out = path.join(root, f.replace(/\.form\.tsx?$/i, '.scx'));
  log(`compilando ${f} -> ${path.basename(out)}`);
  const r = runCap(node, [path.join(__dirname, 'foxc.js'), 'build', path.join(root, f), '-o', out]);
  if (r.out.trim()) console.log(r.out.trim());
  if (!r.ok) fail(`erro ao compilar ${f} (veja o erro acima)`);
}

if (!fs.existsSync(buildPrg)) {
  log('sem build_exe.prg — SCX(s) prontos (EXE pulado)');
  process.exit(0);
}

// 2) limpa .err antigo (senao um erro de build anterior daria falso-positivo)
for (const f of fs.readdirSync(root).filter((f) => /\.err$/i.test(f))) fs.unlinkSync(path.join(root, f));

// 3) monta o EXE. Captura a saida do foxcli: ele reporta "FALHOU" para scripts custom
//    que dao QUIT, entao so mostramos isso se a validacao real (artefato) falhar.
log('montando EXE via build_exe.prg ...');
const fox = runCap(FOXCLI, ['run', buildPrg, '--timeout', '300']);

// 4) erro de compilacao do VFP? (Project.Build grava <exe>.err) -> falha de verdade
const errs = fs.readdirSync(root).filter((f) => /\.err$/i.test(f));
if (errs.length) {
  const errTxt = fs.readFileSync(path.join(root, errs[0]), 'latin1');
  fail(`erro de compilacao do VFP (${errs[0]})`, errTxt + '\n--- foxcli ---\n' + fox.out);
}
// 5) EXE gerado? (lido agora, com o vfp9 ja encerrado -> tamanho real, sem o "0 bytes"
//    do build_exe.prg que mede o FSIZE antes do flush). Sem EXE -> mostra a saida do foxcli.
const distDir = path.join(root, 'dist');
const exes = fs.existsSync(distDir) ? fs.readdirSync(distDir).filter((f) => /\.exe$/i.test(f)) : [];
if (!exes.length) fail('EXE nao encontrado em dist/ apos o build (rode "foxcli doctor")', fox.out);
for (const e of exes) log(`EXE pronto: dist\\${e} (${fs.statSync(path.join(distDir, e)).size} bytes)`);
log('OK');
