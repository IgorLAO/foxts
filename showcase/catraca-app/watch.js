'use strict';
// watch.js — live preview no navegador. Observa src/forms/*.form.tsx (+ components,
// tema, icons e o motor: ../preview.js, ../../transpile.js, ../../fox.ts) e, a cada
// salvar, re-renderiza o PNG fiel (mesmo pipeline do build: node ../preview.js, canvas
// + Yoga) e empurra um reload pro browser via SSE. Sem F5: programa e olha a tela.
//   Uso (de dentro de showcase/catraca-app/):  node watch.js  [porta]
//   Abra http://localhost:5173 — sidebar com as 4 telas + toggle light/dark.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;                 // showcase/catraca-app
const FORMS_DIR = path.join(ROOT, 'src', 'forms');
const DIST = path.join(ROOT, 'dist');
const PORT = parseInt(process.argv[2], 10) || 5173;
const PREVIEW = path.join(ROOT, '..', 'preview.js'); // showcase/preview.js

const forms = () =>
  fs.readdirSync(FORMS_DIR).filter((f) => /\.form\.tsx$/.test(f)).sort();
const base = (f) => f.replace(/\.form\.tsx$/, '');

const clients = new Set();              // respostas SSE abertas
let rendering = false, pending = false; // serializa renders (1 por vez) + coalesce

// renderiza UMA tela em light+dark, em processo separado (preview.js vaza tema senao).
function renderForm(form) {
  return new Promise((resolve) => {
    const rel = path.join('src', 'forms', form);
    let done = 0;
    const one = (dark) => {
      const args = [PREVIEW, rel, ...(dark ? ['--dark'] : [])];
      const p = spawn(process.execPath, args, { cwd: ROOT });
      let err = '';
      p.stderr.on('data', (d) => (err += d));
      p.on('close', (code) => {
        if (code !== 0) console.error(`  ! ${form}${dark ? ' (dark)' : ''}:`, err.trim() || `exit ${code}`);
        if (++done === 2) resolve();
      });
    };
    one(false); one(true);
  });
}

// re-renderiza TODAS as telas (mudou tema/componente/motor) ou só uma (mudou o form).
async function renderAll(only) {
  if (rendering) { pending = only || true; return; }
  rendering = true;
  const list = typeof only === 'string' ? [only] : forms();
  const t0 = Date.now();
  for (const f of list) await renderForm(f);
  rendering = false;
  console.log(`render ${list.length} tela(s) em ${Date.now() - t0}ms -> reload`);
  for (const res of clients) res.write('data: reload\n\n');
  if (pending) { const p = pending; pending = false; renderAll(p === true ? null : p); }
}

// ---- watch (debounce) -------------------------------------------------------
let timer = null, dirty = new Set();
function onChange(file) {
  if (file && /\.form\.tsx$/.test(file)) dirty.add(file);
  else dirty.add('*'); // component/tema/motor/icon -> re-render geral
  clearTimeout(timer);
  timer = setTimeout(() => {
    const only = dirty.has('*') ? null : (dirty.size === 1 ? [...dirty][0] : null);
    dirty.clear();
    renderAll(only);
  }, 150);
}

function watch(target, recursive) {
  try {
    fs.watch(target, { recursive }, (_e, f) => onChange(f && path.basename(f)));
  } catch (e) { console.error('watch falhou:', target, e.message); }
}
watch(FORMS_DIR, false);
watch(path.join(ROOT, 'src', 'components'), true);
watch(path.join(ROOT, 'icons'), false);
[path.join(ROOT, 'vfp.theme.json'), PREVIEW,
 path.join(ROOT, '..', '..', 'transpile.js'),
 path.join(ROOT, '..', '..', 'fox.ts'),
 path.join(ROOT, '..', '..', 'layout.js')].forEach((f) => fs.existsSync(f) && watch(f, false));

// ---- http -------------------------------------------------------------------
function page() {
  const opts = forms().map((f) => `<option value="${base(f)}">${base(f)}</option>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>FoxTS — live preview (catraca)</title>
<style>
:root{--bg:#0b1220;--panel:#111c33;--line:#243049;--mut:#94a3b8}
*{box-sizing:border-box}body{margin:0;font:14px Segoe UI,system-ui;background:var(--bg);color:#e2e8f0;height:100vh;display:flex}
aside{width:220px;flex:none;background:var(--panel);border-right:1px solid var(--line);padding:16px;display:flex;flex-direction:column;gap:6px}
h1{font-size:14px;margin:0 0 6px}.sub{color:var(--mut);font-size:11px;margin-bottom:10px}
button.nav{text-align:left;background:transparent;border:1px solid transparent;color:#cbd5e1;padding:8px 10px;border-radius:8px;cursor:pointer;font:inherit}
button.nav:hover{background:#18243f}button.nav.on{background:#1d3a6b;border-color:#2b5394;color:#fff}
main{flex:1;display:flex;flex-direction:column;min-width:0}
.bar{padding:10px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px;background:var(--panel)}
.bar label{font-size:12px;color:var(--mut);display:flex;align-items:center;gap:6px;cursor:pointer}
.dot{width:8px;height:8px;border-radius:50%;background:#22c55e;transition:.2s}.dot.busy{background:#f59e0b}
.stage{flex:1;overflow:auto;display:grid;place-items:center;padding:28px;background:#0b1220}
img{max-width:100%;box-shadow:0 8px 40px rgba(0,0,0,.5);border-radius:6px}
.t{margin-left:auto;color:var(--mut);font-size:11px}
</style>
<aside>
  <h1>FoxTS live</h1><div class="sub">catraca-app — salve um .form.tsx e a tela atualiza</div>
  ${forms().map((f) => `<button class="nav" data-b="${base(f)}">${base(f)}</button>`).join('')}
</aside>
<main>
  <div class="bar">
    <span class="dot" id="dot"></span><span id="name">—</span>
    <label><input type="checkbox" id="dark"> dark</label>
    <span class="t" id="ts"></span>
  </div>
  <div class="stage"><img id="shot" alt="preview"></div>
</main>
<script>
let cur = ${JSON.stringify(base(forms()[0] || ''))};
const $ = (id) => document.getElementById(id);
function load(){
  const dark = $('dark').checked;
  $('shot').src = '/img/' + cur + (dark ? '-dark' : '') + '.png?t=' + Date.now();
  $('name').textContent = cur;
  $('ts').textContent = new Date().toLocaleTimeString();
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('on', b.dataset.b === cur));
}
document.querySelectorAll('.nav').forEach(b => b.onclick = () => { cur = b.dataset.b; load(); });
$('dark').onchange = load;
const es = new EventSource('/events');
es.onmessage = () => { $('dot').classList.remove('busy'); load(); };
es.onopen = () => $('dot').classList.remove('busy');
load();
</script>`;
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page());
  } else if (url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  } else if (url.startsWith('/img/')) {
    const file = path.join(DIST, path.basename(url));
    fs.readFile(file, (e, buf) => {
      if (e) { res.writeHead(404); res.end('no png (ainda renderizando?)'); return; }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  } else { res.writeHead(404); res.end(); }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`porta ${PORT} ja esta em uso. Rode com outra: node watch.js ${PORT + 1}`);
    process.exit(1);
  }
  throw e;
});
server.listen(PORT, () => {
  console.log(`FoxTS live preview -> http://localhost:${PORT}  (Ctrl+C p/ sair)`);
  renderAll(); // render inicial das 4 telas
});
