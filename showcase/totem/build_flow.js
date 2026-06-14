'use strict';
// build_flow.js — reproduz o FRONT do app React (Pwi_React_TotemAlimentacao) como
// telas renderizadas (@napi-rs/canvas), prontas p/ exibir num <Image> do VFP.
// Telas: 01 home, 02 modo de entrega, 03 listagem de produtos, 04 item/adicionais.
// Paleta/medidas/typografia do tailwind.config.js + styled-components do projeto.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const A = (f) => path.join(__dirname, 'assets', f);
const OUT = (f) => path.join(__dirname, f);
const W = 760, H = 1180;

const C = {
  bg: '#FAFAFA', font: '#070707', grey: '#666666', light: '#FCFFF9',
  primary: '#ed1e26', secondary: '#283593', cancel: '#ede8e8',
  card: '#FFFFFF', colorLight: '#f5f5f5', tab: '#c74743',
};

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function shadowCard(ctx, x, y, w, h, r, fill) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.16)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
  ctx.fillStyle = fill; rr(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
}
function imgCover(ctx, img, x, y, w, h, r) {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}
function imgContain(ctx, img, x, y, w, h) {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function text(ctx, t, x, y, font, color, align) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(t, x, y);
}
function pill(ctx, x, y, w, h, bg, fg, t, font, border) {
  ctx.fillStyle = bg; rr(ctx, x, y, w, h, h / 2); ctx.fill();
  if (border) { ctx.lineWidth = border.w; ctx.strokeStyle = border.c; rr(ctx, x, y, w, h, h / 2); ctx.stroke(); }
  ctx.font = font; ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(t, x + w / 2, y + h / 2 + 1);
}
function stepper(ctx, cx, y, qty) {
  // - 0 +  (circulos com contorno primary)
  const r = 26, gap = 70;
  for (const [dx, sign] of [[-gap, '-'], [gap, '+']]) {
    ctx.beginPath(); ctx.arc(cx + dx, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = C.primary; ctx.stroke();
    text(ctx, sign, cx + dx, y + 11, 'bold 34px "Segoe UI"', C.primary, 'center');
  }
  text(ctx, String(qty), cx, y + 9, 'bold 28px "Segoe UI"', C.font, 'center');
}
function header(ctx, logo, title, back) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, 120);
  if (back) text(ctx, '‹', 36, 78, 'bold 64px "Segoe UI"', C.font, 'left');
  if (title) text(ctx, title, back ? 90 : 32, 76, 'bold 40px "Segoe UI"', C.font, 'left');
  ctx.drawImage(logo, W - 96 - 20, 16, 96, 96);
}

const money = (v) => 'R$ ' + v.toFixed(2).replace('.', ',');

(async () => {
  const logo132 = await loadImage(A('logo132.png'));
  const logo300 = await loadImage(A('logo300.png'));
  const bgHome = await loadImage(A('homeBackground.png'));
  const comer = await loadImage(A('comer.jpg'));
  const levar = await loadImage(A('levar.jpg'));
  const prod = await loadImage(A('imagem-padrao-produto.jpg'));

  // ---------- 01 HOME ----------
  {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    imgCover(ctx, bgHome, 0, 0, W, H, 0);
    ctx.fillStyle = 'rgba(8,10,20,0.45)'; ctx.fillRect(0, 0, W, H);
    imgContain(ctx, logo300, W / 2 - 170, 150, 340, 300);
    text(ctx, 'Bem-vindo', W / 2, 600, 'bold 84px "Segoe UI"', C.light, 'center');
    text(ctx, 'faca seu pedido na tela', W / 2, 660, '30px "Segoe UI"', '#e5e7eb', 'center');
    pill(ctx, W / 2 - 300, 960, 600, 110, C.colorLight, C.primary, 'Toque para iniciar', 'bold 40px "Segoe UI"', { w: 5, c: '#000' });
    fs.writeFileSync(OUT('01_home.png'), cv.toBuffer('image/png'));
  }

  // ---------- 02 MODO DE ENTREGA ----------
  {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    header(ctx, logo132, '', false);
    text(ctx, 'Seu pedido e para?', W / 2, 280, 'bold 60px "Segoe UI"', C.font, 'center');
    const cw = 300, ch = 380, cy = 420;
    for (const [x, img, cap] of [[W / 2 - cw - 20, comer, 'Comer aqui'], [W / 2 + 20, levar, 'Levar']]) {
      shadowCard(ctx, x, cy, cw, ch, 25, C.card);
      imgCover(ctx, img, x + 30, cy + 36, cw - 60, ch - 130, 16);
      text(ctx, cap, x + cw / 2, cy + ch - 40, 'bold 32px "Segoe UI"', C.font, 'center');
    }
    pill(ctx, W / 2 - 150, 950, 300, 96, C.cancel, C.font, 'Cancelar', 'bold 30px "Segoe UI"');
    fs.writeFileSync(OUT('02_modo.png'), cv.toBuffer('image/png'));
  }

  // ---------- 03 LISTAGEM DE PRODUTOS ----------
  {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    header(ctx, logo132, 'Cardapio', true);
    // categorias (tabs)
    const cats = ['Lanches', 'Bebidas', 'Sobremesas', 'Combos'];
    let tx = 28; const ty = 140;
    cats.forEach((cat, i) => {
      ctx.font = 'bold 24px "Segoe UI"';
      const tw = ctx.measureText(cat).width + 44;
      const sel = i === 0;
      ctx.fillStyle = '#fff'; rr(ctx, tx, ty, tw, 56, 12); ctx.fill();
      if (sel) { ctx.lineWidth = 2; ctx.strokeStyle = C.tab; rr(ctx, tx, ty, tw, 56, 12); ctx.stroke(); }
      text(ctx, cat, tx + tw / 2, ty + 37, 'bold 24px "Segoe UI"', sel ? C.tab : C.grey, 'center');
      tx += tw + 18;
    });
    // grid de produtos 2 col
    const items = [
      ['X-Burger', 24.90], ['X-Salada', 27.90], ['Batata Frita', 14.90],
      ['Onion Rings', 16.90], ['Refrigerante', 8.90], ['Milk Shake', 18.90],
    ];
    const gx = 28, gy = 240, cw = (W - gx * 2 - 24) / 2, ch = 270, gap = 24;
    items.forEach((it, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = gx + col * (cw + gap), y = gy + row * (ch + gap);
      shadowCard(ctx, x, y, cw, ch, 18, C.card);
      imgContain(ctx, prod, x + cw / 2 - 80, y + 24, 160, 150);
      text(ctx, it[0], x + cw / 2, y + 212, 'bold 26px "Segoe UI"', C.font, 'center');
      text(ctx, money(it[1]), x + cw / 2, y + 248, 'bold 26px "Segoe UI"', C.primary, 'center');
    });
    // footer total
    ctx.fillStyle = '#fff'; ctx.fillRect(0, H - 110, W, 110);
    ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(0, H - 110); ctx.lineTo(W, H - 110); ctx.stroke();
    text(ctx, 'Total', 40, H - 58, '26px "Segoe UI"', C.grey, 'left');
    text(ctx, money(53.80), 40, H - 26, 'bold 30px "Segoe UI"', C.font, 'left');
    pill(ctx, W - 320, H - 86, 280, 64, C.primary, '#fff', 'Ver carrinho (2)', 'bold 26px "Segoe UI"');
    fs.writeFileSync(OUT('03_produtos.png'), cv.toBuffer('image/png'));
  }

  // ---------- 04 ITEM / ADICIONAIS ----------
  {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    header(ctx, logo132, 'X-Burger', true);
    // hero do produto
    shadowCard(ctx, 28, 150, W - 56, 230, 18, C.card);
    imgContain(ctx, prod, 56, 175, 180, 180);
    text(ctx, 'X-Burger', 270, 215, 'bold 36px "Segoe UI"', C.font, 'left');
    ctx.font = '24px "Segoe UI"'; ctx.fillStyle = C.grey; ctx.textAlign = 'left';
    ctx.fillText('Pao brioche, hamburguer 180g,', 270, 258);
    ctx.fillText('queijo, alface e tomate.', 270, 290);
    text(ctx, money(24.90), 270, 350, 'bold 32px "Segoe UI"', C.primary, 'left');
    // titulo secao
    text(ctx, 'Adicionais', 36, 440, 'bold 30px "Segoe UI"', C.font, 'left');
    // linhas de adicionais
    const ad = [
      ['Bacon extra', 'porcao 30g', 4.00, 1],
      ['Queijo cheddar', 'fatia dupla', 3.50, 0],
      ['Ovo', 'ovo frito', 2.00, 0],
      ['Cebola caramelizada', 'porcao', 3.00, 2],
    ];
    let y = 470;
    ad.forEach((a) => {
      shadowCard(ctx, 28, y, W - 56, 110, 16, C.card);
      imgContain(ctx, prod, 46, y + 15, 80, 80);
      text(ctx, a[0], 150, y + 48, 'bold 26px "Segoe UI"', C.font, 'left');
      text(ctx, a[1], 150, y + 80, '20px "Segoe UI"', C.grey, 'left');
      text(ctx, '+ ' + money(a[2]), W - 250, y + 44, 'bold 24px "Segoe UI"', C.primary, 'left');
      stepper(ctx, W - 130, y + 70, a[3]);
      y += 126;
    });
    // footer total + adicionar
    ctx.fillStyle = '#fff'; ctx.fillRect(0, H - 120, W, 120);
    ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(0, H - 120); ctx.lineTo(W, H - 120); ctx.stroke();
    text(ctx, 'Total', 40, H - 64, '26px "Segoe UI"', C.grey, 'left');
    text(ctx, money(36.90), 40, H - 28, 'bold 34px "Segoe UI"', C.primary, 'left');
    pill(ctx, W - 320, H - 96, 280, 72, C.primary, '#fff', 'Adicionar', 'bold 30px "Segoe UI"');
    fs.writeFileSync(OUT('04_item.png'), cv.toBuffer('image/png'));
  }

  // ---------- 05 CARRINHO ----------
  {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    header(ctx, logo132, 'Meu carrinho', true);
    const lines = [
      ['X-Burger', '+ Bacon, Cebola caramelizada', 1, 31.90],
      ['Batata Frita', '', 1, 14.90],
      ['Refrigerante', 'Lata 350ml', 1, 8.90],
    ];
    let y = 170;
    lines.forEach((l) => {
      shadowCard(ctx, 28, y, W - 56, 120, 16, C.card);
      imgContain(ctx, prod, 46, y + 18, 84, 84);
      text(ctx, l[0], 152, y + 50, 'bold 28px "Segoe UI"', C.font, 'left');
      if (l[1]) text(ctx, l[1], 152, y + 84, '20px "Segoe UI"', C.grey, 'left');
      text(ctx, 'x' + l[2], W - 250, y + 70, '24px "Segoe UI"', C.grey, 'left');
      text(ctx, money(l[3]), W - 180, y + 70, 'bold 26px "Segoe UI"', C.primary, 'left');
      y += 136;
    });
    text(ctx, 'Subtotal', 40, y + 36, '24px "Segoe UI"', C.grey, 'left');
    text(ctx, money(55.70), W - 40, y + 36, '24px "Segoe UI"', C.font, 'right');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, H - 130, W, 130);
    ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(0, H - 130); ctx.lineTo(W, H - 130); ctx.stroke();
    text(ctx, 'Total', 40, H - 72, '26px "Segoe UI"', C.grey, 'left');
    text(ctx, money(55.70), 40, H - 32, 'bold 34px "Segoe UI"', C.primary, 'left');
    pill(ctx, W - 300, H - 104, 260, 78, C.primary, '#fff', 'Pagar', 'bold 32px "Segoe UI"');
    fs.writeFileSync(OUT('05_carrinho.png'), cv.toBuffer('image/png'));
  }

  // ---------- 06 PAGAMENTO (escolher metodo) ----------
  {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    header(ctx, logo132, 'Pagamento', true);
    text(ctx, 'Total a pagar', W / 2, 230, '30px "Segoe UI"', C.grey, 'center');
    text(ctx, money(55.70), W / 2, 310, 'bold 76px "Segoe UI"', C.font, 'center');
    text(ctx, 'Como deseja pagar?', W / 2, 410, 'bold 34px "Segoe UI"', C.font, 'center');
    const methods = [['Cartao de credito', C.secondary], ['Cartao de debito', C.secondary], ['Pix', '#16a34a']];
    let my = 470;
    methods.forEach((m) => {
      shadowCard(ctx, 60, my, W - 120, 96, 16, C.card);
      ctx.fillStyle = m[1]; rr(ctx, 90, my + 26, 60, 44, 8); ctx.fill();
      text(ctx, m[0], 180, my + 60, 'bold 30px "Segoe UI"', C.font, 'left');
      text(ctx, '›', W - 110, my + 66, 'bold 48px "Segoe UI"', C.grey, 'left');
      my += 116;
    });
    pill(ctx, W / 2 - 150, my + 16, 300, 80, C.cancel, C.font, 'Cancelar', 'bold 28px "Segoe UI"');
    fs.writeFileSync(OUT('06_pagamento.png'), cv.toBuffer('image/png'));
  }

  // ---------- 07 PROCESSANDO (4 frames de progresso p/ animar) ----------
  function procFrame(pct) {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    header(ctx, logo132, '', false);
    text(ctx, 'Processando pagamento', W / 2, 470, 'bold 42px "Segoe UI"', C.font, 'center');
    text(ctx, 'Insira ou aproxime o cartao', W / 2, 530, '26px "Segoe UI"', C.grey, 'center');
    const bx = 130, bw = W - 260, by = 610, bh = 24;
    ctx.fillStyle = '#e5e7eb'; rr(ctx, bx, by, bw, bh, 12); ctx.fill();
    ctx.fillStyle = C.primary; rr(ctx, bx, by, Math.max(bh, bw * pct), bh, 12); ctx.fill();
    text(ctx, Math.round(pct * 100) + '%', W / 2, by + 80, 'bold 30px "Segoe UI"', C.grey, 'center');
    return cv;
  }
  [0, 0.34, 0.68, 1].forEach((p, i) => fs.writeFileSync(OUT('07_proc' + i + '.png'), procFrame(p).toBuffer('image/png')));

  // ---------- 08 APROVADO ----------
  {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#16a34a'; ctx.beginPath(); ctx.arc(W / 2, 360, 110, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(W / 2 - 52, 360); ctx.lineTo(W / 2 - 12, 402); ctx.lineTo(W / 2 + 56, 318); ctx.stroke();
    text(ctx, 'Pagamento aprovado!', W / 2, 560, 'bold 48px "Segoe UI"', C.font, 'center');
    text(ctx, 'Retire seu pedido no balcao', W / 2, 620, '28px "Segoe UI"', C.grey, 'center');
    shadowCard(ctx, W / 2 - 180, 680, 360, 170, 20, C.card);
    text(ctx, 'Sua senha', W / 2, 738, '26px "Segoe UI"', C.grey, 'center');
    text(ctx, 'A 123', W / 2, 815, 'bold 76px "Segoe UI"', C.primary, 'center');
    pill(ctx, W / 2 - 210, 930, 420, 90, C.secondary, '#fff', 'Tocar para finalizar', 'bold 28px "Segoe UI"');
    fs.writeFileSync(OUT('08_aprovado.png'), cv.toBuffer('image/png'));
  }

  console.log('OK telas: 01_home 02_modo 03_produtos 04_item 05_carrinho 06_pagamento 07_proc[0-3] 08_aprovado');
})().catch((e) => { console.error('ERRO', e && e.stack || e); process.exit(1); });
