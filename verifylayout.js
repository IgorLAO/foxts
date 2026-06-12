'use strict';
// verifylayout.js — Frente A: flex-wrap + alignSelf (motor Yoga), prova de geometria
// em build-time (sem VFP). Transpila examples/wrap.form.tsx com o Yoga ativo e confere
// que os 4 botões da Row(wrap, width=200) quebraram em 2 linhas e que o Label com
// alignSelf="end" foi empurrado no eixo cruzado (à direita do container align="start").

const path = require('path');
const layout = require('./layout');
const { transpileForm } = require('./transpile');

(async () => {
  const ok = await layout.loadYogaEngine();
  if (!ok) { console.log('  yoga-layout indisponível — pulando (precisa do backend Yoga)'); process.exit(0); }
  layout.setEngine('yoga');

  const ir = transpileForm(path.resolve('examples/wrap.form.tsx'));
  const byCaption = {};
  for (const c of ir.controls) byCaption[c.caption] = c;
  const A = byCaption.A, B = byCaption.B, C = byCaption.C, D = byCaption.D, rod = byCaption.rodape;

  const checks = [];
  const add = (name, cond, detail) => checks.push([name, !!cond, detail]);

  // linha 1: A e B no mesmo top; linha 2: C e D num top maior (quebraram)
  add('A e B na mesma linha', A && B && A.top === B.top, A && B ? `A.top=${A.top} B.top=${B.top}` : 'faltam controles');
  add('C e D na mesma linha', C && D && C.top === D.top, C && D ? `C.top=${C.top} D.top=${D.top}` : 'faltam controles');
  add('C/D quebraram p/ 2a linha', C && A && C.top > A.top, C && A ? `C.top=${C.top} > A.top=${A.top}` : 'faltam controles');
  // alignSelf="end": rodape empurrado à direita (left > 0, vs container align="start")
  add('alignSelf=end empurra o rodape', rod && rod.left > A.left, rod && A ? `rodape.left=${rod.left} > A.left=${A.left}` : 'faltam controles');

  let pass = 0;
  console.log('\n  geometria de layout (Yoga: wrap + alignSelf)');
  console.log('  ' + '-'.repeat(46));
  for (const [name, okc, detail] of checks) { if (okc) pass++; console.log(`  ${okc ? 'OK ' : 'XX '} ${name}  (${detail})`); }
  console.log('  ' + '-'.repeat(46));
  console.log(`\n  ${pass}/${checks.length} checks de layout\n`);
  process.exit(pass === checks.length ? 0 : 1);
})();
