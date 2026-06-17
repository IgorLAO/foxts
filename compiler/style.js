'use strict';
// style.js — tradução de props de estilo (variant/color/textColor/font*/rounded/border/
// class utilitario) e de icones para props VFP. Extraido do transpile.js. Depende so de
// theme (themeColor/hexToRGB/THEME) + util (foxString) — sem emitExpr/parseJsx.
const { THEME, themeColor, hexToRGB } = require('./theme');
const { foxString } = require('./util');

// applyStyle: aplica StyleProps (variant/color/textColor/disabled/bold/font*/textAlign/
// rounded/border*/class/transparent) num objeto de props VFP. Devolve {width,height} se
// o `class` trouxe w-/h- (afetam layout). BackStyle vira OPACO quando ha cor de fundo.
function applyStyle(props, a) {
  if (typeof a.variant === 'string') {
    const bg = themeColor(a.variant); if (bg) props.BackColor = bg;
    props.ForeColor = hexToRGB(THEME.white);
  }
  if (typeof a.color === 'string') { const c = themeColor(a.color); if (c) props.BackColor = c; }
  if (typeof a.textColor === 'string') { const c = themeColor(a.textColor); if (c) props.ForeColor = c; }
  if (a.disabled === true) props.Enabled = '.F.';
  if (a.bold === true) props.FontBold = '.T.';
  // tipografia (Font* existem em todo controle visual) + alinhamento de texto.
  if (typeof a.fontSize === 'number') props.FontSize = a.fontSize;
  if (typeof a.fontName === 'string') props.FontName = foxString(a.fontName);
  if (a.italic === true) props.FontItalic = '.T.';
  if (typeof a.textAlign === 'string') { const al = { left: 0, center: 2, right: 1, auto: 3 }[a.textAlign]; if (al != null) props.Alignment = al; }
  // bordas e cantos arredondados (Shape/Container): rounded -> Curvature (0-90).
  if (typeof a.rounded === 'number') props.Curvature = a.rounded;
  if (typeof a.borderColor === 'string') { const c = themeColor(a.borderColor); if (c) props.BorderColor = c; }
  if (typeof a.borderWidth === 'number') props.BorderWidth = a.borderWidth;
  const cls = typeof a.class === 'string' ? applyClass(props, a.class) : {};
  // BackStyle: cor de fundo aplicada -> OPACO (senao a cor nao aparece, ex.: container
  // que vem com BackStyle 0 por padrao); `transparent` força 0 (label sobre card/fundo).
  if (a.transparent === true) props.BackStyle = 0;
  else if (props.BackColor != null) props.BackStyle = 1;
  return cls;
}

// applyClass: utilitários tipo Tailwind (`class="w-120 h-30 primary bg-red bold"`)
// -> props VFP. w-/h- voltam como { width, height } (afetam o layout).
function applyClass(props, cls) {
  const out = {};
  for (const tok of cls.trim().split(/\s+/)) {
    let m;
    if ((m = /^w-(\d+)$/.exec(tok))) out.width = Number(m[1]);
    else if ((m = /^h-(\d+)$/.exec(tok))) out.height = Number(m[1]);
    else if ((m = /^t-(\d+)$/.exec(tok))) props.FontSize = Number(m[1]); // tamanho da fonte
    else if ((m = /^text-(left|center|right)$/.exec(tok))) props.Alignment = { left: 0, center: 2, right: 1 }[m[1]]; // alinhamento (antes de text-<cor>)
    else if ((m = /^bg-(.+)$/.exec(tok))) { const c = themeColor(m[1]); if (c) props.BackColor = c; }
    else if ((m = /^text-(.+)$/.exec(tok))) { const c = themeColor(m[1]); if (c) props.ForeColor = c; }
    else if (tok === 'bold') props.FontBold = '.T.';
    else if (tok === 'italic') props.FontItalic = '.T.';
    else if (tok === 'transparent') props.BackStyle = 0;
    else if (tok === 'disabled') props.Enabled = '.F.';
    else { const c = themeColor(tok); if (c) { props.BackColor = c; props.ForeColor = hexToRGB(THEME.white); } } // variant
  }
  return out;
}

const growOf = (a) => (typeof a.grow === 'number' ? a.grow : a.grow === true ? 1 : (typeof a.flexGrow === 'number' ? a.flexGrow : 0));
// alignSelf por-item (sobrepõe o align do container no eixo cruzado): start|center|end|stretch
const alignSelfOf = (a) => (typeof a.alignSelf === 'string' ? a.alignSelf : undefined);

// iconPath: resolve `icon="save"` -> "icons/save.png" (convenção; dir do projeto,
// resolvido em runtime como os forms). Se já vier com pasta/extensão, usa verbatim.
// Permite trocar o set inteiro de ícones sem tocar nos forms (só os PNGs em icons/).
function iconPath(name) {
  return /[\\/.]/.test(name) ? name : `icons/${name}.png`;
}
// iconVariantPath: como iconPath, mas escolhe a VARIANTE de cor do PNG (icons/<name>-<cor>.png)
// p/ casar com o fg do controle host — senão o glifo escuro (default onSurface) fica
// ilegível sobre botao primary/danger. color=null usa o default. Caminho custom = verbatim.
function iconVariantPath(name, color) {
  if (/[\\/.]/.test(name)) return name;
  return color ? `icons/${name}-${color}.png` : `icons/${name}.png`;
}

module.exports = { applyStyle, applyClass, growOf, alignSelfOf, iconPath, iconVariantPath };
