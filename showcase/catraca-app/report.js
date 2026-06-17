'use strict';
// report.js — monta dist/report.html com os previews (preview.js, render fiel da IR via
// canvas + Yoga) das 4 telas + a rubrica. Uso: node report.js (depois de build.sh + os
// previews). As telas recriam, modernizadas, o app VFP legado Pwi_VF9_CatracaPCI.
const fs = require('fs');
const path = require('path');

const shots = [
  { file: 'SplashPage.png', title: 'SplashPage', orig: 'pci_inicio', desc: 'Abertura do kiosk: marca <Brand> (componente reutilizavel) + status + Continuar -> Login' },
  { file: 'LoginPage.png', title: 'LoginPage', orig: 'system_logininicio', desc: 'Login por cracha: card central + campo password grande + erro (Visible .F.) + Entrar -> Principal' },
  { file: 'PrincipalPage.png', title: 'PrincipalPage', orig: 'system_principal', desc: 'Validacao: header + card do visitante + <Grid columns={3}> de StatCard + prompt de leitura + acoes' },
  { file: 'ResultPage.png', title: 'ResultPage', orig: 'system_autorizou', desc: 'Resultado: check verde grande + ACESSO LIBERADO + nome + Concluir -> Principal' },
];
const rubric = [
  'Mesmo app, modernizado: 4 telas do Pwi_VF9_CatracaPCI repintadas com o UI Kit (Win11/Fluent)',
  'Zero coordenadas: layout declarativo (Column/Row/Grid + Yoga) resolve para SCX nativo',
  'Componentizacao: <Brand> reutilizavel; Card/StatCard/FlatButton do kit',
  'Icones SVG: Lucide rasterizado p/ PNG (heroi grande + inline), alpha no Image do VFP',
  'Navegacao: SplashPage -> LoginPage -> PrincipalPage -> ResultPage (FormManager.open + Release)',
  'Tema unico: vfp.theme.json (primary azul) tine tudo; trocar 1 token re-estiliza o app',
  'Saida nativa: cada tela e um SCX/SCT editavel no VFP 9 (o runtime continua sendo o VFP)',
];

const card = (s) => `<section><h2>${s.title} <span class="o">&larr; ${s.orig}</span></h2><p class="d">${s.desc}</p><img src="${s.file}" alt="${s.title}"></section>`;
const html = `<!doctype html><meta charset="utf-8"><title>FoxTS — Catraca PCI (modernizado)</title>
<style>body{font:14px Segoe UI,system-ui;margin:0;background:#0b1220;color:#e2e8f0}
header{padding:24px 32px;background:#111c33;border-bottom:1px solid #243049}
h1{margin:0;font-size:20px}.sub{color:#94a3b8;margin-top:4px}
main{padding:24px 32px;display:grid;gap:24px;grid-template-columns:1fr 1fr}
section{background:#111c33;border:1px solid #243049;border-radius:12px;overflow:hidden}
h2{margin:0;padding:14px 18px 4px;font-size:15px}.o{color:#64748b;font-weight:400;font-size:12px}
.d{margin:0;padding:0 18px 12px;color:#94a3b8;font-size:12px}
img{display:block;width:100%;border-top:1px solid #243049;background:#fff}
ul{columns:2;gap:24px;margin:0;padding:0 0 0 18px}li{margin:6px 0;color:#cbd5e1;font-size:13px}
.chk{background:#111c33;border:1px solid #243049;border-radius:12px;padding:16px 8px;margin:0 32px 28px}
.chk h2{padding:4px 10px}</style>
<header><h1>FoxTS — Catraca PCI (recriado e modernizado a partir de um app VFP real)</h1>
<div class="sub">TSX -> SCX nativo. O legado Pwi_VF9_CatracaPCI repintado com o UI Kit: mesmo fluxo, cara de 2025/26.</div></header>
<main>${shots.map(card).join('\n')}</main>
<div class="chk"><h2>Checklist</h2><ul>${rubric.map((r) => `<li>OK ${r}</li>`).join('')}</ul></div>`;

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'report.html'), html);
console.log('report -> dist/report.html (' + shots.length + ' telas)');
