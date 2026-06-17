'use strict';
// jsx.js — o compilador de UI: render()/JSX -> arvore de controles com layout resolvido
// em build-time (parseJsx) + os leaf-builders (controlLeaf/containerLeaf/flatButtonLeaf/
// sidebarItemLeaf/componentLeaf) e helpers de AST JSX. Extraido do transpile.js (o MAIOR
// bloco do monolito). Acoplamento com o nucleo: emitExpr/emitCall via ctx (injetados).
const ts = require('typescript');
const path = require('path');
const layout = require('../layout');
const { CompileError, ind, foxString, hasDeco, cap1, readPropsBag } = require('./util');
const { THEME, themeColor, shade, hexToRGB } = require('./theme');
const { applyStyle, growOf, alignSelfOf, iconPath, iconVariantPath } = require('./style');
const { bindMemberDefault } = require('./validation');

const JSX_BASECLASS = {
  Label: 'label', TextBox: 'textbox', EditBox: 'editbox', Button: 'commandbutton',
  CommandButton: 'commandbutton', CheckBox: 'checkbox', ComboBox: 'combobox',
  Grid: 'grid', Timer: 'timer', Image: 'image', Shape: 'shape', OptionGroup: 'optiongroup',
};
// NAMED_ICONS: aliases estilo lucide-react (<SaveIcon/> = <Icon name="save"/>). O nome
// casa com o PNG gerado por showcase/.../build-icons.js (rasteriza o SVG do Lucide).
const NAMED_ICONS = {
  SaveIcon: 'save', SearchIcon: 'search', UserIcon: 'user', UsersIcon: 'users',
  SettingsIcon: 'settings', TrashIcon: 'trash', PlusIcon: 'plus', EditIcon: 'edit',
  HomeIcon: 'home', ChartIcon: 'chart', BagIcon: 'bag', BellIcon: 'bell',
  CheckIcon: 'check', XIcon: 'x', FileIcon: 'file', FolderIcon: 'folder',
  CreditCardIcon: 'credit-card', LogOutIcon: 'log-out', MenuIcon: 'menu',
};
const SIZE_DEFAULTS = {
  label: { w: 100, h: 17 }, textbox: { w: 120, h: 23 }, editbox: { w: 180, h: 60 },
  commandbutton: { w: 100, h: 27 }, checkbox: { w: 140, h: 20 }, combobox: { w: 120, h: 23 },
  grid: { w: 320, h: 160 }, _: { w: 100, h: 23 },
};
const NAME_PREFIX = {
  label: 'lbl', textbox: 'txt', editbox: 'edt', commandbutton: 'cmd', checkbox: 'chk',
  combobox: 'cbo', grid: 'grd', timer: 'tmr', image: 'img', shape: 'shp', optiongroup: 'opt',
  container: 'cnt', pageframe: 'pgf',
};

// readJsxAttrs: atributos do elemento -> { nome: valor } (string | número | {ident}
// | {expr} | boolean). `form={X}` vira {ident:"X"}; `clienteId={this.id}` vira {expr}.
// `scope` resolve `{this.prop}` dentro do render() de um @Component (substituição
// pelo valor passado no uso).
function readJsxAttrs(node, ctx, scope = {}) {
  const el = ts.isJsxElement(node) ? node.openingElement : node;
  const out = {};
  for (const a of el.attributes.properties) {
    if (!ts.isJsxAttribute(a)) continue;
    const k = a.name.getText(ctx.sf);
    const init = a.initializer;
    if (!init) { out[k] = true; continue; }
    if (ts.isStringLiteral(init)) { out[k] = init.text; continue; }
    if (ts.isJsxExpression(init) && init.expression) {
      const e = init.expression;
      if (k === 'props' && ts.isObjectLiteralExpression(e)) out[k] = readPropsBag(e, ctx); // props VFP cruas (RHS verbatim), igual ao caminho decorator
      else if (ts.isNumericLiteral(e)) out[k] = Number(e.text);
      else if (ts.isStringLiteral(e)) out[k] = e.text;
      else if (ts.isIdentifier(e)) out[k] = { ident: e.text };
      else if (e.kind === ts.SyntaxKind.TrueKeyword) out[k] = true;
      else if (e.kind === ts.SyntaxKind.FalseKeyword) out[k] = false;
      else if (ts.isPropertyAccessExpression(e) && e.expression.kind === ts.SyntaxKind.ThisKeyword && e.name.text in scope) {
        out[k] = scope[e.name.text]; // prop do @Component -> valor do uso
      } else out[k] = { expr: ctx.emitExpr(e, ctx) };
    }
  }
  return out;
}

// followToComponentClass: a partir de um símbolo, encontra a ClassDeclaration @Component
// que ele (eventualmente) designa. Segue alias de import e, p/ compound components, a
// atribuição de propriedade `Object.assign(Card, { Header: CardHeader })` -> identifier
// CardHeader -> a classe. `depth` evita laço em shorthand recursivo.
function followToComponentClass(sym, ctx, depth = 0) {
  if (!sym || depth > 6) return null;
  if (sym.flags & ts.SymbolFlags.Alias) sym = ctx.checker.getAliasedSymbol(sym);
  const decls = sym.declarations || [];
  const cls = decls.find((d) => ts.isClassDeclaration(d) && hasDeco(d, 'Component'));
  if (cls) return cls;
  // propriedade de um objeto ({ Header: CardHeader }) -> segue o identifier do valor
  for (const d of decls) {
    let init = null;
    if (ts.isPropertyAssignment(d)) init = d.initializer;
    else if (ts.isShorthandPropertyAssignment(d)) init = d.name;
    if (init && ts.isIdentifier(init)) {
      const r = followToComponentClass(ctx.checker.getSymbolAtLocation(init), ctx, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

// resolveComponentClass: tag JSX (<SaveButton/> ou <Card.Header/>) -> a ClassDeclaration
// @Component que ela referencia. Aceita tag simples e pontuada (compound). null se não.
function resolveComponentClass(node, ctx) {
  const el = ts.isJsxElement(node) ? node.openingElement : node;
  return followToComponentClass(ctx.checker.getSymbolAtLocation(el.tagName), ctx);
}

const jsxKids = (node) => (ts.isJsxElement(node) ? Array.from(node.children) : []).filter(
  (c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c)
);
const jsxTag = (node) => (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText();
// jsxText: texto literal direto de um elemento (<Button>Salvar</Button> -> "Salvar").
// Estilo React: o conteúdo textual vira a caption/título do controle (ver parseJsx).
const jsxText = (node) => !ts.isJsxElement(node) ? '' :
  node.children.filter((c) => ts.isJsxText(c)).map((c) => c.text.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');

// parseJsx: nó JSX -> modelo de layout/controle. `scope` carrega as props quando
// estamos dentro do render() expandido de um @Component.
function parseJsx(node, ctx, scope = {}) {
  if (ts.isParenthesizedExpression(node)) return parseJsx(node.expression, ctx, scope);
  if (ts.isJsxFragment(node)) return { kind: 'box', dir: 'column', gap: 10, pad: 10, children: jsxKids(node).map((c) => parseJsx(c, ctx, scope)) };
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tag = jsxTag(node);
    const attrs = readJsxAttrs(node, ctx, scope);
    // Texto-filho vira caption (estilo React: <Button>Salvar</Button>, <Label>Oi</Label>,
    // <Card.Header>Titulo</Card.Header>). Só preenche se não houver caption explícita.
    { const t = jsxText(node); if (t && attrs.caption === undefined) attrs.caption = t; }
    // <Slot/>: ponto de inserção dos children dentro do render() de um @Component.
    // Os filhos do USO (<MyCard><Field/></MyCard>) chegam em scope.__children já com
    // o escopo do CHAMADOR (closure léxica) — aqui são parseados e splicados. Sem
    // children, o slot é um box vazio (some no layout). `direction`/`gap` opcionais.
    if (tag === 'Slot') {
      const slot = scope && scope.__children;
      const nodes = slot ? slot.nodes : [];
      const callerScope = slot ? slot.scope : {};
      const callerCtx = slot && slot.ctx ? slot.ctx : ctx; // children pertencem ao arquivo do CHAMADOR
      return {
        kind: 'box', dir: attrs.direction === 'row' ? 'row' : 'column',
        gap: typeof attrs.gap === 'number' ? attrs.gap : 10,
        pad: typeof attrs.padding === 'number' ? attrs.padding : 0,
        align: typeof attrs.align === 'string' ? attrs.align : undefined,
        justify: typeof attrs.justify === 'string' ? attrs.justify : undefined,
        children: nodes.map((c) => parseJsx(c, callerCtx, callerScope)),
      };
    }
    if (tag === 'Column' || tag === 'Row' || tag === 'View') {
      const dir = tag === 'Row' ? 'row' : tag === 'Column' ? 'column' : (attrs.flexDirection === 'row' ? 'row' : 'column');
      return {
        kind: 'box', dir,
        gap: typeof attrs.gap === 'number' ? attrs.gap : 10,
        pad: typeof attrs.padding === 'number' ? attrs.padding : (typeof attrs.pad === 'number' ? attrs.pad : 10),
        justify: typeof attrs.justify === 'string' ? attrs.justify : undefined,
        align: typeof attrs.align === 'string' ? attrs.align : undefined,
        wrap: attrs.wrap === true || attrs.flexWrap === 'wrap', // quebra de linha (precisa de width/height fixo)
        absolute: attrs.absolute === true, // overlay: filhos posicionados por left/top
        w: typeof attrs.width === 'number' ? attrs.width : undefined,  // size fixo habilita justify/align/wrap
        h: typeof attrs.height === 'number' ? attrs.height : undefined,
        children: jsxKids(node).map((c) => parseJsx(c, ctx, scope)),
      };
    }
    // <Container>/<Panel>: vira um controle `container` do VFP com filhos aninhados
    // (PARENT = nome do container, coords relativas). Tem layout interno próprio.
    if (tag === 'Container' || tag === 'Panel') {
      return {
        kind: 'container',
        dir: attrs.flexDirection === 'row' ? 'row' : 'column',
        gap: typeof attrs.gap === 'number' ? attrs.gap : 8,
        pad: typeof attrs.padding === 'number' ? attrs.padding : (typeof attrs.pad === 'number' ? attrs.pad : 8),
        justify: typeof attrs.justify === 'string' ? attrs.justify : undefined,
        align: typeof attrs.align === 'string' ? attrs.align : undefined,
        attrs, node,
        children: jsxKids(node).map((c) => parseJsx(c, ctx, scope)),
      };
    }
    // <PageFrame>: pageframe nativo do VFP. Cada <Page caption> vira uma página
    // (PageCount + PageN.Caption); os filhos da página são controles reais com
    // PARENT = pgf.PageN (aninhamento de verdade, acessível via thisform.pgf.Page1.x).
    if (tag === 'PageFrame') {
      const pages = jsxKids(node).map((c) => {
        if (jsxTag(c) !== 'Page') throw new CompileError('<PageFrame> aceita apenas <Page> como filho direto', c, ctx.sf);
        const pa = readJsxAttrs(c, ctx, scope);
        return {
          caption: typeof pa.caption === 'string' ? pa.caption : undefined,
          dir: pa.flexDirection === 'row' ? 'row' : 'column',
          gap: typeof pa.gap === 'number' ? pa.gap : 8,
          pad: typeof pa.padding === 'number' ? pa.padding : (typeof pa.pad === 'number' ? pa.pad : 12),
          children: jsxKids(c).map((g) => parseJsx(g, ctx, scope)),
        };
      });
      if (!pages.length) throw new CompileError('<PageFrame> precisa de ao menos uma <Page>', node, ctx.sf);
      return { kind: 'pageframe', attrs, node, pages };
    }
    if (tag === 'Page') throw new CompileError('<Page> só é válida dentro de <PageFrame>', node, ctx.sf);
    // <Grid columns={N} gap>: GRID DE LAYOUT declarativo (estilo CSS grid) — distribui os
    // filhos em N colunas, sem coordenadas. Açúcar sobre Column-de-Rows; cada célula cresce
    // igualmente (grow=1 injetado). Difere do <Grid source> (grade de dados) pela prop columns.
    if (tag === 'Grid' && typeof attrs.columns === 'number') {
      const cols = Math.max(1, attrs.columns);
      const gap = typeof attrs.gap === 'number' ? attrs.gap : 12;
      const kids = jsxKids(node).map((c) => parseJsx(c, ctx, scope));
      for (const k of kids) { // célula cresce p/ preencher a coluna (sem largura fixa)
        if (k && k.kind === 'container') { k.attrs = k.attrs || {}; if (k.attrs.grow === undefined && k.attrs.flexGrow === undefined) k.attrs.grow = 1; }
      }
      const rows = [];
      for (let i = 0; i < kids.length; i += cols)
        rows.push({ kind: 'box', dir: 'row', gap, pad: 0, align: 'stretch', children: kids.slice(i, i + cols) });
      return { kind: 'box', dir: 'column', gap, pad: typeof attrs.padding === 'number' ? attrs.padding : 0,
        w: typeof attrs.width === 'number' ? attrs.width : undefined, children: rows };
    }
    // <Grid> com <GridColumn> -> grid com COLUNAS REAIS (ColumnCount + ColumnN.*).
    // Sem filhos vira um grid simples (folha de controle, compat. com grids "ColumnCount:-1").
    if (tag === 'Grid') {
      const cols = jsxKids(node).map((c) => {
        if (jsxTag(c) !== 'GridColumn') throw new CompileError('<Grid> aceita apenas <GridColumn> como filho direto', c, ctx.sf);
        return readJsxAttrs(c, ctx, scope);
      });
      return { kind: 'grid', attrs, cols, node };
    }
    if (tag === 'GridColumn') throw new CompileError('<GridColumn> só é válida dentro de <Grid>', node, ctx.sf);
    // ── UI Kit: componentes compostos (açúcar sobre primitivos + tokens) ──────────
    // <Card title>: Container surface + cantos arredondados + borda neutra + padding,
    // com um Label de título (bold, onSurface) acima dos filhos. Re-estiliza via tokens.
    if (tag === 'Card') {
      const titleLabel = (txt) => ({ kind: 'control', baseclass: 'label', node, attrs: {
        caption: txt, bold: true, textColor: 'onSurface', fontSize: 13, width: Math.max(120, txt.length * 9),
        fontName: THEME.fontTitle || THEME.fontBody || THEME.font, transparent: true } });
      const divider = () => ({ kind: 'control', baseclass: 'shape', node, attrs: { color: 'border', height: 1, alignSelf: 'stretch' } });
      const directKids = jsxKids(node);
      const isCompound = directKids.some((c) => /^Card\.(Header|Body|Footer)$/.test(jsxTag(c)));
      let head = [], kids = [], foot = [];
      if (isCompound) {
        // Compound components: <Card.Header>/<Card.Body>/<Card.Footer> (estilo React).
        // Header = título + divisória; Body = conteúdo; Footer = linha de ações à direita.
        for (const c of directKids) {
          const t = jsxTag(c);
          const ca = readJsxAttrs(c, ctx, scope);
          const subText = jsxText(c);
          const sub = jsxKids(c).map((g) => parseJsx(g, ctx, scope));
          if (t === 'Card.Header') {
            if (subText) head.push(titleLabel(subText));
            head.push(...sub, divider());
          } else if (t === 'Card.Body') {
            kids.push(...sub);
          } else if (t === 'Card.Footer') {
            foot.push({ kind: 'box', dir: 'row', gap: 8, pad: 0, justify: 'end', align: 'center', children: sub });
          } else {
            throw new CompileError(`<Card> compound aceita apenas <Card.Header>/<Card.Body>/<Card.Footer> (recebeu <${t}/>)`, c, ctx.sf);
          }
        }
      } else {
        // modo simples (compat): <Card title> + filhos diretos.
        const title = typeof attrs.title === 'string' ? attrs.title : undefined;
        kids = directKids.map((c) => parseJsx(c, ctx, scope));
        if (title) head = [titleLabel(title), divider()];
      }
      // fundo do card = SHAPE arredondado atrás (Container não arredonda); container transparente.
      const containerAttrs = {};
      for (const k of ['name', 'width', 'height', 'grow', 'flexGrow', 'alignSelf']) if (attrs[k] !== undefined) containerAttrs[k] = attrs[k];
      return {
        kind: 'container', dir: 'column',
        gap: typeof attrs.gap === 'number' ? attrs.gap : 10,
        pad: typeof attrs.padding === 'number' ? attrs.padding : (typeof attrs.pad === 'number' ? attrs.pad : 16),
        attrs: containerAttrs,
        bg: {
          color: typeof attrs.color === 'string' ? attrs.color : 'surface',
          borderColor: typeof attrs.borderColor === 'string' ? attrs.borderColor : 'border',
          rounded: typeof attrs.rounded === 'number' ? attrs.rounded : 22,
        },
        node,
        children: [...head, ...kids, ...foot],
      };
    }
    // <Card.Header>/<Card.Body>/<Card.Footer> só valem dentro de <Card> (compound).
    if (/^Card\.(Header|Body|Footer)$/.test(tag)) throw new CompileError(`<${tag}> só é válido dentro de <Card>`, node, ctx.sf);
    // <StatCard label value delta>: cartão de métrica de dashboard. Reaproveita o `bg`
    // do Card (shape arredondado + sombra de elevação) e empilha: label (muted, pequeno),
    // valor (grande, bold, fontTitle) e delta opcional (verde se sobe, vermelho se cai —
    // detectado pelo sinal). Açúcar puro sobre primitivos + tokens, re-estilável por tema.
    if (tag === 'StatCard') {
      const label = typeof attrs.label === 'string' ? attrs.label : '';
      const value = attrs.value != null ? String(attrs.value) : '';
      const delta = typeof attrs.delta === 'string' ? attrs.delta : undefined;
      const deltaColor = delta && delta.trim().charAt(0) === '-' ? 'danger' : 'success';
      const containerAttrs = {};
      for (const k of ['name', 'width', 'height', 'grow', 'flexGrow', 'alignSelf']) if (attrs[k] !== undefined) containerAttrs[k] = attrs[k];
      const kids = [
        { kind: 'control', baseclass: 'label', node, attrs: { caption: label, textColor: 'muted', fontSize: 11, width: Math.max(80, label.length * 8), transparent: true } },
        { kind: 'control', baseclass: 'label', node, attrs: { caption: value, bold: true, textColor: 'onSurface', fontSize: 22, height: 30,
          fontName: THEME.fontTitle || THEME.fontBody || THEME.font, width: Math.max(80, value.length * 15), transparent: true } },
      ];
      if (delta) kids.push({ kind: 'control', baseclass: 'label', node, attrs: { caption: delta, textColor: deltaColor, bold: true, fontSize: 11, width: Math.max(50, delta.length * 8), transparent: true } });
      return {
        kind: 'container', dir: 'column',
        gap: typeof attrs.gap === 'number' ? attrs.gap : 4,
        pad: typeof attrs.padding === 'number' ? attrs.padding : 16,
        attrs: containerAttrs,
        bg: {
          color: typeof attrs.color === 'string' ? attrs.color : 'surface',
          borderColor: typeof attrs.borderColor === 'string' ? attrs.borderColor : 'border',
          rounded: typeof attrs.rounded === 'number' ? attrs.rounded : 18,
        },
        node,
        children: kids,
      };
    }
    // <FormField label required bind width>: par Label (muted, pequeno) + TextBox com
    // o espaçamento/alinhamento corretos — substitui o GroupBox+Label+TextBox colado à mão.
    if (tag === 'FormField') {
      const label = typeof attrs.label === 'string' ? attrs.label : '';
      const caption = attrs.required === true ? `${label} *` : label;
      // input tematizado (não branco no dark) + borda FLAT (SpecialEffect 1) em vez do 3D rebaixado
      const fieldAttrs = { color: 'bg', textColor: 'onSurface', props: { SpecialEffect: 1 } };
      if (typeof attrs.bind === 'string') fieldAttrs.bind = attrs.bind;
      if (typeof attrs.field === 'string') fieldAttrs.field = attrs.field; // bind a campo de cursor (detail)
      if (typeof attrs.source === 'string') fieldAttrs.source = attrs.source;
      if (typeof attrs.name === 'string') fieldAttrs.name = attrs.name;
      if (typeof attrs.width === 'number') fieldAttrs.width = attrs.width;
      if (typeof attrs.value === 'string' || typeof attrs.value === 'number') fieldAttrs.value = attrs.value;
      if (typeof attrs.onInteractiveChange === 'string') fieldAttrs.onInteractiveChange = attrs.onInteractiveChange;
      return {
        kind: 'box', dir: 'column', gap: 3, pad: 0,
        w: typeof attrs.width === 'number' ? attrs.width : undefined,
        children: [
          { kind: 'control', baseclass: 'label', node, attrs: { caption, textColor: 'muted', fontSize: 11, width: Math.max(80, caption.length * 7), transparent: true } },
          { kind: 'control', baseclass: 'textbox', node, attrs: fieldAttrs },
        ],
      };
    }
    // <Lookup label bind source display value>: campo de busca/seleção de registro.
    // Combo FLAT (Style 2 = dropdown list) com IncrementalSearch (digita p/ pular ao
    // match) ligado a um cursor/tabela. Mostra `display`, guarda `value` (ou o próprio
    // display) em `bind`. Resolve a dor clássica de "escolher um registro" sem o combo
    // cinza 3D. Mesmo layout do FormField (label muted + campo), input tematizado.
    if (tag === 'Lookup') {
      const label = typeof attrs.label === 'string' ? attrs.label : '';
      const caption = attrs.required === true ? `${label} *` : label;
      const source = typeof attrs.source === 'string' ? attrs.source : undefined;
      const display = typeof attrs.display === 'string' ? attrs.display : undefined;
      const valueField = typeof attrs.value === 'string' ? attrs.value : undefined;
      if (!source || !display) throw new CompileError('<Lookup> precisa de source e display', node, ctx.sf);
      // combo nativo tematizado: RowSourceType 6 (Fields). Com `value`, 2 colunas
      // (display visível + value oculta) e BoundColumn=2 => guarda a chave, mostra o nome.
      const cbo = { RowSourceType: 6, Style: 2, IncrementalSearch: '.T.', SpecialEffect: 1 };
      if (valueField) {
        cbo.RowSource = foxString(`${source}.${display},${valueField}`);
        cbo.ColumnCount = 2; cbo.BoundColumn = 2; cbo.ColumnWidths = foxString('400,0'); // 2ª coluna (chave) oculta
      } else {
        cbo.RowSource = foxString(`${source}.${display}`); cbo.BoundColumn = 1;
      }
      const fieldAttrs = { color: 'bg', textColor: 'onSurface', props: cbo };
      if (typeof attrs.bind === 'string') fieldAttrs.bind = attrs.bind;
      if (typeof attrs.name === 'string') fieldAttrs.name = attrs.name;
      if (typeof attrs.width === 'number') fieldAttrs.width = attrs.width;
      if (typeof attrs.onInteractiveChange === 'string') fieldAttrs.onInteractiveChange = attrs.onInteractiveChange;
      const kids = [];
      if (label) kids.push({ kind: 'control', baseclass: 'label', node, attrs: { caption, textColor: 'muted', fontSize: 11, width: Math.max(80, caption.length * 7), transparent: true } });
      kids.push({ kind: 'control', baseclass: 'combobox', node, attrs: fieldAttrs });
      return { kind: 'box', dir: 'column', gap: 3, pad: 0,
        w: typeof attrs.width === 'number' ? attrs.width : undefined, children: kids };
    }
    // <FlatButton variant icon onClick>: botão flat colorido (Container+Label+hover),
    // não o CommandButton cinza. <Button flat> também cai aqui.
    if (tag === 'FlatButton' || (tag === 'Button' && attrs.flat === true)) {
      return { kind: 'flatbutton', attrs, node };
    }
    // <FormActions ok cancel onOk onCancel>: conjunto pronto OK/Cancelar à direita
    // (Cancelar = secondary, OK/Salvar = primary), com botões flat + gap consistente.
    if (tag === 'FormActions') {
      const kids = [];
      if (attrs.cancel !== false) kids.push({ kind: 'flatbutton', node, attrs: {
        caption: typeof attrs.cancel === 'string' ? attrs.cancel : 'Cancelar',
        variant: 'secondary', onClick: typeof attrs.onCancel === 'string' ? attrs.onCancel : undefined,
      } });
      kids.push({ kind: 'flatbutton', node, attrs: {
        caption: typeof attrs.ok === 'string' ? attrs.ok : 'OK',
        variant: typeof attrs.variant === 'string' ? attrs.variant : 'primary',
        icon: typeof attrs.icon === 'string' ? attrs.icon : undefined,
        onClick: typeof attrs.onOk === 'string' ? attrs.onOk : undefined,
      } });
      return { kind: 'box', dir: 'row', gap: 8, pad: 0, justify: 'end',
        w: typeof attrs.width === 'number' ? attrs.width : undefined,
        children: kids };
    }
    // <Toolbar>: barra de comandos horizontal no topo do form (Win11/Fluent). Faixa
    // flat "surface" full-width (mesmo `bg` do Card, mas SEM cantos nem sombra — encosta
    // no topo) segurando uma linha de <ToolbarButton> compactos + <ToolbarSeparator>.
    // Reaproveita a tecnica shape+container+hover do flatButton: cada botao e um leaf
    // 'flatbutton' (default variant "ghost" = limpo/chato); o separador e um shape fino
    // vertical pintado com a cor de borda (cor numerica -> reaplicada no Init por
    // applyRuntimeColors). Desugara p/ <Container> (row, align center).
    if (tag === 'Toolbar') {
      const kids = jsxKids(node).map((c) => {
        const ct = jsxTag(c);
        const ca = readJsxAttrs(c, ctx, scope);
        if (ct === 'ToolbarSeparator') {
          // divisoria vertical: shape fino (largura 1) pintado com a cor de borda.
          return { kind: 'control', baseclass: 'shape', node: c, attrs: {
            color: 'border', width: 1, height: typeof ca.height === 'number' ? ca.height : 22, alignSelf: 'center' } };
        }
        if (ct === 'ToolbarButton') {
          const label = typeof ca.label === 'string' ? ca.label : (typeof ca.caption === 'string' ? ca.caption : '');
          return { kind: 'flatbutton', node: c, toolbar: true, attrs: {
            caption: label,
            variant: typeof ca.variant === 'string' ? ca.variant : 'ghost', // default limpo/chato
            icon: typeof ca.icon === 'string' ? ca.icon : undefined,
            onClick: typeof ca.onClick === 'string' ? ca.onClick : undefined,
            height: typeof ca.height === 'number' ? ca.height : 28,
            width: typeof ca.width === 'number' ? ca.width : undefined,
          } };
        }
        throw new CompileError('<Toolbar> aceita apenas <ToolbarButton> e <ToolbarSeparator> como filhos', c, ctx.sf);
      });
      const containerAttrs = { alignSelf: 'stretch' };
      for (const k of ['name', 'width', 'height', 'grow', 'flexGrow']) if (attrs[k] !== undefined) containerAttrs[k] = attrs[k];
      return {
        kind: 'container', dir: 'row', align: 'center',
        gap: typeof attrs.gap === 'number' ? attrs.gap : 4,
        pad: typeof attrs.padding === 'number' ? attrs.padding : (typeof attrs.pad === 'number' ? attrs.pad : 6),
        attrs: containerAttrs,
        bg: { color: typeof attrs.color === 'string' ? attrs.color : 'surface',
          borderColor: 'border', rounded: 0, shadow: false }, // faixa flat: sem cantos nem sombra
        node, children: kids,
      };
    }
    if (tag === 'ToolbarButton' || tag === 'ToolbarSeparator') throw new CompileError(`<${tag}> só é válida dentro de <Toolbar>`, node, ctx.sf);
    // ── App shell / screen patterns ──────────────────────────────────────────────
    // <Sidebar width>: navegação vertical (app shell). Container coluna, largura fixa,
    // fundo surface, SEM cantos/sombra (encosta na borda). Filhos (<SidebarItem>) esticam.
    if (tag === 'Sidebar') {
      const kids = jsxKids(node).map((c) => parseJsx(c, ctx, scope));
      const w = typeof attrs.width === 'number' ? attrs.width : 180;
      return {
        kind: 'container', dir: 'column', gap: 3, pad: 10, align: 'stretch',
        attrs: { width: w, alignSelf: 'stretch' },
        bg: { color: typeof attrs.color === 'string' ? attrs.color : 'surface', borderColor: 'border', rounded: 0, shadow: false },
        node, children: kids,
      };
    }
    // <SidebarItem label active icon onClick>: item de navegação full-width (hover +
    // estado ativo: barra de acento + fundo primary suave + texto/negrito primary).
    if (tag === 'SidebarItem') return { kind: 'sidebaritem', attrs, node };
    // <SearchBox bind onSearch placeholder>: barra de busca flat. TextBox full-width com
    // placeholder cinza (limpa no foco) + onSearch a cada tecla (InteractiveChange) —
    // tipicamente filtra a lista do master-detail.
    if (tag === 'SearchBox') {
      const ph = typeof attrs.placeholder === 'string' ? attrs.placeholder : 'Buscar...';
      const muted = hexToRGB(THEME.muted), fgN = hexToRGB(THEME.onSurface);
      const fieldAttrs = { color: 'bg', textColor: 'muted', value: ph, grow: 1,
        props: { SpecialEffect: 1 },
        // placeholder: limpa ao focar; restaura cinza ao sair vazio.
        methods: {
          GotFocus: `IF ALLTRIM(This.Value) == ${foxString(ph)}\n  This.Value = ""\n  This.ForeColor = ${fgN}\nENDIF`,
          LostFocus: `IF EMPTY(ALLTRIM(This.Value))\n  This.Value = ${foxString(ph)}\n  This.ForeColor = ${muted}\nENDIF`,
        } };
      if (typeof attrs.bind === 'string') fieldAttrs.bind = attrs.bind;
      if (typeof attrs.name === 'string') fieldAttrs.name = attrs.name;
      // busca de verdade: com source+field, a cada tecla aplica SET FILTER (contém, case-
      // insensitive) no cursor e dá Refresh — filtra a lista do master-detail ao vivo.
      const src = typeof attrs.source === 'string' ? attrs.source : undefined;
      const fld = typeof attrs.field === 'string' ? attrs.field : (typeof attrs.display === 'string' ? attrs.display : undefined);
      const onSearch = typeof attrs.onSearch === 'string' ? attrs.onSearch
        : (typeof attrs.onInteractiveChange === 'string' ? attrs.onInteractiveChange : undefined);
      if (src && fld) {
        fieldAttrs.methods.InteractiveChange = [
          'LOCAL lcF', 'lcF = UPPER(ALLTRIM(This.Value))',
          'IF EMPTY(lcF)', `  SET FILTER TO IN ${src}`,
          'ELSE', `  SET FILTER TO lcF $ UPPER(${src}.${fld}) IN ${src}`,
          'ENDIF', `GO TOP IN ${src}`, 'ThisForm.Refresh()',
        ].join('\n');
      } else if (onSearch) {
        fieldAttrs.onInteractiveChange = onSearch;
      }
      return { kind: 'box', dir: 'row', gap: 8, pad: 0, align: 'center',
        w: typeof attrs.width === 'number' ? attrs.width : undefined,
        children: [{ kind: 'control', baseclass: 'textbox', node, attrs: fieldAttrs }] };
    }
    // <EmptyState message action onAction icon>: estado vazio (lista sem registros) —
    // coluna centrada: mensagem muted + botão de ação opcional. "cara de produto".
    if (tag === 'EmptyState') {
      const message = typeof attrs.message === 'string' ? attrs.message : 'Nada por aqui ainda';
      const kids = [{ kind: 'control', baseclass: 'label', node, attrs: { caption: message, textColor: 'muted', fontSize: 13,
        width: Math.max(160, message.length * 8), bold: true, transparent: true } }];
      if (typeof attrs.action === 'string') kids.push({ kind: 'flatbutton', node, attrs: {
        caption: attrs.action, variant: 'primary', icon: typeof attrs.icon === 'string' ? attrs.icon : undefined,
        onClick: typeof attrs.onAction === 'string' ? attrs.onAction : undefined } });
      return { kind: 'box', dir: 'column', gap: 12, pad: 24, align: 'center', justify: 'center',
        w: typeof attrs.width === 'number' ? attrs.width : undefined,
        h: typeof attrs.height === 'number' ? attrs.height : undefined, children: kids };
    }
    // <Icon name size color/> e aliases nomeados (<SaveIcon/>): vira um controle Image
    // apontando p/ o PNG do ícone (rasterizado do SVG do Lucide). BackStyle 0 = alpha.
    // `color` escolhe a variante recolorida (icons/<name>-<color>.png); sem cor = default.
    if (tag === 'Icon' || NAMED_ICONS[tag]) {
      const name = NAMED_ICONS[tag] || (typeof attrs.name === 'string' ? attrs.name : null);
      if (!name) throw new CompileError('<Icon> precisa de name="..." (ex.: <Icon name="save"/>)', node, ctx.sf);
      const size = typeof attrs.size === 'number' ? attrs.size : 16; // casa com RENDER_PX (VFP nao escala PNG alpha)
      const color = typeof attrs.color === 'string' ? attrs.color : null;
      const file = color ? `icons/${name}-${color}.png` : `icons/${name}.png`;
      const iconAttrs = { src: file, width: size, height: size, stretch: 1, props: { BackStyle: 0 } };
      if (typeof attrs.name === 'string' && tag === 'Icon' && typeof attrs.id === 'string') iconAttrs.name = attrs.id;
      if (typeof attrs.alignSelf === 'string') iconAttrs.alignSelf = attrs.alignSelf;
      return { kind: 'control', baseclass: 'image', node, attrs: iconAttrs };
    }
    if (JSX_BASECLASS[tag]) return { kind: 'control', baseclass: JSX_BASECLASS[tag], attrs, node };
    // @Component do usuário: expande o render() dele inline, com as props do uso.
    // Os children do uso entram no escopo como __children (com o escopo do CHAMADOR),
    // para que um <Slot/> dentro do render() os reinjete (composição estilo React).
    const comp = resolveComponentClass(node, ctx);
    if (comp) {
      // O @Component pode viver em OUTRO arquivo (components/, layouts/). O parse do seu
      // render() usa o sourceFile DELE (getText/pos batem); os children do uso continuam
      // com o ctx do CHAMADOR (carregado em __children.ctx) p/ o <Slot/> reinjetar certo.
      // guarda de recursão: ciclo de composição (A->A ou A->B->A) -> CompileError claro,
      // não RangeError de stack. A cadeia atual viaja em ctx.__expanding (Set de classes);
      // como os children do <Slot/> são parseados com o ctx do CHAMADOR (que carrega a
      // cadeia), recursão via children também é pega.
      const expanding = ctx.__expanding || new Set();
      if (expanding.has(comp)) throw new CompileError(`@Component <${tag}/> recursivo (ciclo de composicao)`, node, ctx.sf);
      const compSf = comp.getSourceFile();
      const compCtx = { ...ctx, sf: compSf, __expanding: new Set(expanding).add(comp) };
      const renderM = comp.members.find((m) => ts.isMethodDeclaration(m) && m.name.getText(compSf) === 'render');
      if (!renderM) throw new CompileError(`@Component <${tag}/> precisa de um render()`, node, ctx.sf);
      const kids = jsxKids(node);
      const childScope = { ...attrs, __children: { nodes: kids, scope, ctx } };
      return parseJsx(findRenderReturn(renderM, compCtx), compCtx, childScope); // props + children do uso
    }
    return { kind: 'component', tag, attrs, node }; // built-in (OpenFormButton/SaveButton)
  }
  throw new CompileError('JSX nao suportado: ' + ts.SyntaxKind[node.kind], node, ctx.sf);
}

// applyStyle: variant/color/textColor/disabled/bold + utilitários `class` -> props
// nativas do VFP. Devolve { width, height } se a class definir w-/h- (override).
function ctrlName(attrs, baseclass, st) {
  if (typeof attrs.name === 'string') return attrs.name;
  if (typeof attrs.bind === 'string') return (NAME_PREFIX[baseclass] || 'ctl') + cap1(attrs.bind);
  st.counts[baseclass] = (st.counts[baseclass] || 0) + 1;
  return (NAME_PREFIX[baseclass] || 'ctl') + st.counts[baseclass];
}

// controlLeaf: tag de controle -> folha de layout { w, h, grow, place }. place()
// grava Top/Left/Width/Height finais (após o motor de layout) e empilha na IR.
function controlLeaf(model, ctx, st) {
  const bc = model.baseclass, a = model.attrs;
  const sz = SIZE_DEFAULTS[bc] || SIZE_DEFAULTS._;
  const ctrl = { type: bc, name: ctrlName(a, bc, st) };
  if (typeof a.caption === 'string') ctrl.caption = a.caption;
  const props = {};
  if (typeof a.bind === 'string') {
    props.ControlSource = `"ThisForm.${a.bind}"`; // binding nativo do VFP
    if (!st.ir.members.some((m) => m.name.toLowerCase() === a.bind.toLowerCase())) {
      // default conforme o tipo declarado do campo (schema/validate ou type=) — campo
      // num() ganha default 0 (nao "") p/ @Form({ validate }) nao comparar "" < n.
      const def = bindMemberDefault(a.bind, a, st.ir, ctx);
      st.ir.members.push({ name: a.bind, kind: 'property', desc: `(bind) ${a.bind}`, default: def });
    }
  } else if (typeof a.field === 'string') {
    // bind direto a um CAMPO de cursor/tabela (master-detail: o detalhe segue o registro
    // corrente). Sem criar membro do form — é o cursor que guarda o valor.
    props.ControlSource = foxString(typeof a.source === 'string' ? `${a.source}.${a.field}` : a.field);
  }
  if (typeof a.interval === 'number') props.Interval = a.interval; // Timer: intervalo (ms)
  if (typeof a.value === 'number') props.Value = a.value;
  else if (typeof a.value === 'string') {
    // Value string em memo de design NÃO é avaliada pelo DO FORM (vira literal COM aspas);
    // atribui em runtime no Init (caminho pontilhado resolvido pós-layout), como as cores.
    if (st.post) st.post.push({ setProp: ctrl, prop: 'Value', value: a.value });
    else props.Value = foxString(a.value);
  }
  const pic = typeof a.src === 'string' ? a.src : (typeof a.picture === 'string' ? a.picture
    : (typeof a.icon === 'string' ? iconPath(a.icon) : null)); // icon="save" -> icons/save.png
  if (pic) props.Picture = foxString(pic); // <Image src>/<Button icon> -> Picture (PNG/JPG alpha)
  if (typeof a.stretch === 'number') props.Stretch = a.stretch; // 0=clip 1=isometrico 2=esticar
  const cls = applyStyle(props, a); // utilitários class podem definir w-/h-
  // Shape: preenchimento sólido = FillStyle 0 (Solid) + FillColor (alem do BackColor),
  // senao o interior fica transparente e so a borda aparece.
  if (bc === 'shape' && props.BackColor != null) { props.FillColor = props.BackColor; props.FillStyle = 0; }
  if (a.props && typeof a.props === 'object') Object.assign(props, a.props); // props VFP cruas (RHS verbatim)
  if (Object.keys(props).length) ctrl.properties = props;
  // eventos: onTimer/onClick/onInit/onInteractiveChange/... = "metodo" -> ThisForm.<metodo>()
  for (const k of Object.keys(a)) {
    const m = /^on([A-Z]\w*)$/.exec(k);
    if (m && typeof a[k] === 'string') (ctrl.methods = ctrl.methods || {})[m[1]] = `ThisForm.${a[k]}()`;
  }
  if (a.methods && typeof a.methods === 'object') { ctrl.methods = ctrl.methods || {}; Object.assign(ctrl.methods, a.methods); } // métodos VFP crus (corpo verbatim)
  const w = typeof a.width === 'number' ? a.width : (cls.width != null ? cls.width : sz.w);
  const h = typeof a.height === 'number' ? a.height : (cls.height != null ? cls.height : sz.h);
  return { w, h, grow: growOf(a), alignSelf: alignSelfOf(a),
    absLeft: typeof a.left === 'number' ? a.left : 0, absTop: typeof a.top === 'number' ? a.top : 0, // overlay (pai absolute)
    place: (x, y, W, H) => { ctrl.left = x; ctrl.top = y; ctrl.width = W; ctrl.height = H; st.ir.controls.push(ctrl); } };
}

// componentLeaf: componente built-in (OpenFormButton/SaveButton) -> folha de layout.
function componentLeaf(model, ctx, st) {
  const a = model.attrs, sz = SIZE_DEFAULTS.commandbutton;
  let ctrl;
  if (model.tag === 'OpenFormButton') {
    const form = a.form && a.form.ident;
    if (!form) throw new CompileError('<OpenFormButton/> requer form={ClasseDoForm}', model.node, ctx.sf);
    const skip = new Set(['caption', 'form', 'variant', 'color', 'textColor', 'width', 'height', 'disabled', 'bold', 'grow', 'flexGrow']);
    const withVals = Object.keys(a).filter((k) => !skip.has(k)).map((k) => {
      const v = a[k];
      if (v && typeof v === 'object') return v.expr || v.ident;
      return typeof v === 'string' ? foxString(v) : String(v);
    });
    let doForm = `DO FORM ${form}`;
    if (withVals.length) doForm += ' WITH ' + withVals.join(', ');
    ctrl = { type: 'commandbutton', name: 'cmd' + cap1(form.replace(/Form$/, '')), caption: typeof a.caption === 'string' ? a.caption : form, methods: { Click: doForm } };
  } else if (model.tag === 'SaveButton') {
    ctrl = { type: 'commandbutton', name: 'cmdSalvar', caption: typeof a.caption === 'string' ? a.caption : 'Salvar' };
  } else {
    throw new CompileError(`<${model.tag}/> nao suportado (built-ins: OpenFormButton, SaveButton; ou crie um @Component)`, model.node, ctx.sf);
  }
  const props = {};
  if (typeof a.icon === 'string') props.Picture = foxString(iconPath(a.icon)); // SaveButton icon
  const cls = applyStyle(props, a); if (Object.keys(props).length) ctrl.properties = props;
  const w = typeof a.width === 'number' ? a.width : (cls.width != null ? cls.width : sz.w);
  const h = typeof a.height === 'number' ? a.height : (cls.height != null ? cls.height : sz.h);
  return { w, h, grow: growOf(a), alignSelf: alignSelfOf(a), place: (x, y, W, H) => { ctrl.left = x; ctrl.top = y; ctrl.width = W; ctrl.height = H; st.ir.controls.push(ctrl); } };
}

// containerLeaf: <Container>/<Panel> -> controle `container` do VFP (painel com borda)
// com filhos REALMENTE aninhados. Mede o layout interno para se dimensionar e
// participa do layout do pai como uma folha. Ao ser posicionado, empilha o
// container e seus filhos; cada filho recebe PARENT = nome do container e mantém
// coordenadas RELATIVAS a ele. O genscx qualifica PARENT como caminho pontilhado
// a partir da raiz do form (Form.cnt1), que é o que o VFP exige para a contenção
// valer em runtime — thisform.cnt1.txtNome e cnt1.ControlCount funcionam de fato.
function containerLeaf(model, ctx, st) {
  const a = model.attrs;
  const name = ctrlName(a, 'container', st);
  const pending = [];
  const childSt = { ir: { controls: pending, members: st.ir.members }, counts: st.counts, post: st.post };
  const innerModel = { kind: 'box', dir: model.dir, gap: model.gap, pad: model.pad, justify: model.justify, align: model.align, children: model.children };
  layout.compute(toLayoutTree(innerModel, ctx, childSt)); // posiciona filhos relativo a 0,0
  const right = pending.length ? Math.max(...pending.map((c) => c.left + c.width)) : 0;
  const bottom = pending.length ? Math.max(...pending.map((c) => c.top + c.height)) : 0;
  const w = typeof a.width === 'number' ? a.width : right + model.pad;
  const h = typeof a.height === 'number' ? a.height : bottom + model.pad;
  const ctrl = { type: 'container', name };
  // model.bg => fundo arredondado via SHAPE atrás (Curvature em Container é no-op; em
  // Shape arredonda). O container fica TRANSPARENTE e sem borda; o Shape provê surface+borda+cantos.
  const props = model.bg ? { BorderWidth: 0, BackStyle: 0 } : { BorderWidth: 1, BackStyle: 0 };
  applyStyle(props, a); ctrl.properties = props;
  return {
    w, h, grow: growOf(a), alignSelf: alignSelfOf(a),
    place: (x, y, W, H) => {
      if (model.bg) { // shape de fundo (atrás de tudo), cores aplicadas no Init por applyRuntimeColors
        const surf = themeColor(model.bg.color);
        // sombra sutil: MESMO shape arredondado, deslocado +2/+2 e cinza suave, ATRÁS do fundo
        // (empilhado primeiro => fica embaixo, "vaza" como elevação). Cores no Init (design não aplica).
        if (model.bg.shadow !== false) { // app shell (sidebar) opta por não ter sombra
          const shadow = shade('border', -8); // cinza mutado derivado da borda neutra
          st.ir.controls.push({ type: 'shape', name: 'shd' + name, left: x + 2, top: y + 2, width: W, height: H,
            properties: { BackStyle: 1, FillStyle: 0, Curvature: model.bg.rounded, BorderWidth: 0,
              BackColor: shadow, FillColor: shadow } });
        }
        st.ir.controls.push({ type: 'shape', name: 'shp' + name, left: x, top: y, width: W, height: H,
          properties: { BackStyle: 1, FillStyle: 0, Curvature: model.bg.rounded, BorderWidth: 1,
            BackColor: surf, FillColor: surf, BorderColor: themeColor(model.bg.borderColor) } });
      }
      ctrl.left = x; ctrl.top = y; ctrl.width = W; ctrl.height = H;
      st.ir.controls.push(ctrl);
      // filhos diretos ganham PARENT = container; filhos de sub-containers já têm
      // o seu PARENT setado (aninhamento N níveis). Coords ficam relativas ao pai.
      for (const c of pending) { if (!c.parent) c.parent = name; st.ir.controls.push(c); }
    },
  };
}

// pageFrameLeaf: <PageFrame> -> controle `pageframe` do VFP com páginas reais. As
// páginas não são registros próprios no SCX: vivem nas propriedades pontilhadas do
// pageframe (PageCount + PageN.Caption). Os filhos de cada página são controles
// reais com PARENT = pgf.PageN (qualificado pelo genscx p/ Form.pgf.PageN).
function pageFrameLeaf(model, ctx, st) {
  const a = model.attrs;
  const name = ctrlName(a, 'pageframe', st);
  const pending = [];
  const props = { PageCount: model.pages.length };
  let maxW = 0, maxH = 0;
  model.pages.forEach((pg, idx) => {
    const i = idx + 1;
    props[`Page${i}.Caption`] = foxString(pg.caption || `Page${i}`);
    const pageSt = { ir: { controls: [], members: st.ir.members }, counts: st.counts, post: st.post };
    const innerModel = { kind: 'box', dir: pg.dir, gap: pg.gap, pad: pg.pad, children: pg.children };
    layout.compute(toLayoutTree(innerModel, ctx, pageSt)); // filhos relativos à página (0,0)
    for (const c of pageSt.ir.controls) {
      if (!c.parent) c.parent = `${name}.Page${i}`;
      pending.push(c);
      maxW = Math.max(maxW, c.left + c.width); maxH = Math.max(maxH, c.top + c.height);
    }
  });
  const w = typeof a.width === 'number' ? a.width : maxW + 28;
  const h = typeof a.height === 'number' ? a.height : maxH + 44; // folga p/ a faixa de abas
  const ctrl = { type: 'pageframe', name, properties: props };
  return {
    w, h, grow: growOf(a), alignSelf: alignSelfOf(a),
    place: (x, y, W, H) => {
      ctrl.left = x; ctrl.top = y; ctrl.width = W; ctrl.height = H;
      st.ir.controls.push(ctrl);
      for (const c of pending) st.ir.controls.push(c);
    },
  };
}

// gridLeaf: <Grid source=".."> com <GridColumn> -> controle `grid` com COLUNAS REAIS
// do VFP. ColumnCount (não-pontilhado) materializa as colunas; por coluna grava
// ColumnN.Width e ColumnN.ControlSource (pontilhadas, que o genscx emite DEPOIS do
// Name). RecordSource liga a grade a um cursor (RecordSourceType=1). Os HEADERS NÃO
// vão como prop de design: a vinculação em runtime reescreve o Header1.Caption pelo
// nome do campo (provado no VFP), então são reaplicados no Init via st.post — onde
// o caminho de acesso (ThisForm[.parent].grid) é resolvido após o layout posicionar
// o controle (a contenção do pai é conhecida só aí). Sem filhos, é um grid simples.
function gridLeaf(model, ctx, st) {
  const a = model.attrs;
  const name = ctrlName(a, 'grid', st);
  const sz = SIZE_DEFAULTS.grid;
  const cols = model.cols || [];
  const source = typeof a.source === 'string' ? a.source : (typeof a.recordSource === 'string' ? a.recordSource : undefined);
  const props = {};
  let colW = 0;
  const ctrl = { type: 'grid', name };
  if (cols.length) {
    props.ColumnCount = cols.length;
    props.RecordSourceType = source ? 1 : 0; // 1=Alias (liga ao cursor) | 0=None (grade vazia)
    if (source) props.RecordSource = foxString(source);
    // chrome moderno (default, sobreponível): sem coluna de record/delete mark (o
    // maior "cara de 2003"), só linhas horizontais, scrollbar vertical. Headers em bold.
    const zebra = a.zebra !== false;
    const boldHeaders = a.boldHeaders !== false;
    props.GridLines = typeof a.gridLines === 'number' ? a.gridLines : 1; // 1=horizontal
    props.RecordMark = a.recordMark === true ? '.T.' : '.F.';
    props.DeleteMark = a.deleteMark === true ? '.T.' : '.F.';
    props.ScrollBars = typeof a.scrollBars === 'number' ? a.scrollBars : 2; // 2=vertical
    props.Themes = '.F.'; // header flat com NOSSAS cores (em vez do tema do OS, que não escurece)
    // fundo da grade (incl. área vazia abaixo dos registros) = surface do tema, senão
    // fica BRANCO no dark (default do VFP). Cor numérica -> reaplicada no Init por
    // applyRuntimeColors (design-prop de cor corrompe no load). Texto das células segue
    // por DynamicForeColor (expressão, avaliada em runtime) p/ ficar claro no dark.
    props.BackColor = hexToRGB(THEME.surface);
    if (THEME.fontData) props.FontName = foxString(THEME.fontData); // papel "dados" (Consolas)
    // larguras: a última coluna absorve a sobra (largura do grid - colunas - scrollbar),
    // pra grade não terminar com uma coluna vazia à direita.
    const widths = cols.map((c) => (typeof c.width === 'number' ? c.width : 80));
    colW = widths.reduce((s, w) => s + w, 0);
    if (typeof a.width === 'number') {
      const leftover = a.width - colW - 18; // ~scrollbar vertical + bordas
      if (leftover > 4) { widths[widths.length - 1] += leftover; colW += leftover; }
    }
    // expressão de zebra avaliada por linha (RECNO par -> altRow; ímpar -> surface).
    const zebraExpr = `IIF(MOD(RECNO(),2)=0, ${hexToRGB(THEME.altRow)}, ${hexToRGB(THEME.surface)})`;
    const headBg = shade('surface', THEME._mode === 'dark' ? 12 : -10); // header destacado do corpo
    const headFg = hexToRGB(THEME.onSurface);
    cols.forEach((c, idx) => {
      const i = idx + 1;
      const field = typeof c.field === 'string' ? c.field : (typeof c.bind === 'string' ? c.bind : undefined);
      props[`Column${i}.Width`] = widths[idx];
      if (field) props[`Column${i}.ControlSource`] = foxString(source ? `${source}.${field}` : field);
      if (zebra) props[`Column${i}.DynamicBackColor`] = foxString(zebraExpr); // listras
      props[`Column${i}.DynamicForeColor`] = foxString(String(hexToRGB(THEME.onSurface))); // texto claro no dark
      const header = typeof c.header === 'string' ? c.header : (field ? cap1(field) : undefined);
      // header reaplicado no Init (a vinculação reescreve Caption); bold + cores idem p/
      // não depender de prop de design de 3 níveis (Column.Header1.*) no genscx.
      if (header && st.post) st.post.push({ ctrl, col: i, header, bold: boldHeaders, headBg, headFg });
    });
  }
  const cls = applyStyle(props, a); // class="w-.. h-.." pode sobrepor a largura
  if (Object.keys(props).length) ctrl.properties = props;
  // master-detail: ao mudar de linha, Refresh() atualiza os controles do detalhe
  // (FormField field=.. source=..) que seguem o registro corrente do cursor.
  if (a.syncDetail === true) ctrl.methods = { AfterRowColChange: 'ThisForm.Refresh()' };
  if (typeof a.onRowChange === 'string') { ctrl.methods = ctrl.methods || {}; ctrl.methods.AfterRowColChange = `ThisForm.${a.onRowChange}()`; }
  // após popular o cursor (Load roda antes do Init), o ponteiro fica no último registro;
  // GO TOP no Init faz a grade exibir a partir do 1º (senão ela rola e "some" registros).
  if (source && st.post) st.post.push({ goTop: source });
  const w = typeof a.width === 'number' ? a.width : (cls.width != null ? cls.width : (cols.length ? colW + 24 : sz.w));
  const h = typeof a.height === 'number' ? a.height : (cls.height != null ? cls.height : sz.h);
  return { w, h, grow: growOf(a), alignSelf: alignSelfOf(a), place: (x, y, W, H) => { ctrl.left = x; ctrl.top = y; ctrl.width = W; ctrl.height = H; st.ir.controls.push(ctrl); } };
}

// sidebarItemLeaf: item de navegação da <Sidebar> — full-width, texto à esquerda, com
// hover e estado ATIVO (barra de acento à esquerda + fundo primary suave + texto/negrito
// primary). Mesma técnica do flatButton (shape de fundo + container transparente por cima),
// mas full-width e left-aligned. O shape arredondado segura hover/ativo; a barra de acento
// é um 2º shape fino. Cores numéricas -> reaplicadas no Init por applyRuntimeColors.
function sidebarItemLeaf(model, ctx, st) {
  const a = model.attrs;
  const name = ctrlName({ name: a.name }, 'container', st);
  const label = typeof a.label === 'string' ? a.label : (typeof a.caption === 'string' ? a.caption : '');
  const icon = typeof a.icon === 'string' ? a.icon : null;
  const active = a.active === true;
  const click = typeof a.onClick === 'string' ? `ThisForm.${a.onClick}()` : '';
  const dark = THEME._mode === 'dark';
  const activeBg = shade('primary', dark ? -18 : 38); // primary bem suave (fundo do ativo)
  const hoverBg = shade('surface', dark ? 18 : -8);
  const fg = active ? hexToRGB(THEME.primary) : hexToRGB(THEME.onSurface);
  const h = typeof a.height === 'number' ? a.height : 36;
  const shp = 'shp' + name, acc = 'acc' + name;
  const enter = `This.Parent.${shp}.BackStyle = 1\nThis.Parent.${shp}.FillStyle = 0\nThis.Parent.${shp}.FillColor = ${hoverBg}\nThis.Parent.${shp}.BackColor = ${hoverBg}`;
  const leave = active
    ? `This.Parent.${shp}.FillColor = ${activeBg}\nThis.Parent.${shp}.BackColor = ${activeBg}`
    : `This.Parent.${shp}.BackStyle = 0\nThis.Parent.${shp}.FillStyle = 1`;
  return { w: typeof a.width === 'number' ? a.width : 160, h, grow: 0, alignSelf: 'stretch',
    place: (x, y, W, H) => {
      // fundo arredondado (visível no hover/ativo)
      const shape = { type: 'shape', name: shp, left: x, top: y, width: W, height: H,
        properties: { BackStyle: active ? 1 : 0, FillStyle: active ? 0 : 1, Curvature: 10, BorderWidth: 0 } };
      if (active) { shape.properties.BackColor = activeBg; shape.properties.FillColor = activeBg; }
      st.ir.controls.push(shape);
      // barra de acento à esquerda (só no ativo): retângulo fino primary
      if (active) st.ir.controls.push({ type: 'shape', name: acc, left: x, top: y + 6, width: 3, height: H - 12,
        properties: { BackStyle: 1, FillStyle: 0, Curvature: 0, BorderWidth: 0,
          BackColor: hexToRGB(THEME.primary), FillColor: hexToRGB(THEME.primary) } });
      // container transparente por cima (hover/click)
      const cont = { type: 'container', name, left: x, top: y, width: W, height: H,
        properties: { BackStyle: 0, BorderWidth: 0 },
        methods: { MouseEnter: enter, MouseLeave: leave } };
      if (click) cont.methods.Click = click;
      st.ir.controls.push(cont);
      const tx = icon ? 30 : 12;
      // label/image são filhos do container -> shape (irmão do container) em This.Parent.Parent
      const lbl = { type: 'label', name: name + 't', parent: name, caption: label,
        left: tx, top: Math.round((H - 16) / 2), width: W - tx - 6, height: 16,
        properties: { BackStyle: 0, Alignment: 0, ForeColor: fg,
          FontName: foxString(THEME.fontBody || THEME.font || 'Segoe UI'), FontSize: 10 },
        methods: Object.assign({ MouseEnter: deepenPath(enter) }, click ? { Click: click } : {}) };
      if (active) lbl.properties.FontBold = '.T.';
      st.ir.controls.push(lbl);
      // ícone do item ativo recolore p/ primary (casa com o texto primary+bold); inativo = default.
      if (icon) st.ir.controls.push({ type: 'image', name: name + 'i', parent: name,
        left: 8, top: Math.round((H - 16) / 2), width: 16, height: 16,
        properties: { Picture: foxString(iconVariantPath(icon, active ? 'primary' : null)), BackStyle: 0 },
        methods: Object.assign({ MouseEnter: deepenPath(enter) }, click ? { Click: click } : {}) });
    } };
}

// deepenPath: o hover recolore o SHAPE que é IRMÃO do container do botão/item (mesmo pai).
// O handler do CONTÊINER usa `This.Parent.<shp>` (sobe 1 nível até o pai e acha o irmão).
// Mas a LABEL/IMAGE são filhos do contêiner — pra elas, o shape está um nível ACIMA do
// pai: `This.Parent.Parent.<shp>`. Sem isso, `cnt.shp` não existe -> erro de membro no
// MouseEnter (afetava todos os apps). Reaproveita a mesma string subindo +1 nível.
const deepenPath = (s) => s.replace(/\bThis\.Parent\./g, 'This.Parent.Parent.');

// flatButtonLeaf: botão flat (Container colorido + Label centrado + ícone opcional),
// com hover por shade() e Click -> ThisForm.<metodo>(). É um leaf posicionado pelo
// motor de layout (place empilha o container e seus filhos, coords relativas). É o
// "botão bonito" do kit — colorido de verdade, sem o cinza 3D do CommandButton.
function flatButtonLeaf(model, ctx, st) {
  const a = model.attrs;
  const name = ctrlName(a, 'container', st);
  const caption = typeof a.caption === 'string' ? a.caption : 'OK';
  const variant = typeof a.variant === 'string' ? a.variant : 'primary';
  // cores por variante. secondary/ghost contrastam com o card (surface) no dark:
  // secondary = preenchimento neutro destacado; ghost = transparente + texto colorido.
  const dark = THEME._mode === 'dark';
  // botao de <Toolbar>: ghost SEM borda em repouso (so fill no hover) — o look Fluent
  // limpo de barra de comandos (uma fileira de botoes com moldura pareceria "2003").
  const toolbar = model.toolbar === true;
  let bg, fg, hover, border = null;
  if (variant === 'ghost') {
    bg = null; fg = hexToRGB(THEME.primary); border = toolbar ? null : hexToRGB(THEME.border); hover = shade('surface', dark ? 18 : -8);
  } else if (variant === 'secondary') {
    bg = shade('surface', dark ? 22 : -10); fg = hexToRGB(THEME.onSurface); border = hexToRGB(THEME.border); hover = shade('surface', dark ? 34 : -20);
  } else if (variant === 'danger') {
    bg = hexToRGB(THEME.danger); fg = hexToRGB(THEME.onPrimary); hover = shade('danger', 18);
  } else {
    const base = THEME[variant] || THEME.primary; bg = hexToRGB(base); fg = hexToRGB(THEME.onPrimary); hover = shade(base, 18);
  }
  const outline = border != null;
  // cor do ícone CASA com o fg do texto: filled (primary/danger) -> branco; ghost -> primary;
  // secondary -> default (onSurface). Senão o glifo escuro some no botao colorido.
  const iconColor = variant === 'ghost' ? 'primary' : (variant === 'secondary' ? null : 'white');
  const icon = typeof a.icon === 'string' ? iconVariantPath(a.icon, iconColor) : null;
  const click = typeof a.onClick === 'string' ? `ThisForm.${a.onClick}()` : '';
  // largura: botoes de toolbar sao compactos (snug ao conteudo; icon-only ~quadrado).
  const w = typeof a.width === 'number' ? a.width
    : toolbar
      ? (caption ? caption.length * 7 + (icon ? 30 : 18) : (icon ? 32 : 32))
      : Math.max(86, caption.length * 7 + (icon ? 34 : 18));
  const h = typeof a.height === 'number' ? a.height : 30;
  // cantos arredondados: Container.Curvature é no-op visual no VFP9; só Shape.Curvature
  // arredonda. Então o fundo do botão vira um SHAPE arredondado (atrás), e o container
  // fica TRANSPARENTE (BackStyle:0) só segurando label/ícone. O hover recolore o SHAPE
  // (irmão do container sob o mesmo pai), não o container. Cores numéricas -> emitidas no
  // Init por applyRuntimeColors. Resting fill = bg (ghost = sem preenchimento, só borda).
  const shp = 'shp' + name;
  // resting do shape: filled => BackStyle 1; ghost => BackStyle 0 (transparente, só borda)
  // hover liga fill sólido (FillStyle 0); repouso sem-bg volta a transparente (FillStyle 1),
  // senão o shape sem FillColor pintaria PRETO (FillStyle 0 = sólido com cor default preta).
  const restEnter = `This.Parent.${shp}.BackStyle = 1\nThis.Parent.${shp}.FillStyle = 0\nThis.Parent.${shp}.FillColor = ${hover}\nThis.Parent.${shp}.BackColor = ${hover}`;
  const restLeave = bg
    ? `This.Parent.${shp}.FillColor = ${bg}\nThis.Parent.${shp}.BackColor = ${bg}`
    : `This.Parent.${shp}.BackStyle = 0\nThis.Parent.${shp}.FillStyle = 1`;
  return { w, h, grow: growOf(a), alignSelf: alignSelfOf(a), place: (x, y, W, H) => {
    // SHAPE de fundo arredondado (irmão do container, atrás dele). Curvature ~8 = cantos
    // suaves. Filled: BackStyle 1 + Fill/BackColor = bg. Ghost: transparente + borda.
    const restBorderW = outline ? 1 : (bg ? 0 : (toolbar ? 0 : 1)); // toolbar ghost = sem moldura em repouso
    const shape = { type: 'shape', name: shp, left: x, top: y, width: W, height: H,
      properties: { BackStyle: bg ? 1 : 0, FillStyle: bg ? 0 : 1, Curvature: 8, BorderWidth: restBorderW } };
    if (bg) { shape.properties.BackColor = bg; shape.properties.FillColor = bg; }
    if (outline) shape.properties.BorderColor = border;
    else if (bg) shape.properties.BorderColor = bg; // borda = fill (sem moldura visível)
    st.ir.controls.push(shape);
    // container TRANSPARENTE por cima, segura label/ícone e dispara hover/click no shape.
    const cont = { type: 'container', name, left: x, top: y, width: W, height: H,
      properties: { BackStyle: 0, BorderWidth: 0 },
      methods: { MouseEnter: restEnter, MouseLeave: restLeave } };
    if (click) cont.methods.Click = click;
    st.ir.controls.push(cont);
    const tx = icon ? 22 : 0, tw = icon ? W - 22 : W;
    // label/image são filhos do container -> o shape (irmão do container) está em This.Parent.Parent
    const lbl = { type: 'label', name: name + 't', parent: name, caption,
      left: tx, top: Math.round((H - 16) / 2), width: tw, height: 16,
      properties: { BackStyle: 0, Alignment: 2, ForeColor: fg, FontName: foxString(THEME.fontBody || THEME.font || 'Segoe UI'), FontSize: 9 },
      methods: Object.assign({ MouseEnter: deepenPath(restEnter) }, click ? { Click: click } : {}) };
    st.ir.controls.push(lbl);
    if (icon) st.ir.controls.push({ type: 'image', name: name + 'i', parent: name,
      left: 8, top: Math.round((H - 16) / 2), width: 16, height: 16,
      properties: { Picture: foxString(icon), BackStyle: 0, Stretch: 1 },
      methods: Object.assign({ MouseEnter: deepenPath(restEnter) }, click ? { Click: click } : {}) });
  } };
}

// toLayoutTree: modelo JSX -> árvore para o motor de layout (containers + folhas).
function toLayoutTree(model, ctx, st) {
  if (model.kind === 'flatbutton') return flatButtonLeaf(model, ctx, st);
  if (model.kind === 'sidebaritem') return sidebarItemLeaf(model, ctx, st);
  if (model.kind === 'box') {
    return {
      container: true, dir: model.dir, gap: model.gap, pad: model.pad, justify: model.justify, align: model.align, wrap: model.wrap,
      absolute: model.absolute, w: model.w, h: model.h,
      children: model.children.map((c) => toLayoutTree(c, ctx, st)),
    };
  }
  if (model.kind === 'container') return containerLeaf(model, ctx, st);
  if (model.kind === 'pageframe') return pageFrameLeaf(model, ctx, st);
  if (model.kind === 'grid') return gridLeaf(model, ctx, st);
  return model.kind === 'control' ? controlLeaf(model, ctx, st) : componentLeaf(model, ctx, st);
}

// findRenderReturn: a expressão JSX retornada pelo método render().
function findRenderReturn(method, ctx) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (ts.isReturnStatement(n) && n.expression) { found = n.expression; return; }
    n.forEachChild(visit);
  };
  if (method.body) visit(method.body);
  if (!found) throw new CompileError('render() deve retornar JSX', method, ctx.sf);
  return found;
}

// applyConstructorDI: constructor(private x: Svc) de um FORM -> propriedade custom +
// `This.x = CREATEOBJECT("Svc")` prependido no Init (DI no estilo Angular).
function applyConstructorDI(cls, ir, ctx) {
  const ctor = cls.members.find(ts.isConstructorDeclaration);
  if (!ctor) return;
  const lines = [];
  for (const p of ctor.parameters) {
    const pname = p.name.getText(ctx.sf);
    if (!p.type) throw new CompileError('parametro de construtor precisa de tipo (injeção de dependência)', p, ctx.sf);
    if (!ir.members.some((m) => m.name.toLowerCase() === pname.toLowerCase())) {
      ir.members.push({ name: pname, kind: 'property', desc: `(DI) ${pname}`, default: '.NULL.' });
    }
    lines.push(`${ind(1)}This.${pname} = CREATEOBJECT(${foxString(p.type.getText(ctx.sf))})`);
  }
  if (!lines.length) return;
  const di = lines.join('\n');
  const body = ir.methods.Init;
  if (!body) { ir.methods.Init = di; return; }
  // LPARAMETERS (se houver) tem de continuar sendo a 1ª linha do Init
  const nl = body.indexOf('\n');
  const first = nl >= 0 ? body.slice(0, nl) : body;
  ir.methods.Init = /^\s*LPARAMETERS/i.test(first)
    ? first + '\n' + di + (nl >= 0 ? body.slice(nl) : '')
    : di + '\n' + body;
}

// transpileForm: lê uma classe de form e devolve a IR completa (estrutura + métodos
// transpilados). Devolve null se o arquivo não tem uma classe de form (sem
// `extends Form` nem @Form — nesse caso é um DEFINE CLASS comum, tratado no PRG).
//
// Dois modos: CAMPO (`class X extends Form` com `nome = new Ctrl({...})`) e
// DECORATOR (`@Form` na classe + `@TextBox`/`@Button`/... nos membros). Em ambos
// os métodos viram o memo METHODS e `this.<x>` transpila como This.x.y.
// collectRoute: pre-passe barato (parser sintatico, sem type-check) que extrai a
// rota de um arquivo de form. Devolve { route, name } | null, onde `name` e o nome
// efetivo do form (classe, ou override em @Form({ name })) — o mesmo que vira <name>.scx.
// Usado pelo `vfp build` para montar o mapa global antes do transpile completo.
function collectRoute(entry) {
  const src = require('fs').readFileSync(path.resolve(entry), 'utf8');
  const sf = ts.createSourceFile(entry, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  const decoOf = (node, nm) => {
    const decos = ts.canHaveDecorators && ts.canHaveDecorators(node) ? (ts.getDecorators(node) || []) : [];
    return decos.map((d) => d.expression).find((e) => ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === nm);
  };
  for (const stmt of sf.statements) {
    if (!ts.isClassDeclaration(stmt)) continue;
    const routeDeco = decoOf(stmt, 'Route');
    if (!routeDeco || !routeDeco.arguments[0] || !ts.isStringLiteral(routeDeco.arguments[0])) continue;
    let name = stmt.name ? stmt.name.text : 'frmSemNome';
    const formDeco = decoOf(stmt, 'Form');
    if (formDeco && formDeco.arguments[0] && ts.isObjectLiteralExpression(formDeco.arguments[0])) {
      for (const p of formDeco.arguments[0].properties) {
        if (ts.isPropertyAssignment(p) && p.name.getText(sf) === 'name' && ts.isStringLiteral(p.initializer)) name = p.initializer.text;
      }
    }
    return { route: routeDeco.arguments[0].text, name };
  }
  return null;
}

module.exports = { parseJsx, collectRoute, findRenderReturn, toLayoutTree, applyConstructorDI };
