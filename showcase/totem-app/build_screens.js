'use strict';
// build_screens.js — fundos do totem (600x920, escala 1:1 com o form). Cada tela é um
// PNG renderizado (gradientes/cantos/sombra/texto AA); os elementos dinâmicos
// (quantidades, total, status) NÃO são desenhados aqui — entram como labels
// transparentes por cima no Totem.form.tsx. Coordenadas batem com o form.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const A = (f) => path.join(__dirname, 'assets', f);
const OUT = (f) => path.join(__dirname, 'screens', f);
const W = 600, H = 920;
const C = { bg: '#FAFAFA', font: '#111827', grey: '#6b7280', primary: '#ed1e26', cancel: '#ede8e8', card: '#FFFFFF', secondary: '#283593', green: '#16a34a', light: '#FCFFF9' };

function rr(x, c, X, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(X + r, y); c.arcTo(X + w, y, X + w, y + h, r); c.arcTo(X + w, y + h, X, y + h, r); c.arcTo(X, y + h, X, y, r); c.arcTo(X, y, X + w, y, r); c.closePath(); }
function card(c, x, y, w, h, r) { c.save(); c.shadowColor = 'rgba(0,0,0,0.14)'; c.shadowBlur = 22; c.shadowOffsetY = 8; c.fillStyle = C.card; rr(0, c, x, y, w, h, r); c.fill(); c.restore(); }
function T(c, t, x, y, font, color, align) { c.font = font; c.fillStyle = color; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(t, x, y); }
function pill(c, x, y, w, h, bg, fg, t, font) { c.fillStyle = bg; rr(0, c, x, y, w, h, h / 2); c.fill(); T(c, t, x + w / 2, y + h / 2 + 1, font, fg, 'center'); }
function btn(c, x, y, s, fill, glyph, gc) { c.fillStyle = fill; rr(0, c, x, y, s, s, 14); c.fill(); T(c, glyph, x + s / 2, y + s / 2 + 1, 'bold 36px "Segoe UI"', gc, 'center'); }
function cover(c, img, x, y, w, h, r) { c.save(); rr(0, c, x, y, w, h, r || 0); c.clip(); const s = Math.max(w / img.width, h / img.height); c.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s); c.restore(); }
function contain(c, img, x, y, w, h) { const s = Math.min(w / img.width, h / img.height); c.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s); }
const novo = () => { const cv = createCanvas(W, H); return [cv, cv.getContext('2d')]; };
const save = (cv, f) => fs.writeFileSync(OUT(f), cv.toBuffer('image/png'));

const PRODS = [['X-Burger', 'R$ 25'], ['Batata Frita', 'R$ 15'], ['Refrigerante', 'R$ 9'], ['Milk Shake', 'R$ 19']];
const ROWS = [120, 230, 340, 450];

(async () => {
  fs.mkdirSync(path.join(__dirname, 'screens'), { recursive: true });
  const logo = await loadImage(A('logo300.png'));
  const logo132 = await loadImage(A('logo132.png'));
  const bgHome = await loadImage(A('homeBackground.png'));
  const comer = await loadImage(A('comer.jpg'));
  const levar = await loadImage(A('levar.jpg'));

  // ---- 1 HOME ----
  { const [cv, c] = novo();
    cover(c, bgHome, 0, 0, W, H); c.fillStyle = 'rgba(8,10,20,0.45)'; c.fillRect(0, 0, W, H);
    contain(c, logo, W / 2 - 140, 120, 280, 250);
    T(c, 'Bem-vindo', W / 2, 470, 'bold 66px "Segoe UI"', C.light, 'center');
    T(c, 'toque para comecar seu pedido', W / 2, 525, '24px "Segoe UI"', '#e5e7eb', 'center');
    c.fillStyle = '#f5f5f5'; rr(0, c, W / 2 - 230, 740, 460, 96, 48); c.fill();
    c.lineWidth = 5; c.strokeStyle = '#000'; rr(0, c, W / 2 - 230, 740, 460, 96, 48); c.stroke();
    T(c, 'Toque para iniciar', W / 2, 790, 'bold 36px "Segoe UI"', C.primary, 'center');
    save(cv, 'home.png'); }

  // ---- 2 MODO DE ENTREGA ----
  { const [cv, c] = novo();
    c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
    c.drawImage(logo132, W - 84 - 18, 14, 84, 84);
    T(c, 'Seu pedido e para?', W / 2, 150, 'bold 46px "Segoe UI"', C.font, 'center');
    // card comer (40,280,240,300) / levar (320,280,240,300)
    for (const [x, img, cap] of [[40, comer, 'Comer aqui'], [320, levar, 'Levar']]) {
      card(c, x, 280, 240, 300, 24);
      cover(c, img, x + 26, 280 + 30, 188, 180, 14);
      T(c, cap, x + 120, 280 + 252, 'bold 30px "Segoe UI"', C.font, 'center');
    }
    pill(c, 180, 660, 240, 72, C.cancel, C.font, 'Cancelar', 'bold 28px "Segoe UI"');
    save(cv, 'modo.png'); }

  // ---- 3 CARDAPIO (interativo) ----
  { const [cv, c] = novo();
    c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
    T(c, 'Cardapio', 24, 50, 'bold 40px "Segoe UI"', C.font, 'left');
    c.drawImage(logo132, W - 84 - 18, 8, 84, 84);
    PRODS.forEach((p, i) => { const y = ROWS[i];
      card(c, 24, y, 552, 96, 18);
      T(c, p[0], 48, y + 40, 'bold 26px "Segoe UI"', C.font, 'left');
      T(c, p[1], 48, y + 72, 'bold 22px "Segoe UI"', C.primary, 'left');
      btn(c, 394, y + 22, 52, '#f3f4f6', '-', C.primary);
      btn(c, 514, y + 22, 52, C.primary, '+', '#ffffff');
    });
    card(c, 24, 560, 552, 72, 18); T(c, 'Total', 48, 560 + 38, 'bold 28px "Segoe UI"', C.font, 'left');
    pill(c, 24, 720, 250, 66, C.cancel, C.font, 'Limpar', 'bold 28px "Segoe UI"');
    pill(c, 300, 720, 276, 66, C.primary, '#fff', 'Pagar', 'bold 30px "Segoe UI"');
    save(cv, 'cardapio.png'); }

  // ---- 4 PAGAMENTO ----
  { const [cv, c] = novo();
    c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
    T(c, 'Pagamento', 24, 50, 'bold 40px "Segoe UI"', C.font, 'left');
    c.drawImage(logo132, W - 84 - 18, 8, 84, 84);
    T(c, 'Total a pagar', W / 2, 150, '28px "Segoe UI"', C.grey, 'center');
    T(c, 'Como deseja pagar?', W / 2, 300, 'bold 32px "Segoe UI"', C.font, 'center');
    const methods = [['Cartao de credito', C.secondary, 350], ['Cartao de debito', C.secondary, 448], ['Pix', C.green, 546]];
    methods.forEach((m) => { card(c, 60, m[2], 480, 78, 16);
      c.fillStyle = m[1]; rr(0, c, 90, m[2] + 22, 56, 40, 8); c.fill();
      T(c, m[0], 170, m[2] + 42, 'bold 28px "Segoe UI"', C.font, 'left');
      T(c, '>', 500, m[2] + 42, 'bold 40px "Segoe UI"', C.grey, 'center');
    });
    c.fillStyle = '#e5e7eb'; rr(0, c, 60, 700, 480, 14, 7); c.fill(); // track
    pill(c, 180, 740, 240, 68, C.cancel, C.font, 'Cancelar', 'bold 28px "Segoe UI"');
    save(cv, 'pagamento.png'); }

  // ---- 5 APROVADO ----
  { const [cv, c] = novo();
    c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
    c.fillStyle = C.green; c.beginPath(); c.arc(W / 2, 300, 96, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 15; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(W / 2 - 44, 300); c.lineTo(W / 2 - 8, 336); c.lineTo(W / 2 + 48, 266); c.stroke();
    T(c, 'Pagamento aprovado!', W / 2, 470, 'bold 44px "Segoe UI"', C.font, 'center');
    T(c, 'Retire seu pedido no balcao', W / 2, 522, '26px "Segoe UI"', C.grey, 'center');
    card(c, W / 2 - 160, 580, 320, 150, 20); T(c, 'Sua senha', W / 2, 628, '24px "Segoe UI"', C.grey, 'center');
    T(c, 'A 123', W / 2, 690, 'bold 64px "Segoe UI"', C.primary, 'center');
    pill(c, W / 2 - 200, 790, 400, 84, C.secondary, '#fff', 'Tocar para finalizar', 'bold 28px "Segoe UI"');
    save(cv, 'aprovado.png'); }

  console.log('OK screens: home modo cardapio pagamento aprovado');
})().catch((e) => { console.error('ERRO', e && e.stack || e); process.exit(1); });
