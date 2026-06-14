'use strict';
// build_card.js — o MESMO card "web moderno" gerado em BUILD-TIME no Node
// (@napi-rs/canvas): gradiente linear + cantos arredondados + sombra (blur real)
// + texto anti-aliased. Saida PNG p/ ser usada como <Image>/Picture no form VFP.
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const W = 380, H = 200;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// fundo slate-900 (como o dashboard)
ctx.fillStyle = '#0f172a';
ctx.fillRect(0, 0, W, H);

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// sombra (blur gaussiano real)
ctx.save();
ctx.shadowColor = 'rgba(0,0,0,0.45)';
ctx.shadowBlur = 24;
ctx.shadowOffsetY = 10;
// gradiente linear roxo -> ciano
const g = ctx.createLinearGradient(24, 24, 356, 164);
g.addColorStop(0, '#7c3aed');
g.addColorStop(1, '#0ea5e9');
ctx.fillStyle = g;
roundRect(24, 24, 332, 140, 22);
ctx.fill();
ctx.restore();

// textos anti-aliased
ctx.textBaseline = 'top';
ctx.fillStyle = 'rgba(237,233,254,0.90)';
ctx.font = '15px "Segoe UI"';
ctx.fillText('Faturamento', 44, 44);

ctx.fillStyle = '#ffffff';
ctx.font = 'bold 40px "Segoe UI"';
ctx.fillText('R$ 18.4k', 42, 70);

ctx.fillStyle = 'rgba(209,250,229,0.92)';
ctx.font = '13px "Segoe UI"';
ctx.fillText('+12% vs ontem', 44, 130);

const out = path.join(__dirname, 'out_node.png');
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('OK ' + out + ' (' + fs.statSync(out).size + ' bytes)');
