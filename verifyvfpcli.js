'use strict';
// verifyvfpcli.js — end-to-end da CLI `vfp` num projeto throwaway.
// Cobre: new (scaffold), generate form/component/service/class (arquivos criados),
// build (SCX+PRG+app.prg+routes.json), pack (.pjx via foxcli) e run (executa main()).
// Cada sub-check emite "OK / XX" estilo dos outros oráculos.

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const ROOT   = __dirname;
const VFP    = path.join(ROOT, 'vfp.js');
const FOXCLI = require('./foxcli-path');

// --- helpers ------------------------------------------------------------------

const checks = [];
const add = (name, cond, detail) => checks.push([name, !!cond, detail || '']);

// Cria um projeto throwaway em temp e devolve o seu root.
function mkProj(name) {
  const dir = path.join(os.tmpdir(), name + '_' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function vfp(args, cwd) {
  return execFileSync(process.execPath, [VFP, ...args], {
    cwd: cwd || ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function tryVfp(args, cwd) {
  try { return { ok: true, out: vfp(args, cwd) }; }
  catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') }; }
}

// Lê listagem de caminhos relativos dentro de um dir (1 nível de profundidade recursivo).
function ls(dir) {
  const result = [];
  function walk(d, prefix) {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      const rel  = prefix ? prefix + '/' + f : f;
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else result.push(rel);
    }
  }
  walk(dir, '');
  return result;
}

// ==============================================================================
// TASK 1 — vfp new
// ==============================================================================

console.log('\n  vfp CLI: new / generate / build / pack / run');
console.log('  ' + '-'.repeat(58));

const PROJ = mkProj('testproj');
const ProjName = 'testproj';

// 1a. vfp new
const newRes = tryVfp(['new', PROJ]);
add('vfp new cria o diretório de projeto', newRes.ok, newRes.ok ? 'ok' : newRes.out.slice(0, 200));

// Verifica estrutura de scaffold.
// Nota: vfp new cria os diretórios src/* VAZIOS (sem arquivos dentro),
// então verificamos a existência do diretório (não de arquivos dentro dele).
const hasSrcForms  = fs.existsSync(path.join(PROJ, 'src', 'forms'));
const hasSrcComp   = fs.existsSync(path.join(PROJ, 'src', 'components'));
const hasSrcSvc    = fs.existsSync(path.join(PROJ, 'src', 'services'));
const hasSrcModel  = fs.existsSync(path.join(PROJ, 'src', 'models'));
const hasPkg       = fs.existsSync(path.join(PROJ, 'package.json'));
const hasTsconfig  = fs.existsSync(path.join(PROJ, 'tsconfig.json'));
const hasConfig    = fs.existsSync(path.join(PROJ, 'vfp.config.json'));
const hasMain      = fs.existsSync(path.join(PROJ, 'src', 'main.ts'));

add('scaffold tem src/forms', hasSrcForms, hasSrcForms ? 'dir existe' : 'ausente');
add('scaffold tem src/components', hasSrcComp, hasSrcComp ? 'dir existe' : 'ausente');
add('scaffold tem src/services', hasSrcSvc, hasSrcSvc ? 'dir existe' : 'ausente');
add('scaffold tem src/models', hasSrcModel, hasSrcModel ? 'dir existe' : 'ausente');
add('scaffold tem package.json', hasPkg, '');
add('scaffold tem tsconfig.json', hasTsconfig, '');
add('scaffold tem vfp.config.json', hasConfig, '');
add('scaffold tem src/main.ts', hasMain, '');

// ==============================================================================
// TASK 2 — vfp generate
// ==============================================================================

const genForm  = tryVfp(['generate', 'form',      'Cliente'], PROJ);
const genComp  = tryVfp(['generate', 'component',  'Busca'],  PROJ);
const genSvc   = tryVfp(['generate', 'service',   'Pedido'],  PROJ);
const genClass = tryVfp(['generate', 'class',     'Modelo'],  PROJ);

add('generate form cria src/forms/cliente.form.tsx',
  genForm.ok && fs.existsSync(path.join(PROJ, 'src/forms/cliente.form.tsx')),
  genForm.ok ? 'ok' : genForm.out.slice(0, 200));

add('generate component cria src/components/Busca.tsx',
  genComp.ok && fs.existsSync(path.join(PROJ, 'src/components/Busca.tsx')),
  genComp.ok ? 'ok' : genComp.out.slice(0, 200));

add('generate service cria src/services/Pedido.ts',
  genSvc.ok && fs.existsSync(path.join(PROJ, 'src/services/Pedido.ts')),
  genSvc.ok ? 'ok' : genSvc.out.slice(0, 200));

add('generate class cria src/classes/modelo.ts',
  genClass.ok && fs.existsSync(path.join(PROJ, 'src/classes/modelo.ts')),
  genClass.ok ? 'ok' : genClass.out.slice(0, 200));

// Conteúdo dos geradores
const formSrc = fs.existsSync(path.join(PROJ, 'src/forms/cliente.form.tsx'))
  ? fs.readFileSync(path.join(PROJ, 'src/forms/cliente.form.tsx'), 'utf8') : '';
const svcSrc = fs.existsSync(path.join(PROJ, 'src/services/Pedido.ts'))
  ? fs.readFileSync(path.join(PROJ, 'src/services/Pedido.ts'), 'utf8') : '';

add('form gerado tem @Form decorator', /@Form\b/.test(formSrc), formSrc.slice(0, 100));
add('form gerado tem classe ClienteForm', /class ClienteForm\b/.test(formSrc), '');
add('service gerado tem @Injectable', /@Injectable\b/.test(svcSrc), svcSrc.slice(0, 100));

// ==============================================================================
// TASK 3 — vfp build
// Adiciona um segundo form que tem uma rota, para cobrir routes.json.
// ==============================================================================

// Adiciona um form com @Route para gerar routes.json
const routedSrc = `import { Form, Route, FoxForm, Column, Label } from "@vfp/core";
@Route("pedido")
@Form({ caption: "Pedido", width: 400, height: 300 })
export class PedidoForm extends FoxForm {
  render() { return (<Column><Label caption="Pedido"/></Column>); }
}
`;
fs.writeFileSync(path.join(PROJ, 'src/forms/pedido.form.tsx'), routedSrc);

// main.ts simples que imprime algo (para o run)
const mainSrc = `export function main(): void { console.log("cli-test-ok"); }`;
fs.writeFileSync(path.join(PROJ, 'src/main.ts'), mainSrc);

const buildRes = tryVfp(['build'], PROJ);
add('vfp build termina sem erro', buildRes.ok, buildRes.ok ? buildRes.out.slice(-200) : buildRes.out.slice(0, 400));

const distFiles = ls(path.join(PROJ, 'dist'));

// forms compilados para SCX
const scxCount = distFiles.filter((f) => /\.scx$/i.test(f)).length;
add('build gerou pelo menos 2 SCX (ClienteForm + PedidoForm)',
  scxCount >= 2, `${scxCount} SCX encontrados`);

// app.prg gerado
const hasAppPrg = distFiles.includes('app.prg');
add('build gerou dist/app.prg', hasAppPrg, hasAppPrg ? 'ok' : distFiles.join(', '));

// app.prg tem SET PROCEDURE linkando o serviço
let appPrg = '';
if (hasAppPrg) appPrg = fs.readFileSync(path.join(PROJ, 'dist/app.prg'), 'utf8');
add('app.prg tem SET PROCEDURE para linkar PRGs', /SET PROCEDURE/.test(appPrg), appPrg.slice(0, 300));

// main.prg gerado
const hasMainPrg = distFiles.some((f) => /main\.prg$/i.test(f));
add('build gerou main.prg', hasMainPrg, distFiles.filter((f) => /\.prg$/.test(f)).join(', '));

// PRG do serviço gerado
const hasSvcPrg = distFiles.some((f) => /Pedido\.prg$/i.test(f));
add('build gerou PRG para o servico (Pedido.prg)', hasSvcPrg, '');

// routes.json com a @Route gerada
const routesPath = path.join(PROJ, 'dist/routes.json');
const hasRoutes = fs.existsSync(routesPath);
add('build gerou dist/routes.json (pela @Route)', hasRoutes, hasRoutes ? 'ok' : 'ausente');
if (hasRoutes) {
  const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  add('routes.json mapeia "pedido" -> PedidoForm',
    routes.routes && routes.routes.pedido === 'PedidoForm',
    JSON.stringify(routes));
}

// manifesto de forms
const hasManifest = fs.existsSync(path.join(PROJ, 'dist/forms/forms.manifest.json'));
add('build gerou forms.manifest.json', hasManifest, hasManifest ? 'ok' : distFiles.join(', '));

// build output menciona SCX + PRG
add('build reporta contagem de SCX + PRG', /SCX.*PRG|PRG.*SCX/.test(buildRes.out), buildRes.out.trim().slice(-150));

// ==============================================================================
// TASK 4 — vfp pack (requer vfp.json e foxcli)
// ==============================================================================

// O pack gera vfp.json + chama foxcli build para criar .pjx + .exe.
// Verifca que o vfp.json existe (sempre) e tenta o pack (pode falhar se foxcli nao compila
// o projeto throwaway, mas anota o resultado honestamente).
const hasVfpJson = fs.existsSync(path.join(PROJ, 'dist/vfp.json'));
add('build gerou dist/vfp.json (manifesto para pack)', hasVfpJson, hasVfpJson ? 'ok' : 'ausente');

let packRes;
if (fs.existsSync(FOXCLI)) {
  packRes = tryVfp(['pack'], PROJ);
  // O pack é bem-sucedido se o foxcli compila; pode falhar se os PRGs gerados têm
  // erros (o scaffold gerado tem conteúdo mínimo mas válido). Registramos o resultado.
  const pjxFiles = ls(path.join(PROJ, 'dist')).filter((f) => /\.pjx$/i.test(f));
  add('vfp pack produz .pjx no dist/', packRes.ok && pjxFiles.length > 0,
    packRes.ok ? `pjx: ${pjxFiles.join(', ')}` : 'pack: ' + packRes.out.slice(0, 300));
} else {
  add('vfp pack produz .pjx no dist/', false, 'foxcli nao encontrado: ' + FOXCLI);
}

// ==============================================================================
// TASK 5 — vfp run (executa main() no VFP e captura stdout)
// ==============================================================================

if (fs.existsSync(FOXCLI)) {
  const runRes = tryVfp(['run'], PROJ);
  // main() imprime "cli-test-ok" via console.log -> ? no PRG
  add('vfp run executa main() e imprime a saida esperada',
    runRes.ok && /cli-test-ok/.test(runRes.out),
    runRes.ok ? runRes.out.trim().slice(-200) : runRes.out.slice(0, 300));
} else {
  add('vfp run executa main() e imprime a saida esperada', false, 'foxcli nao encontrado: ' + FOXCLI);
}

// ==============================================================================
// Resultado final
// ==============================================================================

let pass = 0;
for (const [name, okc, detail] of checks) {
  if (okc) pass++;
  console.log(`  ${okc ? 'OK ' : 'XX '} ${name}${detail ? '  (' + detail + ')' : ''}`);
}
console.log('  ' + '-'.repeat(58));
console.log(`\n  ${pass}/${checks.length} checks da CLI vfp\n`);

// Limpa o diretório temporário
try { fs.rmSync(PROJ, { recursive: true, force: true }); } catch (_) {}

process.exit(pass === checks.length ? 0 : 1);
