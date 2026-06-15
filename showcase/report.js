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
const STAMP = new Date().toISOString().slice(0, 10); // YYYY-MM-DD p/ o arquivo datado

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

// terceiro eixo do loop visual (além de "funciona?" e "está bonito?"): "parece
// PROFISSIONAL?" — rubrica explícita destilada de Power BI / Linear / Stripe / Win11
// (ver ../design-reference/REFERENCES.md). É checklist manual por ora; comparar cada
// tela contra estes critérios em vez de só "achei bonito".
const RUBRIC = [
  'Espaçamento num grid de 8px (gaps/paddings múltiplos de 4–8, respiro consistente)',
  'Hierarquia tipográfica clara (título ≠ corpo ≠ dado; pesos e tamanhos distintos)',
  'Contraste de texto adequado em light E dark (WCAG AA: ~4.5:1 em corpo)',
  'Cor com parcimônia (1 primária + neutros; cor só comunica estado/ação)',
  'Densidade equilibrada (nem aperto, nem deserto — alinhar à densidade do Linear/Stripe)',
  'Estados visíveis (hover/foco/disabled) — não só o estado de repouso',
  'Cantos e elevação coerentes (mesmo raio/sombra entre cards, botões, inputs)',
  'Alinhamento em grade (labels, campos e ações alinhados em colunas/linhas)',
];
const html = `<!doctype html><meta charset="utf-8"><title>FoxTS UI — relatório visual</title>
<style>
  body{font:14px "Segoe UI",system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}
  h1{font-weight:300;margin:0 0 4px} .sub{color:#94a3b8;margin:0 0 24px}
  section{margin:0 0 32px} h2{font-weight:600;font-size:15px;color:#cbd5e1;border-bottom:1px solid #334155;padding-bottom:6px}
  .pair{display:flex;gap:20px;flex-wrap:wrap} figure{margin:0} figure img{display:block;box-shadow:0 8px 24px rgba(0,0,0,.4);border-radius:6px;max-width:100%}
  figcaption{color:#94a3b8;font-size:12px;margin-top:6px;text-align:center} .d{background:#020617;padding:0;border-radius:6px}
  .rubric{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:14px 18px;margin:0 0 28px}
  .rubric h2{border:0;margin:0 0 8px} .rubric ul{margin:0;padding-left:18px;columns:2;gap:24px} .rubric li{margin:0 0 6px;color:#cbd5e1;font-size:13px}
</style>
<h1>FoxTS UI — relatório visual</h1>
<p class="sub">${forms.length} tela(s) · renderizadas da IR real · light + dark (restyle-by-recompile) · ${STAMP}</p>
<div class="rubric"><h2>Parece profissional? — rubrica por tela</h2>
<ul>${RUBRIC.map((r) => `<li>${r}</li>`).join('')}</ul></div>
${rows.map(card).join('\n')}`;

fs.writeFileSync(path.join('dist', 'report.html'), html);
// arquivo datado: cópia imutável de cada rodada em dist/_history/<data>/ — habilita
// comparar a evolução visual entre datas (régua temporal / diff de regressão).
const histDir = path.join('dist', '_history', STAMP);
fs.mkdirSync(histDir, { recursive: true });
for (const r of rows) for (const png of [r.light, r.dark]) {
  const src = path.join('dist', png);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(histDir, png));
}
fs.copyFileSync(path.join('dist', 'report.html'), path.join(histDir, 'report.html'));
console.log(`\nrelatório -> dist/report.html (${forms.length} telas)`);
console.log(`histórico  -> ${histDir.replace(/\\/g, '/')} (${rows.length * 2} pngs + report.html)`);
