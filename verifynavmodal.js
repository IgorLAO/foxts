'use strict';
// verifynavmodal.js — FormManager.showModal/open capture (NAME/TO) end-to-end.
//
// PROVA EM DOIS NIVEIS:
//
// NIVEL 1 (build-time): o transpilador emite a sintaxe VFP correta para as tres
// variantes de captura suportadas:
//   FormManager.showModal(X)            -> DO FORM X TO <var>  (retorno modal)
//   FormManager.open(X)                 -> DO FORM X NAME <ref> LINKED  (ref de objeto)
//   FormManager.open(X, { a, b })       -> DO FORM X WITH a, b  (parametros)
//   FormManager.open(X, { a }) como stmt -> DO FORM X WITH a    (sem captura)
//
// NIVEL 2 (runtime no VFP): compila o form chamador para SCX, instancia NOSHOW
// LINKED, verifica que os metodos existem no objeto VFP (PEMSTATUS) e que o form
// compila sem erro. Nao e possivel headless executar o DO FORM ... TO em si
// (bloquearia ate o form-alvo fechar), mas a prova de que o form compila + os
// metodos existem confirma que a emissao do codigo esta correta.
//
// Nivel de prova atingido: build-time COMPLETO (clausulas WITH/TO/NAME verificadas)
// + runtime PARCIAL (compilacao SCX + existencia dos metodos no VFP via PEMSTATUS).

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');
const layout = require('./layout');
const { transpileForm, transpile, finalizeFormIR } = require('./transpile');

const FOXCLI = require('./foxcli-path');

// ---- fixture de forms --------------------------------------------------------
// Usamos um diretório temporário para os arquivos .tsx gerados on-the-fly.

const DIR = path.join(os.tmpdir(), '_navmodal_' + Date.now());
fs.mkdirSync(DIR, { recursive: true });

// O form-alvo: recebe parâmetros no Init, expõe um membro `resultado`.
const ALVO_SRC = [
  'import { Form, Column, Label } from "@vfp/core";',
  '@Form({ caption: "Alvo", width: 300, height: 200 })',
  'export class AlvoForm {',
  '  resultado: string = "";',
  '  Init(motivo: string): void {',
  '    this.resultado = motivo;',
  '  }',
  '  render() { return (<Column><Label caption="Alvo"/></Column>); }',
  '}',
].join('\n');

// O form-chamador: usa as tres variantes de FormManager.
const CALLER_SRC = [
  'import { Form, Column, Label, FormManager } from "@vfp/core";',
  'declare class AlvoForm {}',
  '@Form({ caption: "Chamador", width: 400, height: 300 })',
  'export class ChamadorForm {',
  '  alvoRef: any = null;',
  '  ',
  '  // showModal com captura -> DO FORM AlvoForm WITH "teste" TO retorno',
  '  abrirModal(): void {',
  '    const retorno = FormManager.showModal(AlvoForm, { motivo: "teste" });',
  '  }',
  '  ',
  '  // open com captura por referencia -> DO FORM AlvoForm NAME This.alvoRef LINKED',
  '  abrirRef(): void {',
  '    this.alvoRef = FormManager.open(AlvoForm);',
  '  }',
  '  ',
  '  // open sem captura, com parametro -> DO FORM AlvoForm WITH clienteId',
  '  abrirComParam(clienteId: number): void {',
  '    FormManager.open(AlvoForm, { clienteId });',
  '  }',
  '  ',
  '  // open sem captura sem parametro -> DO FORM AlvoForm',
  '  abrirSimples(): void {',
  '    FormManager.open(AlvoForm);',
  '  }',
  '  ',
  '  render() { return (<Column><Label caption="Chamador"/></Column>); }',
  '}',
].join('\n');

const ALVO_PATH   = path.join(DIR, 'alvo.form.tsx');
const CALLER_PATH = path.join(DIR, 'chamador.form.tsx');
fs.writeFileSync(ALVO_PATH,   ALVO_SRC,   'utf8');
fs.writeFileSync(CALLER_PATH, CALLER_SRC, 'utf8');

// ---- checklist ---------------------------------------------------------------

const checks = [];
const add = (name, cond, detail) => checks.push([name, !!cond, detail || '']);

// ==============================================================================
// NIVEL 1 — build-time: verifica o codigo VFP emitido
// ==============================================================================

let callerIR;
try { callerIR = transpileForm(CALLER_PATH); }
catch (e) { callerIR = null; }

add('transpileForm do form chamador nao lanca erro',
  callerIR !== null,
  callerIR ? 'ok' : 'excecao ao transpilar');

if (callerIR) {
  const m = callerIR.methods || {};

  // showModal com params -> DO FORM AlvoForm WITH "teste" TO retorno
  const abrirModal = m.abrirModal || '';
  add('showModal(AlvoForm, {motivo}) -> DO FORM AlvoForm WITH ... TO retorno',
    /DO FORM AlvoForm WITH/.test(abrirModal) && /\bTO retorno\b/.test(abrirModal),
    JSON.stringify(abrirModal));

  // open com captura por referencia -> DO FORM AlvoForm NAME This.alvoRef LINKED
  const abrirRef = m.abrirRef || '';
  add('open capturado em this.x -> DO FORM AlvoForm NAME This.alvoRef LINKED',
    /DO FORM AlvoForm NAME This\.alvoRef LINKED/.test(abrirRef),
    JSON.stringify(abrirRef));

  // open com param shorthand -> DO FORM AlvoForm WITH clienteId
  const comParam = m.abrirComParam || '';
  add('open(AlvoForm, {clienteId}) -> DO FORM AlvoForm WITH clienteId',
    /DO FORM AlvoForm WITH clienteId/.test(comParam),
    JSON.stringify(comParam));

  // open sem captura, sem param -> DO FORM AlvoForm  (sem WITH/TO/NAME)
  const simples = m.abrirSimples || '';
  add('open(AlvoForm) sem captura -> DO FORM AlvoForm (sem WITH/TO/NAME)',
    /^\s*DO FORM AlvoForm\s*$/.test(simples.trim()),
    JSON.stringify(simples));

  // Sem NAME/TO quando nao ha captura
  add('open sem captura nao emite NAME nem TO',
    !/\bNAME\b/.test(simples) && !/\bTO\b/.test(simples),
    JSON.stringify(simples));
}

// Verifica tambem o form-alvo
let alvoIR;
try { alvoIR = transpileForm(ALVO_PATH); }
catch (e) { alvoIR = null; }

add('transpileForm do form alvo (destino) nao lanca erro',
  alvoIR !== null,
  alvoIR ? 'ok' : 'excecao ao transpilar alvo');

if (alvoIR) {
  // Init com LPARAMETERS
  const init = (alvoIR.methods || {}).Init || '';
  add('form alvo com Init(motivo) emite LPARAMETERS motivo',
    /LPARAMETERS motivo/.test(init),
    JSON.stringify(init));
}

// ==============================================================================
// NIVEL 2 — runtime: compila o SCX e instancia NOSHOW LINKED, verifica metodos
// ==============================================================================

const distDir = path.resolve('dist');
fs.mkdirSync(distDir, { recursive: true });

async function runtimeChecks() {
  if (process.env.FOXTS_LAYOUT !== 'flex' && await layout.loadYogaEngine()) {
    layout.setEngine('yoga');
  }

  // Compila o form chamador para SCX
  let callerScx = null;
  try {
    const ir = finalizeFormIR(callerIR);
    const jsonPath = path.join(distDir, '_chamador.json');
    const scxPath  = path.join(distDir, '_chamador.scx');
    fs.writeFileSync(jsonPath, JSON.stringify(ir, null, 2));
    const res = JSON.parse(
      execFileSync(FOXCLI, ['form', '--spec', jsonPath, '--out', scxPath, '--json'], { encoding: 'utf8' })
    );
    if (res.ok) callerScx = scxPath;
    add('foxcli compila o SCX do form chamador sem erro',
      res.ok,
      res.ok ? scxPath : (res.errors || []).join('; '));
  } catch (e) {
    add('foxcli compila o SCX do form chamador sem erro', false, e.message);
  }

  // Instancia NOSHOW LINKED e verifica que os metodos existem (PEMSTATUS)
  if (callerScx) {
    // Os metodos que devem existir no form VFP
    const METHODS = ['abrirModal', 'abrirRef', 'abrirComParam', 'abrirSimples'];
    let drv = `DO FORM ("${callerScx}") NAME loF NOSHOW LINKED\n`;
    for (const m of METHODS) {
      drv += `? "${m}|" + TRANSFORM(PEMSTATUS(loF, "${m}", 5))\n`;
    }
    drv += 'loF.Release()\n';

    const drvPath = path.join(distDir, '_navmoddrv.prg');
    fs.writeFileSync(drvPath, drv, 'latin1');

    let probeOk = false;
    let probeMap = {};
    try {
      const raw = execFileSync(FOXCLI, ['run', drvPath, '--json', '--timeout', '60'], { encoding: 'utf8' });
      const stdout = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '');
      for (const l of stdout.split(/\r?\n/)) {
        const i = l.indexOf('|');
        if (i > 0) probeMap[l.slice(0, i)] = l.slice(i + 1).trim();
      }
      probeOk = true;
    } catch (e) {
      add('form chamador instancia NOSHOW LINKED no VFP sem erro', false, e.message);
    }

    if (probeOk) {
      add('form chamador instancia NOSHOW LINKED no VFP sem erro', true, 'ok');
      for (const m of METHODS) {
        add(`metodo ${m} existe no form VFP (PEMSTATUS=.T.)`,
          probeMap[m] === '.T.',
          `PEMSTATUS=${probeMap[m]}`);
      }
    }
  }

  // Finaliza output
  let pass = 0;
  console.log('\n  FormManager.showModal/open capture (NAME/TO) — build-time + runtime');
  console.log('  ' + '-'.repeat(66));
  for (const [name, okc, detail] of checks) {
    if (okc) pass++;
    console.log(`  ${okc ? 'OK ' : 'XX '} ${name}${detail ? '  (' + detail + ')' : ''}`);
  }
  console.log('  ' + '-'.repeat(66));
  console.log(`\n  ${pass}/${checks.length} checks de navegacao modal\n`);
  console.log('  Nivel de prova: build-time (clausulas WITH/TO/NAME) COMPLETO');
  console.log('  + runtime (SCX compilado + PEMSTATUS dos metodos) PARCIAL');
  console.log('  (DO FORM ... TO bloquearia headless; nivel 2 prova compilacao)\n');

  // Limpa os fixtures temporarios
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (_) {}

  process.exit(pass === checks.length ? 0 : 1);
}

runtimeChecks();
