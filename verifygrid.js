'use strict';
// verifygrid.js — Frente B (<Grid> com COLUNAS REAIS): prova que o grid gerado a
// partir de <Grid source><GridColumn/></Grid> tem colunas nativas do VFP (ColumnCount
// + ColumnN.ControlSource/Width + Header1.Caption) e VINCULA de verdade ao cursor.
//
// Constrói o SCX de examples/grid.form.tsx (que abre o cursor "curClientes" no Load),
// instancia NOSHOW LINKED e confere: nº de colunas, RecordSource, ControlSource e
// largura por coluna, captions de header (reaplicados no Init pós-vinculação) e que
// a grade enxerga as 3 linhas do cursor.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const layout = require('./layout');
const { transpileForm, finalizeFormIR } = require('./transpile');

const FOXCLI = require('./foxcli-path');

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

// instancia o form e imprime "K|valor" para cada expressão pedida.
function probe(scx, exprs) {
  let drv = `DO FORM ("${scx}") NAME loF NOSHOW LINKED\n`;
  for (const [k, e] of exprs) drv += `? "${k}|" + TRANSFORM(${e})\n`;
  drv += 'loF.Release()\n';
  const drvPath = path.resolve('dist', '_griddrv.prg');
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

  const scx = buildScx('examples/grid.form.tsx', 'dist/grid.scx');
  const g = probe(scx, [
    ['COLS', 'loF.grd1.ColumnCount'],
    ['RS', 'loF.grd1.RecordSource'],
    ['CS1', 'loF.grd1.Column1.ControlSource'],
    ['CS3', 'loF.grd1.Column3.ControlSource'],
    ['W1', 'loF.grd1.Column1.Width'],
    ['H1', 'loF.grd1.Column1.Header1.Caption'],
    ['H2', 'loF.grd1.Column2.Header1.Caption'],
    ['H3', 'loF.grd1.Column3.Header1.Caption'],
    ['ROWS', 'RECCOUNT("curClientes")'],
  ]);

  add('grid tem 3 colunas reais (ColumnCount)', g.COLS === '3', `ColumnCount=${g.COLS}`);
  add('RecordSource ligado ao cursor', /curClientes/i.test(g.RS || ''), `RecordSource=${g.RS}`);
  add('Column1 vincula curClientes.nome', /curClientes\.nome/i.test(g.CS1 || ''), `ControlSource=${g.CS1}`);
  add('Column3 vincula curClientes.limite', /curClientes\.limite/i.test(g.CS3 || ''), `ControlSource=${g.CS3}`);
  add('largura da Column1 preservada (220)', g.W1 === '220', `Width=${g.W1}`);
  add('header da Column1 reaplicado ("Nome")', g.H1 === 'Nome', `Header1.Caption=${g.H1}`);
  add('header da Column2 reaplicado ("UF")', g.H2 === 'UF', `Header1.Caption=${g.H2}`);
  add('header da Column3 reaplicado ("Limite")', g.H3 === 'Limite', `Header1.Caption=${g.H3}`);
  add('grade enxerga as 3 linhas do cursor', g.ROWS === '3', `RECCOUNT=${g.ROWS}`);

  let pass = 0;
  console.log('\n  <Grid> com colunas reais, instanciado e vinculado no VFP');
  console.log('  ' + '-'.repeat(58));
  for (const [name, okc, detail] of checks) { if (okc) pass++; console.log(`  ${okc ? 'OK ' : 'XX '} ${name}  (${detail})`); }
  console.log('  ' + '-'.repeat(58));
  console.log(`\n  ${pass}/${checks.length} checks de grid\n`);
  process.exit(pass === checks.length ? 0 : 1);
})();
