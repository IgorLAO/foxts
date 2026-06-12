'use strict';
// layout.js — motor de layout em build-time. Dois backends atrás de um único
// compute(tree): "flex" (puro JS, sem deps, empilha linha/coluna com gap/pad) e
// "yoga" (yoga-layout, o mesmo do React Native — flexDirection/justify/align/grow).
//
// O carregamento do Yoga é assíncrono (wasm), mas o cálculo é síncrono. Por isso
// os orquestradores (foxc/vfp) fazem `await loadYogaEngine()` uma vez no início e
// chamam `setEngine("yoga")`; o transpilador continua síncrono.
//
// Contrato da árvore (montada em transpile.js a partir do JSX):
//   container: { container:true, dir:"row"|"column", gap, pad, justify, align, children:[] }
//   folha:     { w, h, grow, place(x,y,w,h) }   // place() grava Top/Left/Width/Height na IR

let _engine = 'flex';   // backend ativo
let _yoga = null;       // { Yoga, E } quando carregado

function setEngine(name) { _engine = name === 'yoga' ? 'yoga' : 'flex'; }
function engine() { return _engine; }
function yogaReady() { return !!_yoga; }

// loadYogaEngine: carrega o wasm do yoga-layout uma vez (idempotente). Em falha
// (pacote ausente) devolve null e o compute cai no backend "flex".
async function loadYogaEngine() {
  if (_yoga) return _yoga;
  try {
    const E = require('yoga-layout/load');
    const Yoga = await E.loadYoga();
    _yoga = { Yoga, E };
  } catch (_e) {
    _yoga = null;
  }
  return _yoga;
}

// ---- backend flex (puro JS) ------------------------------------------------
function computeFlex(node, ox, oy) {
  if (!node.container) { node.place(ox, oy, node.w, node.h); return { w: node.w, h: node.h }; }
  const pad = node.pad || 0, gap = node.gap || 0, row = node.dir === 'row';
  let main = (row ? ox : oy) + pad, cross = 0;
  for (const ch of node.children) {
    const cx = row ? main : ox + pad;
    const cy = row ? oy + pad : main;
    const s = computeFlex(ch, cx, cy);
    main += (row ? s.w : s.h) + gap;
    cross = Math.max(cross, row ? s.h : s.w);
  }
  const mainLen = (node.children.length ? main - gap : (row ? ox : oy)) - (row ? ox : oy) + pad;
  return row ? { w: mainLen, h: cross + 2 * pad } : { w: cross + 2 * pad, h: mainLen };
}

// ---- backend yoga ----------------------------------------------------------
function computeYoga(node) {
  const { Yoga, E } = _yoga;
  const JUST = { start: E.Justify.FlexStart, center: E.Justify.Center, end: E.Justify.FlexEnd, between: E.Justify.SpaceBetween, around: E.Justify.SpaceAround, evenly: E.Justify.SpaceEvenly };
  const ALN = { start: E.Align.FlexStart, center: E.Align.Center, end: E.Align.FlexEnd, stretch: E.Align.Stretch };
  const build = (n) => {
    const y = Yoga.Node.create();
    if (n.container) {
      y.setFlexDirection(n.dir === 'row' ? E.FlexDirection.Row : E.FlexDirection.Column);
      if (n.w) y.setWidth(n.w);   // size fixo do container habilita justify/align
      if (n.h) y.setHeight(n.h);
      if (n.gap) y.setGap(E.Gutter.All, n.gap);
      if (n.pad) y.setPadding(E.Edge.All, n.pad);
      if (n.justify && JUST[n.justify] !== undefined) y.setJustifyContent(JUST[n.justify]);
      if (n.align && ALN[n.align] !== undefined) y.setAlignItems(ALN[n.align]);
      if (n.wrap) y.setFlexWrap(E.Wrap.Wrap); // quebra para a próxima linha/coluna ao estourar o size fixo
      n.children.forEach((c, i) => y.insertChild(build(c), i));
    } else {
      y.setWidth(n.w); y.setHeight(n.h);
      if (n.grow) y.setFlexGrow(n.grow);
      if (n.alignSelf && ALN[n.alignSelf] !== undefined) y.setAlignSelf(ALN[n.alignSelf]); // sobrepõe align do pai
    }
    n._y = y;
    return y;
  };
  const root = build(node);
  root.calculateLayout(undefined, undefined, E.Direction.LTR);
  const walk = (n, ox, oy) => {
    const l = n._y.getComputedLayout();
    const x = ox + l.left, yy = oy + l.top;
    if (!n.container) n.place(Math.round(x), Math.round(yy), Math.round(l.width), Math.round(l.height));
    else for (const c of n.children) walk(c, x, yy);
  };
  walk(node, 0, 0);
  root.freeRecursive();
}

// compute: posiciona a árvore (chama place() em cada folha) com o backend ativo.
function compute(tree) {
  if (_engine === 'yoga' && _yoga) computeYoga(tree);
  else computeFlex(tree, 0, 0);
}

module.exports = { compute, setEngine, engine, yogaReady, loadYogaEngine };
