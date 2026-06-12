'use strict';
// verifycontain.js — Frente B (containers/pageframe): prova que o aninhamento VFP
// é REAL em runtime, não só geometria. Constrói os SCX de panel.form.tsx (containers)
// e pageframe.form.tsx (pageframe com páginas), instancia cada um NOSHOW LINKED no
// VFP e confere ControlCount dos containers/páginas + acesso aninhado (thisform.cnt1.x).
//
// É a prova do que destrava a Frente B: a coluna PARENT do SCX precisa ser o caminho
// pontilhado a partir da raiz do form (Form.cnt1, Form.pgf1.Page1) — o genscx qualifica.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const layout = require('./layout');
const { transpileForm, finalizeFormIR } = require('./transpile');

const FOXCLI = process.env.FOXCLI || 'C:\\projectos\\testesvf\\foxcli\\foxcli.exe';

function buildScx(tsRel, outRel) {
  const ir = finalizeFormIR(transpileForm(path.resolve(tsRel)));
  const jsonPath = path.resolve(outRel.replace(/\.scx$/, '.json'));
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(ir, null, 2));
  const scx = path.resolve(outRel);
  const res = JSON.parse(execFileSync(FOXCLI, ['form', '--spec', jsonPath, '--out', scx, '--json'], { encoding: 'utf8' }));
  if (!res.ok) throw new Error('foxcli form falhou: ' + (res.errors || []).join('; '));
  return scx;
}

// roda um driver VFP que imprime "K|valor" para cada expressão pedida.
function probe(scx, exprs) {
  let drv = `DO FORM ("${scx}") NAME loF NOSHOW LINKED\n`;
  for (const [k, e] of exprs) drv += `? "${k}|" + TRANSFORM(${e})\n`;
  drv += 'loF.Release()\n';
  const drvPath = path.resolve('dist', '_contdrv.prg');
  fs.writeFileSync(drvPath, drv, 'latin1');
  const raw = execFileSync(FOXCLI, ['run', drvPath, '--json', '--timeout', '60'], { encoding: 'utf8' });
  const stdout = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '');
  const map = {};
  for (const l of stdout.split(/\r?\n/)) { const i = l.indexOf('|'); if (i > 0) map[l.slice(0, i)] = l.slice(i + 1).trim(); }
  return map;
}

(async () => {
  if (process.env.FOXTS_LAYOUT !== 'flex' && await layout.loadYogaEngine()) layout.setEngine('yoga');

  const checks = [];
  const add = (name, cond, detail) => checks.push([name, !!cond, detail]);

  // ---- containers aninhados (panel.form.tsx) ----
  const panel = buildScx('examples/panel.form.tsx', 'dist/panel.scx');
  const p = probe(panel, [
    ['FORM', 'loF.ControlCount'],
    ['CNT1', 'loF.cnt1.ControlCount'],
    ['CNT2', 'loF.cnt2.ControlCount'],
    ['NOME', 'PEMSTATUS(loF.cnt1, "txtNome", 5)'],
    ['UF', 'PEMSTATUS(loF.cnt2, "txtUf", 5)'],
  ]);
  add('form tem 3 controles diretos (cnt1, cnt2, botao)', p.FORM === '3', `ControlCount=${p.FORM}`);
  add('cnt1 contem os 3 filhos (label + 2 textbox)', p.CNT1 === '3', `cnt1.ControlCount=${p.CNT1}`);
  add('cnt2 contem os 2 filhos (cidade, uf)', p.CNT2 === '2', `cnt2.ControlCount=${p.CNT2}`);
  add('acesso aninhado thisform.cnt1.txtNome', p.NOME === '.T.', `PEMSTATUS=${p.NOME}`);
  add('acesso aninhado thisform.cnt2.txtUf', p.UF === '.T.', `PEMSTATUS=${p.UF}`);

  // ---- pageframe com paginas (pageframe.form.tsx) ----
  const pf = buildScx('examples/pageframe.form.tsx', 'dist/pageframe.scx');
  const q = probe(pf, [
    ['FORM', 'loF.ControlCount'],
    ['PAGES', 'loF.pgf1.PageCount'],
    ['P1', 'loF.pgf1.Page1.ControlCount'],
    ['P2', 'loF.pgf1.Page2.ControlCount'],
    ['CAP1', 'loF.pgf1.Page1.Caption'],
    ['CAP2', 'loF.pgf1.Page2.Caption'],
    ['NEST', 'PEMSTATUS(loF.pgf1.Page1, "txtCliente", 5)'],
  ]);
  add('form tem 1 controle direto (o pageframe)', q.FORM === '1', `ControlCount=${q.FORM}`);
  add('pageframe tem 2 paginas', q.PAGES === '2', `PageCount=${q.PAGES}`);
  add('Page1 contem 4 controles', q.P1 === '4', `Page1.ControlCount=${q.P1}`);
  add('Page2 contem o grid', q.P2 === '1', `Page2.ControlCount=${q.P2}`);
  add('caption da Page1 preservado ("Dados")', q.CAP1 === 'Dados', `Caption=${q.CAP1}`);
  add('caption da Page2 preservado ("Itens")', q.CAP2 === 'Itens', `Caption=${q.CAP2}`);
  add('acesso aninhado thisform.pgf1.Page1.txtCliente', q.NEST === '.T.', `PEMSTATUS=${q.NEST}`);

  let pass = 0;
  console.log('\n  contencao VFP real (containers + pageframe), instanciado no VFP');
  console.log('  ' + '-'.repeat(58));
  for (const [name, okc, detail] of checks) { if (okc) pass++; console.log(`  ${okc ? 'OK ' : 'XX '} ${name}  (${detail})`); }
  console.log('  ' + '-'.repeat(58));
  console.log(`\n  ${pass}/${checks.length} checks de contencao\n`);
  process.exit(pass === checks.length ? 0 : 1);
})();
