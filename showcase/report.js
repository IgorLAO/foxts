'use strict';
// report.js — relatório visual de TODAS as telas. Renderiza cada *.form.tsx em
// light e dark (via preview.js, em processo separado p/ não vazar tema entre telas)
// e monta dist/report.html (contato visual lado a lado). É o passo "screenshot de
// cada tela + relatório" do loop de iteração visual. Uso: node report.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const forms = fs.readdirSync('.').filter((f) => /\.form\.tsx$/.test(f)).sort();
fs.mkdirSync('dist', { recursive: true });

const rows = [];
for (const form of forms) {
  const base = form.replace(/\.form\.tsx$/, '');
  for (const dark of [false, true]) {
    try {
      execFileSync('node', ['preview.js', form, ...(dark ? ['--dark'] : [])], { stdio: 'ignore' });
    } catch (e) { console.error('falhou:', form, dark ? '(dark)' : '', e.message); }
  }
  rows.push({ base, light: `${base}.png`, dark: `${base}-dark.png` });
  console.log('render:', base, '(light+dark)');
}

const card = (r) => `
  <section>
    <h2>${r.base}</h2>
    <div class="pair">
      <figure><img src="${r.light}" alt="${r.base} light"><figcaption>light</figcaption></figure>
      <figure class="d"><img src="${r.dark}" alt="${r.base} dark"><figcaption>dark</figcaption></figure>
    </div>
  </section>`;

const html = `<!doctype html><meta charset="utf-8"><title>FoxTS UI — relatório visual</title>
<style>
  body{font:14px "Segoe UI",system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}
  h1{font-weight:300;margin:0 0 4px} .sub{color:#94a3b8;margin:0 0 24px}
  section{margin:0 0 32px} h2{font-weight:600;font-size:15px;color:#cbd5e1;border-bottom:1px solid #334155;padding-bottom:6px}
  .pair{display:flex;gap:20px;flex-wrap:wrap} figure{margin:0} figure img{display:block;box-shadow:0 8px 24px rgba(0,0,0,.4);border-radius:6px;max-width:100%}
  figcaption{color:#94a3b8;font-size:12px;margin-top:6px;text-align:center} .d{background:#020617;padding:0;border-radius:6px}
</style>
<h1>FoxTS UI — relatório visual</h1>
<p class="sub">${forms.length} tela(s) · renderizadas da IR real · light + dark (restyle-by-recompile)</p>
${rows.map(card).join('\n')}`;

fs.writeFileSync(path.join('dist', 'report.html'), html);
console.log(`\nrelatório -> dist/report.html (${forms.length} telas)`);
