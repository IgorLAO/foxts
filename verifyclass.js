'use strict';
// verifyclass.js — prova a classe gerada de ponta a ponta:
//   examples/cliente.ts --(foxts)--> dist/cliente.prg --(foxcli/VFP)--> resultados
// instanciando o DEFINE CLASS no VFP e comparando com o MESMO .ts em Node (oraculo).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');
const { transpile } = require('./transpile');

const FOXCLI = require('./foxcli-path');
const SRC = path.resolve('examples/cliente.ts');
const PRG = path.resolve('dist/cliente.prg');
const DRV = path.resolve('dist/_driverclass.prg');
const ORACLE = path.resolve('dist/_clienteoracle.cjs');

// cenario: o MESMO roteiro nos dois backends -> lista de valores a comparar.
//   FoxPro: linhas que imprimem "CLS|<valor>"   |   Node: array de resultados.
const FOX = `SET PROCEDURE TO ("${PRG}") ADDITIVE
LOCAL oC
oC = CREATEOBJECT("Cliente")
oC.nome = "Joao"
? "CLS|" + oC.saudacao()
oC.deposita(100)
oC.deposita(50)
? "CLS|" + TRANSFORM(oC.saldo)
? "CLS|" + TRANSFORM(oC.bonus(0.1))
`;
function scenarioJS(mod) {
  const c = new mod.Cliente();
  c.nome = 'Joao';
  const r = [c.saudacao()];
  c.deposita(100);
  c.deposita(50);
  r.push(c.saldo);
  r.push(c.bonus(0.1));
  return r;
}
const jsToFox = (v) => (typeof v === 'boolean' ? (v ? '.T.' : '.F.') : String(v));

// 1. transpila TS -> FoxPro (DEFINE CLASS)
fs.mkdirSync(path.dirname(PRG), { recursive: true });
fs.writeFileSync(PRG, transpile(SRC), 'latin1');

// 2. oraculo: mesmo TS -> JS em Node
const jsSrc = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
  compilerOptions: { module: 'commonjs', target: 'es2020' },
}).outputText;
fs.writeFileSync(ORACLE, jsSrc);
const expected = scenarioJS(require(ORACLE)).map(jsToFox);

// 3. executa o cenario no VFP via foxcli
fs.writeFileSync(DRV, FOX, 'latin1');
const raw = execFileSync(FOXCLI, ['run', DRV, '--json', '--timeout', '60'], { encoding: 'utf8' });
const stdout = (JSON.parse(raw).stdout || '').replace(/\x1a/g, '');
const got = stdout.split(/\r?\n/).filter((l) => l.startsWith('CLS|')).map((l) => l.slice(4).trim());

// 4. compara
let ok = 0;
console.log('\n  passo                       VFP            JS (oraculo)');
console.log('  ' + '-'.repeat(56));
const LABELS = ['saudacao()', 'saldo apos 2 depositos', 'bonus(0.1)'];
expected.forEach((exp, i) => {
  const pass = got[i] === exp;
  if (pass) ok++;
  console.log(`  ${pass ? 'OK ' : 'XX '} ${LABELS[i].padEnd(24)} ${String(got[i]).padEnd(13)} ${exp}`);
});
console.log('  ' + '-'.repeat(56));
console.log(`\n  ${ok}/${expected.length} passos batem (DEFINE CLASS no VFP == JS)\n`);
process.exit(ok === expected.length ? 0 : 1);
