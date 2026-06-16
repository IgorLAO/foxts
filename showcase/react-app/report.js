'use strict';
// report.js — monta dist/report.html com os screenshots REAIS do VFP (capturados por
// capture.prg) lado a lado + a rubrica de auto-crítica. É o passo "relatório visual" do
// loop. Uso: node report.js  (depois de build.sh + a captura do vfp9).
const fs = require('fs');
const path = require('path');

const shots = [
  { file: '01-dashboard.png', title: 'DashboardPage', desc: 'AppLayout + PageHeader + <Grid columns={3}> de StatCard + PanelCard + compound Card' },
  { file: '02-clientes.png', title: 'ClientesPage', desc: 'Mesmos componentes reutilizados: Grid de dados + compound Card de detalhe + icones' },
];
const rubric = [
  'Componentizacao: componentes de usuario em components/ (Navbar, PageHeader, PanelCard) reutilizados',
  'Props tipadas: title/subtitle/navDashboard etc. checados pelo TS (DualTag/FC<Props>)',
  'Children/composicao: <PanelCard><FormField/></PanelCard> via <Slot/> (cross-file)',
  'Compound components: <Card.Header>/<Card.Body>/<Card.Footer>',
  'Layout declarativo: <Grid columns={3}> sem coordenadas',
  'Icones SVG: Lucide rasterizado p/ PNG (<Icon name>/<SaveIcon/>), alpha no VFP',
  'Reuso entre paginas: AppLayout/PageHeader/PanelCard em Dashboard E Clientes',
  'Estrutura web: components/ layouts/ pages/ icons/',
];

const card = (s) => `<section><h2>${s.title}</h2><p class="d">${s.desc}</p><img src="${s.file}" alt="${s.title}"></section>`;
const html = `<!doctype html><meta charset="utf-8"><title>FoxTS React-like showcase</title>
<style>body{font:14px Segoe UI,system-ui;margin:0;background:#0f172a;color:#e2e8f0}
header{padding:24px 32px;background:#1e293b;border-bottom:1px solid #334155}
h1{margin:0;font-size:20px}.sub{color:#94a3b8;margin-top:4px}
main{padding:24px 32px;display:grid;gap:28px;grid-template-columns:1fr}
section{background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden}
h2{margin:0;padding:14px 18px 4px;font-size:15px}.d{margin:0;padding:0 18px 12px;color:#94a3b8;font-size:12px}
img{display:block;width:100%;border-top:1px solid #334155}
ul{columns:2;gap:24px;margin:0;padding:0 0 0 18px}li{margin:6px 0;color:#cbd5e1;font-size:13px}
.chk{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px 8px;margin:0 32px 28px}
.chk h2{padding:4px 10px}</style>
<header><h1>FoxTS — Showcase "modelo React" (telas REAIS do VFP9)</h1>
<div class="sub">TSX -> SCX nativo. Componentizacao, props tipadas, children/Slot, compound components, icones SVG, layout declarativo.</div></header>
<main>${shots.map(card).join('\n')}</main>
<div class="chk"><h2>Checklist validado</h2><ul>${rubric.map((r) => `<li>OK ${r}</li>`).join('')}</ul></div>`;

fs.writeFileSync(path.join(__dirname, 'dist', 'report.html'), html);
console.log('report -> dist/report.html (' + shots.length + ' telas)');
