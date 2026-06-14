#!/usr/bin/env node
'use strict';
// vfp.js — CLI de projeto no estilo Angular/Nest para o foxts.
//
//   vfp new <projeto>            scaffold de um projeto (src/, config, tsconfig)
//   vfp generate form <Nome>     cria src/forms/<nome>.form.ts
//   vfp generate class <Nome>    cria src/classes/<nome>.ts
//   vfp build                    src/ -> dist/ (forms->SCX, classes/main->PRG) + manifesto
//   vfp watch                    rebuild ao salvar
//   vfp run                      build + executa main() no VFP
//   vfp clean                    apaga dist/
//
// Reaproveita o transpilador (transpile.js) e o foxcli. Sem dependências externas.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { transpile, transpileForm, collectRoute, collectMenus, finalizeFormIR, setTheme, setMessages } = require('./transpile');
const layout = require('./layout'); // motor de layout (flex | yoga)

const FOXCLI = require('./foxcli-path');
const SELF = path.resolve(__filename);
const CORE = path.join(__dirname, 'decorators.ts'); // @vfp/core (tipos/decorators)

// ---- utils -----------------------------------------------------------------
const log = (...a) => console.log('[vfp]', ...a);
const die = (msg) => { console.error('[vfp] erro:', msg); process.exit(1); };
const mkdirp = (d) => fs.mkdirSync(d, { recursive: true });
const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const listFiles = (dir, suf) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(suf)).map((f) => path.join(dir, f)) : [];

function loadConfig(root) {
  const def = { srcDir: 'src', outDir: 'dist', main: 'src/main.ts' };
  const f = path.join(root, 'vfp.config.json');
  return fs.existsSync(f) ? { ...def, ...JSON.parse(fs.readFileSync(f, 'utf8')) } : def;
}

function foxcli(args) {
  const raw = execFileSync(FOXCLI, [...args, '--json'], { encoding: 'utf8' });
  return JSON.parse(raw);
}

// ---- templates -------------------------------------------------------------
// UI Compiler: form em TSX (render() -> SCX/SCT). É o artefato dominante.
const tplForm = (Name) => `import { Form, Column, Row, Label, TextBox, SaveButton } from "@vfp/core";

@Form({ caption: "${Name}", width: 520, height: 360 })
export class ${Name}Form {
  render() {
    return (
      <Column gap={10}>
        <Label caption="${Name}" />
        <TextBox bind="nome" width={300} />
        <Row gap={8}>
          <SaveButton caption="Salvar" />
        </Row>
      </Column>
    );
  }
}
`;

// componente reutilizável (TSX) -> expandido nos forms que o usam
const tplComponent = (Name) => `import { Component, Prop, Row, TextBox, Button } from "@vfp/core";

@Component()
export class ${Name} {
  @Prop() caption: string = "Buscar";
  render() {
    return (
      <Row gap={5}>
        <TextBox bind="codigo" width={70} />
        <Button caption={this.caption} />
      </Row>
    );
  }
}
`;

// Logic Compiler: serviço (@Injectable) -> DEFINE CLASS num PRG
const tplService = (Name) => `import { Injectable } from "@vfp/core";

@Injectable()
export class ${Name} {
  salvar(): void {
    // TODO: regra de negócio / processamento (vira PROCEDURE)
  }
}
`;

const tplClass = (Name) => `export class ${Name} {
  nome: string = "";

  salvar(): void {
    // TODO
  }
}
`;

const tplMain = `// main.ts — ponto de entrada (vira main.prg). \`vfp run\` chama main().
export function main(): void {
  console.log("Projeto VFP iniciado");
}
`;

// jsx preserve (o template gera .form.tsx) + globals.d.ts do foxts (console.log e
// namespace JSX p/ o editor). Caminho absoluto: convencao atual do scaffold (divida conhecida).
const tplTsconfig = JSON.stringify({
  compilerOptions: {
    target: 'ES2020', module: 'CommonJS', strict: true, experimentalDecorators: true,
    jsx: 'preserve', lib: ['ES2020'], // sem DOM: console vem do globals.d.ts (como no loadProgram)
    moduleResolution: 'Node', baseUrl: '.', paths: { '@vfp/core': [CORE.replace(/\.ts$/, '')] },
  },
  files: [path.join(__dirname, 'globals.d.ts')],
  include: ['src'],
}, null, 2) + '\n';

const tplConfig = JSON.stringify({ srcDir: 'src', outDir: 'dist', main: 'src/main.ts' }, null, 2) + '\n';

const tplPkg = (name) => JSON.stringify({
  name, version: '0.1.0', private: true,
  scripts: {
    build: `node ${JSON.stringify(SELF)} build`,
    watch: `node ${JSON.stringify(SELF)} watch`,
    dev: `node ${JSON.stringify(SELF)} watch`, // alias (memoria muscular React)
    run: `node ${JSON.stringify(SELF)} run`,
    clean: `node ${JSON.stringify(SELF)} clean`,
    'create:form': `node ${JSON.stringify(SELF)} generate form`,
    'create:class': `node ${JSON.stringify(SELF)} generate class`,
  },
}, null, 2) + '\n';

// ---- comandos --------------------------------------------------------------
function cmdNew(name) {
  if (!name) die('uso: vfp new <projeto>');
  const root = path.resolve(name);
  if (fs.existsSync(root) && fs.readdirSync(root).length) die(`diretório não vazio: ${root}`);
  for (const d of ['src/forms', 'src/components', 'src/services', 'src/models']) mkdirp(path.join(root, d));
  fs.writeFileSync(path.join(root, 'package.json'), tplPkg(name));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), tplTsconfig);
  fs.writeFileSync(path.join(root, 'vfp.config.json'), tplConfig);
  fs.writeFileSync(path.join(root, 'src/main.ts'), tplMain);
  log(`projeto criado em ${root}`);
  log('próximos passos: cd ' + name + '  →  npm run create:form Cliente  →  npm run build');
}

function gen(root, sub, file, content, msg) {
  const dir = path.join(root, loadConfig(root).srcDir, sub); mkdirp(dir);
  const full = path.join(dir, file);
  if (fs.existsSync(full)) die(`já existe: ${full}`);
  fs.writeFileSync(full, content);
  log(`${msg}: ${path.relative(root, full)}`);
}

function cmdGenerate(kind, Name, root) {
  if (!kind || !Name) die('uso: vfp generate <form|component|service|class> <Nome>');
  const N = pascal(Name);
  switch (kind) {
    case 'form': return gen(root, 'forms', `${lower(Name)}.form.tsx`, tplForm(N), `form (SCX) criado, classe ${N}Form`);
    case 'component': case 'comp': return gen(root, 'components', `${N}.tsx`, tplComponent(N), `componente criado, @Component ${N}`);
    case 'service': case 'svc': return gen(root, 'services', `${N}.ts`, tplService(N), `serviço (PRG) criado, @Injectable ${N}`);
    case 'class': return gen(root, 'classes', `${lower(Name)}.ts`, tplClass(N), `classe criada, DEFINE CLASS ${N}`);
    default: return die(`tipo desconhecido "${kind}" (use: form | component | service | class)`);
  }
}

// build de um form .ts -> SCX (via IR + foxcli). Devolve a IR (para o manifesto).
function buildForm(tsPath, outDir, routes) {
  const ir = transpileForm(tsPath, { routes });
  if (!ir) throw new Error(`${path.basename(tsPath)}: não é um form (falta @Form ou extends Form)`);
  finalizeFormIR(ir);
  mkdirp(outDir);
  const json = path.join(outDir, `${ir.name}.json`);
  const scx = path.join(outDir, `${ir.name}.scx`);
  fs.writeFileSync(json, JSON.stringify(ir, null, 2));
  const r = foxcli(['form', '--spec', json, '--out', scx]);
  if (!r.ok) throw new Error(`${ir.name}: ${(r.errors || []).join('; ')}`);
  log(`  form  ${ir.name}.scx  (${(ir.controls || []).length} controles)`);
  return ir;
}

// build de um .ts de lógica -> PRG (funções/classes). Valida com foxcli compile.
function buildPrg(tsPath, outPrg, label, routes) {
  mkdirp(path.dirname(outPrg));
  fs.writeFileSync(outPrg, transpile(tsPath, { routes }), 'latin1');
  const r = foxcli(['compile', outPrg]);
  if (!r.ok) throw new Error(`${path.basename(outPrg)}: ${(r.errors || []).join('; ')}`);
  log(`  ${label}  ${path.basename(outPrg)}`);
}

// manifesto de dependências entre forms: varre os DO FORM <X> gerados.
function writeManifest(irs, outDir) {
  const byName = {};
  for (const ir of irs) {
    const bodies = [...Object.values(ir.methods || {})];
    for (const c of ir.controls || []) bodies.push(...Object.values(c.methods || {}));
    const deps = new Set();
    for (const b of bodies) for (const m of String(b).matchAll(/\bDO FORM (\w+)/g)) deps.add(m[1]);
    byName[ir.name] = [...deps];
  }
  fs.writeFileSync(path.join(outDir, 'forms.manifest.json'), JSON.stringify({ forms: byName }, null, 2));
  // detecção simples de ciclo (aviso, não erro)
  const seen = {}, stack = new Set();
  const dfs = (n, trail) => {
    if (stack.has(n)) { log(`aviso: dependência circular: ${[...trail, n].join(' -> ')}`); return; }
    if (seen[n]) return; seen[n] = 1; stack.add(n);
    for (const d of byName[n] || []) dfs(d, [...trail, n]);
    stack.delete(n);
  };
  for (const n of Object.keys(byName)) dfs(n, []);
  return byName;
}

// nome do PRG a partir do .ts (sem .form). Cliente.ts -> Cliente.prg
const prgName = (f) => pascal(path.basename(f).replace(/\.(form\.)?tsx?$/, '')) + '.prg';

// forms do projeto (.form.ts / .form.tsx) em src/forms
const formFiles = (src) =>
  [...listFiles(path.join(src, 'forms'), '.form.ts'), ...listFiles(path.join(src, 'forms'), '.form.tsx')];

// pre-passe: mapa global de rotas (@Route -> nome do form), montado por um parser
// sintatico barato antes do transpile completo. Resolve router.open("rota") em build.
const collectRoutes = (forms) => {
  const routes = {};
  for (const f of forms) { const r = collectRoute(f); if (r) routes[r.route] = r.name; }
  return routes;
};

// manifesto de forms + routes.json a partir das IRs (reusado pelo watch incremental)
function writeFormsMeta(out, irs, routes) {
  if (!irs.length) return;
  const man = writeManifest(irs, path.join(out, 'forms'));
  const deps = Object.values(man).reduce((a, d) => a + d.length, 0);
  log(`manifesto: ${irs.length} forms, ${deps} dependências -> forms/forms.manifest.json`);
  if (Object.keys(routes).length) {
    fs.writeFileSync(path.join(out, 'routes.json'), JSON.stringify({ routes }, null, 2));
    log(`rotas: ${Object.keys(routes).length} -> routes.json`);
  }
}

// remove de dist/forms os .scx/.sct/.json cujo form (ir.name) nao saiu deste build
// (form deletado/renomeado em src/). So roda apos build COMPLETO bem-sucedido.
function pruneOrphanForms(formsDir, irs) {
  if (!fs.existsSync(formsDir)) return;
  const keep = new Set(irs.map((ir) => String(ir.name).toLowerCase()));
  for (const f of fs.readdirSync(formsDir)) {
    const m = /^(.+)\.(scx|sct|json)$/i.exec(f);
    if (!m || f.toLowerCase() === 'forms.manifest.json' || keep.has(m[1].toLowerCase())) continue;
    fs.rmSync(path.join(formsDir, f), { force: true });
    log(`  órfão removido: forms/${f}`);
  }
}

// build completo. Devolve o estado (cache fonte->IR, rotas) reusado pelo watch incremental.
async function cmdBuild(root) {
  const cfg = loadConfig(root);
  const src = path.join(root, cfg.srcDir);
  const out = path.join(root, cfg.outDir);
  if (cfg.layout !== 'flex' && await layout.loadYogaEngine()) layout.setEngine('yoga');
  const themeFile = path.join(root, 'vfp.theme.json');
  if (fs.existsSync(themeFile)) setTheme(JSON.parse(fs.readFileSync(themeFile, 'utf8')));
  const msgFile = path.join(root, 'vfp.messages.json');
  if (fs.existsSync(msgFile)) setMessages(JSON.parse(fs.readFileSync(msgFile, 'utf8')));
  log(`build ${path.relative(process.cwd(), root || '.')} (layout: ${layout.engine()})`);
  const irs = new Map(); // fonte -> IR (cache p/ rebuild incremental no watch)
  const prgs = [];
  // UI Compiler: forms (.form.ts / .form.tsx) -> SCX/SCT
  const forms = formFiles(src);
  const routes = collectRoutes(forms);
  for (const f of forms) irs.set(f, buildForm(f, path.join(out, 'forms'), routes));
  // Logic Compiler: services / models / classes -> PRG
  const menus = []; // nomes de menu() encontrados -> DO <nome> no app.prg
  for (const sub of ['services', 'models', 'classes']) {
    for (const f of listFiles(path.join(src, sub), '.ts')) {
      const o = path.join(out, sub, prgName(f)); buildPrg(f, o, sub.slice(0, -1).padEnd(7), routes); prgs.push(o);
      for (const mn of collectMenus(f)) menus.push(mn);
    }
  }
  const mainTs = path.join(root, cfg.main);
  const hasMain = fs.existsSync(mainTs);
  if (hasMain) { const o = path.join(out, 'main.prg'); buildPrg(mainTs, o, 'main   ', routes); prgs.push(o); }
  if (menus.length) log(`menu: ${menus.join(', ')} -> DO no app.prg`);
  const irList = [...irs.values()];
  writeBootstrap(out, prgs, hasMain, cfg.entry, menus); // app.prg: linka PRGs + SET PATH + DO menu + main()/entry
  if (hasMain || cfg.entry) writeProjectManifest(out, path.basename(root), prgs, irList); // vfp.json p/ `vfp pack`
  writeFormsMeta(out, irList, routes);
  pruneOrphanForms(path.join(out, 'forms'), irList); // dist espelha src (só no build completo)
  log(`build OK: ${irs.size} SCX (UI) + ${prgs.length} PRG (lógica) -> ${path.relative(process.cwd(), out)}`);
  return { cfg, src, out, routes, irs };
}

// writeBootstrap: dist/app.prg que linka todos os PRGs (SET PROCEDURE) e a pasta de
// forms (SET PATH) — assim serviços e `DO FORM` resolvem em runtime —, ativa o(s)
// menu(s) (DO <nome>, após linkar e antes da UI) e dispara main() ou o form de entrada.
// Caminhos absolutos (gerado para esta máquina).
function writeBootstrap(out, prgs, hasMain, entry, menus = []) {
  const lines = ['* app.prg — bootstrap gerado pelo foxts (NAO editar)'];
  for (const p of prgs) lines.push(`SET PROCEDURE TO ("${p}") ADDITIVE`);
  lines.push(`SET PATH TO ("${path.join(out, 'forms')}") ADDITIVE`);
  for (const m of menus) lines.push(`DO ${m}`); // ativa a barra de menus (ACTIVATE MENU NOWAIT)
  if (entry) { lines.push(`DO FORM ("${path.join(out, 'forms', entry + '.scx')}")`, 'READ EVENTS'); }
  else if (hasMain) lines.push('main()');
  fs.writeFileSync(path.join(out, 'app.prg'), lines.join('\n') + '\n', 'latin1');
}

// writeProjectManifest: dist/vfp.json (forms SCX + PRGs, main=app.prg) para o
// `vfp pack` montar o .pjx e o EXE via foxcli.
function writeProjectManifest(out, name, prgs, irs) {
  const rel = (p) => path.relative(out, p).replace(/\\/g, '/');
  const files = [...irs.map((ir) => `forms/${ir.name}.scx`), ...prgs.map(rel)];
  fs.writeFileSync(path.join(out, 'vfp.json'),
    JSON.stringify({ name, main: 'app.prg', type: 'exe', output: `${name}.exe`, files }, null, 2));
}

function cmdClean(root) {
  const out = path.join(root, loadConfig(root).outDir);
  fs.rmSync(out, { recursive: true, force: true });
  log('limpo: ' + path.relative(process.cwd(), out));
}

// pack: build + monta o projeto VFP (.pjx) e o EXE via foxcli (modo manifesto).
async function cmdPack(root) {
  await cmdBuild(root);
  const out = path.join(root, loadConfig(root).outDir);
  if (!fs.existsSync(path.join(out, 'vfp.json'))) die('nada para empacotar (defina src/main.ts ou entry no vfp.config.json)');
  log('empacotando projeto VFP (.pjx + EXE)...');
  const r = foxcli(['build', out]);
  if (!r.ok) die((r.errors || []).join('; '));
  log(`pack OK: ${r.output || out}`);
}

async function cmdRun(root) {
  await cmdBuild(root);
  const app = path.join(root, loadConfig(root).outDir, 'app.prg');
  if (!fs.existsSync(app)) die('app.prg não gerado (defina src/main.ts ou entry no vfp.config.json)');
  const r = foxcli(['run', app, '--timeout', '60']); // app.prg linka serviços + chama main()/entry
  process.stdout.write((r.stdout || '').replace(/\x1a/g, ''));
  if (!r.ok) die((r.errors || []).join('; '));
}

function cmdWatch(root) {
  const src = path.join(root, loadConfig(root).srcDir);
  let state = null; // estado do ultimo build COMPLETO ok (cache fonte->IR)
  const full = () => cmdBuild(root)
    .then((s) => { state = s; })
    .catch((e) => { state = null; console.error('[vfp] build falhou:', e.message); });
  // incremental conservador: so quando mudou UM .form.ts(x) ja conhecido do ultimo
  // build completo. Refaz o pre-passe de rotas (barato, sintatico), rebuilda so aquele
  // form e regrava manifesto/routes.json do cache; app.prg nao muda nesse caminho
  // (depende so de PRGs/menus). Qualquer duvida ou erro -> build completo.
  const incremental = (file) => Promise.resolve().then(() => {
    log(`watch: ${path.basename(file)} -> rebuild incremental`);
    const routes = collectRoutes(formFiles(src));
    state.irs.set(file, buildForm(file, path.join(state.out, 'forms'), routes));
    state.routes = routes;
    writeFormsMeta(state.out, [...state.irs.values()], routes);
  }).catch((e) => { console.error('[vfp] incremental falhou:', e.message); return full(); });
  let t = null, busy = false, needFull = true; const changed = new Set();
  const flush = async () => {
    if (busy) return schedule(); // build em curso: tenta de novo no proximo tick
    busy = true;
    const files = [...changed]; changed.clear();
    const doFull = needFull || !state || files.length !== 1; needFull = false;
    try { await (doFull ? full() : incremental(files[0])); } finally { busy = false; }
  };
  const schedule = () => { clearTimeout(t); t = setTimeout(flush, 150); };
  flush(); // primeiro build: sempre completo
  log('watch: observando ' + path.relative(process.cwd(), src) + ' (Ctrl+C para sair)');
  fs.watch(src, { recursive: true }, (ev, f) => {
    if (f && !/\.tsx?$/i.test(f)) return; // .ts e .tsx (antes o filtro deixava .tsx de fora)
    const abs = f ? path.join(src, f) : null;
    // 'change' num .form.ts(x) ja no cache e ainda existente -> candidato a incremental;
    // resto (logica/main, criado/removido/renomeado, evento sem nome) -> completo.
    if (ev === 'change' && abs && /\.form\.tsx?$/i.test(abs) && state && state.irs.has(abs) && fs.existsSync(abs)) changed.add(abs);
    else needFull = true;
    schedule();
  });
  // raiz: vfp.config/theme/messages.json (fora de src/) tambem disparam rebuild COMPLETO.
  // Limitacao: setTheme/setMessages so fazem MERGE (transpile.js nao expoe reset/default),
  // entao chave REMOVIDA do json mantem o valor antigo ate reiniciar o watch.
  fs.watch(root, (_ev, f) => {
    if (!f || !/^vfp\.(config|theme|messages)\.json$/i.test(f)) return;
    needFull = true; schedule();
  });
}

// ---- dispatch --------------------------------------------------------------
const USAGE = `vfp — CLI de projeto TypeScript -> Visual FoxPro 9

  vfp new <projeto>              cria a estrutura do projeto
  vfp generate form <Nome>       gera um form TSX -> SCX (alias: g)
  vfp generate component <Nome>  gera um @Component reutilizável
  vfp generate service <Nome>    gera um @Injectable -> PRG
  vfp build                      UI Compiler (forms->SCX) + Logic Compiler (services->PRG)
  vfp watch                      recompila ao salvar
  vfp run                        build + executa app.prg (linka serviços + main()/entry)
  vfp pack                       build + monta .pjx e EXE (via foxcli)
  vfp clean                      apaga dist/
`;

function main() {
  const [cmd, a, b] = process.argv.slice(2);
  const root = process.cwd();
  switch (cmd) {
    case 'new': return cmdNew(a);
    case 'generate': case 'g': return cmdGenerate(a, b, root);
    case 'build': return cmdBuild(root);
    case 'watch': return cmdWatch(root);
    case 'run': return cmdRun(root);
    case 'pack': return cmdPack(root);
    case 'clean': return cmdClean(root);
    case 'help': case '--help': case '-h': case undefined: return void process.stdout.write(USAGE);
    default: console.error(`comando desconhecido: ${cmd}\n`); process.stdout.write(USAGE); process.exit(2);
  }
}
Promise.resolve().then(main).catch((e) => die(e.message));
