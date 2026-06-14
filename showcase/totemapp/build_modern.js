'use strict';
// build_modern.js — fundos do totem MODERNO interativo (600x920, escala 1:1 com o form).
// Gera: home_m.png, cardapio_bg.png (com os botoes desenhados, mas SEM os numeros
// dinamicos — quantidade/total/status entram como labels transparentes por cima),
// aprovado_m.png. Coordenadas batem com ModernTotem.form.tsx (overlays absolutos).
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const A = (f) => path.join(__dirname, '..', 'totem', 'assets', f);
const OUT = (f) => path.join(__dirname, f);
const W = 600, H = 920;
const C = { bg: '#FAFAFA', font: '#111827', grey: '#6b7280', primary: '#ed1e26', cancel: '#ede8e8', card: '#FFFFFF', secondary: '#283593', light: '#FCFFF9' };

function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function shadowCard(ctx, x, y, w, h, r, fill) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.14)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8; ctx.fillStyle = fill; rr(ctx, x, y, w, h, r); ctx.fill(); ctx.restore(); }
function T(ctx, t, x, y, font, color, align) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); }
function btn(ctx, x, y, s, fill, glyph, gcolor) { ctx.fillStyle = fill; rr(ctx, x, y, s, s, 14); ctx.fill(); T(ctx, glyph, x + s / 2, y + s / 2 + 1, 'bold 36px "Segoe UI"', gcolor, 'center'); }
function imgCover(ctx, img, x, y, w, h) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); const s = Math.max(w / img.width, h / img.height); ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s); ctx.restore(); }
function imgContain(ctx, img, x, y, w, h) { const s = Math.min(w / img.width, h / img.height); ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s); }

const ROWS = [120, 230, 340, 450];
const PRODS = [['X-Burger', 'R$ 25'], ['Batata Frita', 'R$ 15'], ['Refrigerante', 'R$ 9'], ['Milk Shake', 'R$ 19']];

(async () => {
  const logo = await loadImage(A('logo300.png'));
  const logo132 = await loadImage(A('logo132.png'));
  const bgHome = await loadImage(A('homeBackground.png'));

  // ---- cardapio_bg ----
  {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    T(ctx, 'Cardapio', 24, 64, 'bold 40px "Segoe UI"', C.font, 'left');
    ctx.drawImage(logo132, W - 84 - 18, 14, 84, 84);
    PRODS.forEach((p, i) => {
      const y = ROWS[i];
      shadowCard(ctx, 24, y, 552, 96, 18, C.card);
      T(ctx, p[0], 48, y + 40, 'bold 26px "Segoe UI"', C.font, 'left');
      T(ctx, p[1], 48, y + 72, 'bold 22px "Segoe UI"', C.primary, 'left');
      btn(ctx, 394, y + 22, 52, '#f3f4f6', '-', C.primary);     // minus
      btn(ctx, 514, y + 22, 52, C.primary, '+', '#ffffff');     // plus
      // (a quantidade entra como label transparente por cima — slot deixado em branco)
    });
    // total
    shadowCard(ctx, 24, 560, 552, 72, 18, C.card);
    T(ctx, 'Total', 48, 560 + 38, 'bold 28px "Segoe UI"', C.font, 'left');
    // (valor entra por cima)
    // barra de progresso (track)
    ctx.fillStyle = '#e5e7eb'; rr(ctx, 24, 650, 552, 14, 7); ctx.fill();
    // botoes
    ctx.fillStyle = C.cancel; rr(ctx, 24, 720, 250, 66, 16); ctx.fill();
    T(ctx, 'Limpar', 24 + 125, 720 + 33, 'bold 28px "Segoe UI"', C.font, 'center');
    ctx.fillStyle = C.primary; rr(ctx, 300, 720, 276, 66, 16); ctx.fill();
    T(ctx, 'Pagar', 300 + 138, 720 + 33, 'bold 30px "Segoe UI"', '#ffffff', 'center');
    fs.writeFileSync(OUT('cardapio_bg.png'), cv.toBuffer('image/png'));
  }

  // ---- home ----
  {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    imgCover(ctx, bgHome, 0, 0, W, H);
    ctx.fillStyle = 'rgba(8,10,20,0.45)'; ctx.fillRect(0, 0, W, H);
    imgContain(ctx, logo, W / 2 - 140, 130, 280, 250);
    T(ctx, 'Bem-vindo', W / 2, 470, 'bold 66px "Segoe UI"', C.light, 'center');
    T(ctx, 'toque para comecar seu pedido', W / 2, 525, '24px "Segoe UI"', '#e5e7eb', 'center');
    ctx.fillStyle = '#f5f5f5'; rr(ctx, W / 2 - 230, 740, 460, 96, 48); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#000'; rr(ctx, W / 2 - 230, 740, 460, 96, 48); ctx.stroke();
    T(ctx, 'Toque para iniciar', W / 2, 790, 'bold 36px "Segoe UI"', C.primary, 'center');
    fs.writeFileSync(OUT('home_m.png'), cv.toBuffer('image/png'));
  }

  // ---- aprovado ----
  {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#16a34a'; ctx.beginPath(); ctx.arc(W / 2, 300, 96, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 15; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(W / 2 - 44, 300); ctx.lineTo(W / 2 - 8, 336); ctx.lineTo(W / 2 + 48, 266); ctx.stroke();
    T(ctx, 'Pagamento aprovado!', W / 2, 470, 'bold 44px "Segoe UI"', C.font, 'center');
    T(ctx, 'Retire seu pedido no balcao', W / 2, 522, '26px "Segoe UI"', C.grey, 'center');
    shadowCard(ctx, W / 2 - 160, 580, 320, 150, 20, C.card);
    T(ctx, 'Sua senha', W / 2, 628, '24px "Segoe UI"', C.grey, 'center');
    T(ctx, 'A 123', W / 2, 690, 'bold 64px "Segoe UI"', C.primary, 'center');
    ctx.fillStyle = C.secondary; rr(ctx, W / 2 - 200, 790, 400, 84, 42); ctx.fill();
    T(ctx, 'Tocar para finalizar', W / 2, 832, 'bold 28px "Segoe UI"', '#fff', 'center');
    fs.writeFileSync(OUT('aprovado_m.png'), cv.toBuffer('image/png'));
  }

  console.log('OK: home_m.png cardapio_bg.png aprovado_m.png');
})().catch((e) => { console.error('ERRO', e && e.stack || e); process.exit(1); });
