'use strict';
// build_totem.js — transforma a tela "Seu pedido e para?" do app React
// (Pwi_React_TotemAlimentacao) em assets para o VFP. Gera no Node (@napi-rs/canvas):
//   • comer.png / levar.png — os cards (branco, cantos 25px, sombra, foto + legenda)
//   • cancel.png — botao "Cancelar" arredondado (#ede8e8)
//   • screen_preview.png — a tela inteira composta (pra conferir a fidelidade visual)
// Paleta/medidas vindas do tailwind.config.js + styled-components do projeto React.
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const A = (f) => path.join(__dirname, 'assets', f);
const OUT = (f) => path.join(__dirname, f);

// paleta do tailwind.config.js do React
const C = {
  bg: '#FAFAFA', font: '#070707', grey: '#666666',
  primary: '#ed1e26', cancel: '#ede8e8', card: '#FEFEFE',
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// card: branco, cantos 25px, sombra suave, foto centralizada no topo, legenda embaixo
async function card(photoPath, caption, w, h) {
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  const pad = 24;
  // sombra + corpo branco arredondado
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
  ctx.fillStyle = C.card;
  roundRectPath(ctx, pad, pad, w - 2 * pad, h - 2 * pad, 25);
  ctx.fill();
  ctx.restore();
  // foto (clip arredondado), ocupa a area superior
  const img = await loadImage(photoPath);
  const ix = pad + 20, iy = pad + 24, iw = w - 2 * pad - 40, ih = h - 2 * pad - 110;
  ctx.save();
  roundRectPath(ctx, ix, iy, iw, ih, 16);
  ctx.clip();
  // cover
  const s = Math.max(iw / img.width, ih / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
  ctx.restore();
  // legenda
  ctx.fillStyle = C.font;
  ctx.font = 'bold 30px "Segoe UI"';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(caption, w / 2, h - pad - 40);
  return cv;
}

function pill(text, w, h, bg, fg) {
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg;
  roundRectPath(ctx, 2, 2, w - 4, h - 4, (h - 4) / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = 'bold 30px "Segoe UI"';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);
  return cv;
}

(async () => {
  const cComer = await card(A('comer.jpg'), 'Comer aqui', 320, 380);
  const cLevar = await card(A('levar.jpg'), 'Levar', 320, 380);
  const cCancel = pill('Cancelar', 263, 96, C.cancel, C.font);
  fs.writeFileSync(OUT('comer.png'), cComer.toBuffer('image/png'));
  fs.writeFileSync(OUT('levar.png'), cLevar.toBuffer('image/png'));
  fs.writeFileSync(OUT('cancel.png'), cCancel.toBuffer('image/png'));

  // preview da tela inteira (totem retrato) p/ conferir fidelidade
  const W = 760, H = 1180;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  // header: logo a direita
  const logo = await loadImage(A('logo132.png'));
  ctx.drawImage(logo, W - 132 - 24, 24, 132, 132);
  // titulo
  ctx.fillStyle = C.font; ctx.font = 'bold 56px "Segoe UI"';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('Seu pedido e para?', W / 2, 230);
  // cards lado a lado
  ctx.drawImage(cComer, W / 2 - 320 - 16, 360);
  ctx.drawImage(cLevar, W / 2 + 16, 360);
  // cancelar
  ctx.drawImage(cCancel, W / 2 - 263 / 2, 880);
  fs.writeFileSync(OUT('screen_preview.png'), cv.toBuffer('image/png'));

  console.log('OK comer/levar/cancel/screen_preview gerados');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
