'use strict';
// verifybinddefault.js — Frente D / dívida técnica: default do membro de form
// vinculado por bind="campo" inferido do TIPO declarado do campo.
//
// Antes, todo membro de bind nascia com default "" (string). Um campo num() (ex.:
// idade) vinculado e validado por @Form({ validate: Schema }) ANTES de qualquer input
// comparava "" < n -> erro de runtime no VFP. Agora o transpilador infere o tipo do
// campo (do schema referenciado em validate, ou de um type= no controle) e emite o
// default correto: 0 (num), .F. (bool), "" (str).
//
// Prova em duas camadas:
//   (1) BUILD-TIME: a IR de examples/cadvalida.form.tsx tem idade.default == "0" e
//       nome/uf.default == '""'.
//   (2) RUNTIME (VFP): instancia o form NOSHOW, NÃO seta idade (fica no default 0,
//       tipo N), chama ThisForm.Validar() — antes isso daria erro "operador/operando"
//       ("" < 18); agora devolve "idade: minimo 18" e VARTYPE(idade) == "N".

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const layout = require('./layout');
const { transpileForm, finalizeFormIR } = require('./transpile');

const FOXCLI = require('./foxcli-path');

(async () => {
  if (process.env.FOXTS_LAYOUT !== 'flex' && await layout.loadYogaEngine()) layout.setEngine('yoga');

  const checks = [];
  const check = (label, cond, info) => { checks.push({ label, ok: !!cond, info: info || '' }); };

  // (1) build-time: defaults na IR
  const ir = finalizeFormIR(transpileForm(path.resolve('examples/cadvalida.form.tsx')));
  const memOf = (n) => (ir.members || []).find((m) => m.name.toLowerCase() === n);
  const idade = memOf('idade'), nome = memOf('nome'), uf = memOf('uf');
  check('idade (num) default = 0', idade && idade.default === '0', idade && `default=${idade.default}`);
  check('nome (str) default = ""', nome && nome.default === '""', nome && `default=${nome.default}`);
  check('uf (str) default = ""', uf && uf.default === '""', uf && `default=${uf.default}`);

  // (2) runtime no VFP
  const jsonPath = path.resolve('dist/cadvalida.json');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(ir, null, 2));
  const scx = path.resolve('dist/cadvalida.scx');
  const res = JSON.parse(execFileSync(FOXCLI, ['form', '--spec', jsonPath, '--out', scx, '--json'], { encoding: 'utf8' }));
  if (!res.ok) throw new Error('foxcli form falhou: ' + (res.errors || []).join('; '));

  // seta nome/uf (válidos) mas NÃO idade -> idade fica no default; Validar() deve
  // comparar 0 < 18 (numérico) e devolver a mensagem, sem erro de tipo.
  let drv = `DO FORM ("${scx}") NAME loF NOSHOW LINKED\n`;
  drv += 'loF.nome = "Ana"\nloF.uf = "SP"\n';
  drv += '? "V|" + loF.Validar()\n';
  drv += '? "T|" + VARTYPE(loF.idade)\n';
  drv += 'loF.Release()\n';
  const drvPath = path.resolve('dist', '_binddrv.prg');
  fs.writeFileSync(drvPath, drv, 'latin1');
  const raw = execFileSync(FOXCLI, ['run', drvPath, '--json', '--timeout', '60'], { encoding: 'utf8' });
  const stdout = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '');
  const map = {};
  for (const l of stdout.split(/\r?\n/)) { const i = l.indexOf('|'); if (i > 0) map[l.slice(0, i)] = l.slice(i + 1).replace(/\s+$/, ''); }
  check('Validar() sem input numerico -> mensagem (sem erro de tipo)', map.V === 'idade: minimo 18', `got=${JSON.stringify(map.V)}`);
  check('idade tem tipo N (numerico) no VFP', map.T === 'N', `VARTYPE=${JSON.stringify(map.T)}`);

  console.log('\n  default de membro de bind por tipo do campo (build + VFP)');
  console.log('  ' + '-'.repeat(58));
  let ok = 0;
  for (const c of checks) {
    if (c.ok) ok++;
    console.log(`  ${c.ok ? 'OK ' : 'XX '} ${c.label}${c.info ? '  (' + c.info + ')' : ''}`);
  }
  console.log('  ' + '-'.repeat(58));
  console.log(`\n  ${ok}/${checks.length} checks de default de bind\n`);
  process.exit(ok === checks.length ? 0 : 1);
})();
