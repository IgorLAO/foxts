'use strict';
// verifymenuwire.js — Frente G: o `vfp build` wira o menu no bootstrap. Monta um
// projeto-fixture mínimo (um form de entrada + um models/appmenu.ts com menu()),
// roda `node vfp.js build` de verdade e confere que o dist/app.prg gerado tem o
// `DO appMenu` LINKADO (após os SET PROCEDURE) e ATIVADO antes do form de entrada.
// (É build-time: app.prg roda READ EVENTS, que bloquearia headless.)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const FIX = path.join(ROOT, 'dist', '_wirefix');

function write(rel, content) {
  const p = path.join(FIX, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// 1. fixture
fs.rmSync(FIX, { recursive: true, force: true });
write('vfp.config.json', JSON.stringify({ entry: 'HomeForm' }, null, 2));
write('src/forms/home.form.tsx', `import { Form, Column, Label } from "@vfp/core";
@Form({ caption: "Home", width: 300, height: 200 })
export class HomeForm {
  render() { return (<Column gap={8}><Label caption="Bem-vindo" /></Column>); }
}
`);
write('src/models/appmenu.ts', `import { menu, pad, bar } from "@vfp/core";
declare class HomeForm {}
export const appMenu = menu([
  pad("Arquivo", [ bar("Inicio", HomeForm), bar("Sair", "CLEAR EVENTS") ]),
]);
`);

// 2. roda o build real (cwd = fixture)
let buildOut = '';
try {
  buildOut = execFileSync(process.execPath, [path.join(ROOT, 'vfp.js'), 'build'], { cwd: FIX, encoding: 'utf8' });
} catch (e) {
  console.error('build falhou:\n' + ((e.stdout || '') + (e.stderr || '')));
  process.exit(1);
}

// 3. confere o app.prg
const appPrg = fs.readFileSync(path.join(FIX, 'dist', 'app.prg'), 'utf8');
const lines = appPrg.split(/\r?\n/);
const idxDo = lines.findIndex((l) => /^DO appMenu\b/.test(l.trim()));
const idxForm = lines.findIndex((l) => /DO FORM .*HomeForm\.scx/.test(l));
const lastSetProc = lines.reduce((acc, l, i) => /^SET PROCEDURE/.test(l.trim()) ? i : acc, -1);

const checks = [];
const add = (name, cond, detail) => checks.push([name, !!cond, detail]);
add('build reportou o menu wirado', /menu: appMenu/.test(buildOut), buildOut.split(/\r?\n/).find((l) => /menu:/.test(l)) || '(sem linha menu:)');
add('app.prg tem "DO appMenu"', idxDo >= 0, idxDo >= 0 ? lines[idxDo].trim() : '(ausente)');
add('DO appMenu vem DEPOIS dos SET PROCEDURE', idxDo > lastSetProc && lastSetProc >= 0, `DO@${idxDo} > SETPROC@${lastSetProc}`);
add('DO appMenu vem ANTES do DO FORM de entrada', idxDo >= 0 && idxForm >= 0 && idxDo < idxForm, `DO@${idxDo} < FORM@${idxForm}`);

let pass = 0;
console.log('\n  vfp build wira o menu no app.prg');
console.log('  ' + '-'.repeat(52));
for (const [name, okc, detail] of checks) { if (okc) pass++; console.log(`  ${okc ? 'OK ' : 'XX '} ${name}  (${detail})`); }
console.log('  ' + '-'.repeat(52));
console.log(`\n  ${pass}/${checks.length} checks de wiring de menu\n`);

fs.rmSync(FIX, { recursive: true, force: true }); // limpa o fixture
process.exit(pass === checks.length ? 0 : 1);
