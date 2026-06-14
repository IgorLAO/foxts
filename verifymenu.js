'use strict';
// verifymenu.js — Frente G: o menu gerado (PROCEDURE mainMenu) monta um menu de barra
// REAL do VFP. Transpila examples/menu.ts, roda DO mainMenu e introspecta o menu com
// as funções nativas (CNTPAD/PRMPAD/CNTBAR/PRMBAR): nº de pads, prompts, nº de bars por
// popup (separador conta como bar) e prompts dos bars. Prova estrutura sem UI.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { transpile } = require('./transpile');

const FOXCLI = require('./foxcli-path');
const SRC = path.resolve('examples/menu.ts');
const PRG = path.resolve('dist/menu.prg');
const DRV = path.resolve('dist/_menudrv.prg');

fs.mkdirSync(path.dirname(PRG), { recursive: true });
const prg = transpile(SRC);
fs.writeFileSync(PRG, prg, 'latin1');

// [chave, expressão VFP, esperado]
const PROBES = [
  ['PADS', 'TRANSFORM(CNTPAD("mainMenu"))', '2'],
  ['PAD1', 'PRMPAD("mainMenu", "_pad1")', 'Arquivo'],
  ['PAD2', 'PRMPAD("mainMenu", "_pad2")', 'Cadastros'],
  ['ARQBARS', 'TRANSFORM(CNTBAR("_pop1"))', '3'],   // Novo Cliente, separador, Sair
  ['ARQB1', 'PRMBAR("_pop1", 1)', 'Novo Cliente'],
  ['ARQB3', 'PRMBAR("_pop1", 3)', 'Sair'],
  ['CADBARS', 'TRANSFORM(CNTBAR("_pop2"))', '1'],
  ['CADB1', 'PRMBAR("_pop2", 1)', 'Clientes'],
];

let drv = `SET PROCEDURE TO ("${PRG}") ADDITIVE\nDO mainMenu\n`;
for (const [k, e] of PROBES) drv += `? "${k}|" + ${e}\n`;
drv += 'RELEASE MENU mainMenu EXTENDED\n';
fs.writeFileSync(DRV, drv, 'latin1');

const raw = execFileSync(FOXCLI, ['run', DRV, '--json', '--timeout', '60'], { encoding: 'utf8' });
const stdout = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '');
const map = {};
for (const l of stdout.split(/\r?\n/)) { const i = l.indexOf('|'); if (i > 0) map[l.slice(0, i)] = l.slice(i + 1).replace(/\s+$/, ''); }

// extra (build-time): a ação de navegação virou DO FORM no ON SELECTION
const navOk = /ON SELECTION BAR 1 OF _pop1 DO FORM ClienteForm/.test(prg);

let ok = 0;
const total = PROBES.length + 1;
console.log('\n  menu de barra VFP (DEFINE MENU/PAD/POPUP/BAR), montado no VFP');
console.log('  ' + '-'.repeat(54));
for (const [k, , exp] of PROBES) {
  const got = map[k] === undefined ? '<sem saida>' : map[k];
  const pass = got === exp;
  if (pass) ok++;
  console.log(`  ${pass ? 'OK ' : 'XX '} ${k.padEnd(9)} ${JSON.stringify(got)}${pass ? '' : ' != ' + JSON.stringify(exp)}`);
}
if (navOk) ok++;
console.log(`  ${navOk ? 'OK ' : 'XX '} NAV       bar(ClienteForm) -> "DO FORM ClienteForm"`);
console.log('  ' + '-'.repeat(54));
console.log(`\n  ${ok}/${total} checks de menu\n`);
process.exit(ok === total ? 0 : 1);
