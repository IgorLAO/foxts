'use strict';
// verifyanalyze.js — auto-teste PURO NODE do analisador estatico (analyze.js).
// NAO usa VFP nem foxcli. Cria uma fixture temporaria com problemas conhecidos,
// roda analyze() e confere contagens + cada regra disparada o numero esperado de
// vezes, garantindo tambem que variavel bem declarada (LOCAL) NAO e flaggada.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyze } = require('./analyze');

// ── fixture temporaria ───────────────────────────────────────────────────────

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foxts-analyze-'));

// PRG 1: rotina com SELECT *, SCAN sem FOR, var sem declaracao e var declarada.
const prg1 = [
  '* cabecalho de comentario com SELECT * que NAO deve contar',
  'DEFINE CLASS MeuForm AS Form',
  '',
  'PROCEDURE carrega',
  '  LOCAL lnTotal',
  '  lnTotal = 0',                     // declarada -> NAO flagga
  '  SELECT * FROM clientes INTO CURSOR c1', // select-star (1)
  '  SCAN',                            // scan-no-index (1)
  '    lnTotal = lnTotal + 1',         // ja declarada -> NAO flagga
  '    lcNome = nome',                 // undeclared-var (1)  lcNome nunca declarado
  '  ENDSCAN',
  'ENDPROC',
  '',
  'ENDDEFINE',
].join('\r\n');

// PRG 2: outra rotina com mais um SELECT *, um SCAN COM FOR (NAO conta),
// e mais uma var sem declaracao. Tem string com "SELECT *" que NAO deve contar.
const prg2 = [
  'PROCEDURE relatorio',
  '  LPARAMETERS tcFiltro',
  '  LOCAL lcSql',
  '  lcSql = "SELECT * FROM x"',       // dentro de string -> NAO conta
  '  SELECT * FROM pedidos',           // select-star (1)
  '  SCAN FOR valor > 0',              // tem FOR -> NAO conta
  '    lnQtd = 1',                     // undeclared-var (1) lnQtd nunca declarado
  '  ENDSCAN',
  'ENDPROC',
].join('\r\n');

fs.writeFileSync(path.join(tmpDir, 'um.prg'), prg1, 'latin1');
fs.writeFileSync(path.join(tmpDir, 'dois.prg'), prg2, 'latin1');

// arquivos que so contam (nao parseiam)
fs.writeFileSync(path.join(tmpDir, 'tela.scx'), 'binario-fake', 'latin1');
fs.writeFileSync(path.join(tmpDir, 'lib.vcx'), 'binario-fake', 'latin1');
fs.writeFileSync(path.join(tmpDir, 'app.ts'), 'export class Foo { bar() { return 1; } }\n', 'utf8');

// pasta ignorada — nada aqui deve aparecer
fs.mkdirSync(path.join(tmpDir, 'node_modules'));
fs.writeFileSync(path.join(tmpDir, 'node_modules', 'lixo.prg'), 'SELECT * FROM y', 'latin1');

// ── executa ──────────────────────────────────────────────────────────────────

const report = analyze(tmpDir);

// helper de contagem por regra
function countRule(rule) {
  return report.findings.filter((f) => f.rule === rule).length;
}
function flaggedNames(rule) {
  return report.findings
    .filter((f) => f.rule === rule)
    .map((f) => f.message);
}

// ── checagens ────────────────────────────────────────────────────────────────

const checks = [];
function check(desc, cond) {
  checks.push({ desc, ok: !!cond });
}

// contagens estruturais
check('PRGs == 2', report.counts.prg === 2);
check('SCX == 1', report.counts.scx === 1);
check('VCX == 1', report.counts.vcx === 1);
check('TS == 1', report.counts.ts === 1);
check('classes >= 2 (DEFINE CLASS + class TS)', report.counts.classes >= 2);
check('funcoes >= 2 (2 PROCEDURE)', report.counts.functions >= 2);

// regras: numero exato de disparos
check('select-star == 2', countRule('select-star') === 2);
check('scan-no-index == 1', countRule('scan-no-index') === 1);
check('undeclared-var == 2', countRule('undeclared-var') === 2);

// guarda contra falso positivo: var declarada (lnTotal, lcSql) NAO pode aparecer
const undeclMsgs = flaggedNames('undeclared-var').join(' | ').toLowerCase();
check("lnTotal (LOCAL) NAO flaggada", !undeclMsgs.includes('lntotal'));
check("lcSql (LOCAL) NAO flaggada", !undeclMsgs.includes('lcsql'));
check("tcFiltro (LPARAMETERS) NAO flaggada", !undeclMsgs.includes('tcfiltro'));

// as vars realmente sem declaracao precisam estar la
check("lcNome flaggada", undeclMsgs.includes('lcnome'));
check("lnQtd flaggada", undeclMsgs.includes('lnqtd'));

// node_modules ignorado: nenhum achado de lixo.prg
const fromNodeMod = report.findings.some((f) => f.file.includes('node_modules'));
check('node_modules ignorado', !fromNodeMod);

// totals coerente com findings
check('totals.findings == findings.length', report.totals.findings === report.findings.length);

// ── saida ────────────────────────────────────────────────────────────────────

let ok = 0;
console.log('');
for (const c of checks) {
  console.log(`  ${c.ok ? 'OK' : 'XX'}  ${c.desc}`);
  if (c.ok) ok++;
}
console.log('');
console.log(`  ${ok}/${checks.length} checagens passaram`);
console.log('');

// limpeza da fixture
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch (_e) { /* ignora */ }

process.exit(ok === checks.length ? 0 : 1);
