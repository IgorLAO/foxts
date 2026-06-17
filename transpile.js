'use strict';
// transpile.js — converte um subconjunto TIPADO de TypeScript em Visual FoxPro 9 (PRG).
//
// Filosofia (igual ao AssemblyScript -> WASM): aceitar so um subconjunto estrito
// e estaticamente tipado. Cada no da AST que o compilador conhece vira FoxPro;
// QUALQUER outra coisa e erro de compilacao com numero de linha. Nunca palpita.
//
// Os tipos vem da TypeScript Compiler API (TypeChecker), porque o FoxPro gerado
// para "a + b" depende de a/b serem numero (soma), string (concat) ou data.

const ts = require('typescript');
const path = require('path');
const layout = require('./layout'); // motor de layout (flex puro JS | yoga)
// tokens de cor/tipografia + helpers (extraidos p/ compiler/theme.js). THEME e a MESMA
// referencia mutada por setTheme -> todos os `THEME.x` abaixo continuam validos.
const { THEME, setTheme, hexToRGB, themeColor, shade } = require('./compiler/theme');
// utilitarios genericos (extraidos p/ compiler/util.js): erro, indent, predicados de
// tipo, string Fox, caminho this.* — importados no escopo, os call sites nao mudam.
const { CompileError, IND, ind, typeKind, isArrayType, foxString, dottedThisPath, hasDeco, cap1, readPropsBag } = require('./compiler/util');
// Frente G: menus VFP (auto-contido, so depende de util) -> compiler/menu.js
const { asMenu, emitMenu, collectMenus } = require('./compiler/menu');
// Frente D: query builder -> compiler/query.js (usa ctx.emitExpr p/ evitar ciclo)
const { asQuery, asCountQuery, asFirstObjQuery, emitQuery, emitCountQuery, emitFirstObjQuery } = require('./compiler/query');
// Frente F: validacao Zod-like -> compiler/validation.js (MESSAGES proprio + ctx.emitExpr)
const { asSchema, emitValidator, setMessages, bindMemberDefault, applyFormValidate } = require('./compiler/validation');
// estilo (variant/color/class) + icones -> compiler/style.js (so theme + util)
const { applyStyle, applyClass, growOf, alignSelfOf, iconPath, iconVariantPath } = require('./compiler/style');
// nucleo de UI: render()/JSX -> arvore de controles + leaves -> compiler/jsx.js (o maior
// bloco; usa ctx.emitExpr/emitCall + theme/style/util/validation/layout)
const { parseJsx, collectRoute, findRenderReturn, toLayoutTree, applyConstructorDI } = require('./compiler/jsx');

// ---- expressoes ------------------------------------------------------------

const BUILTIN_MATH = {
  floor: 'FLOOR', ceil: 'CEILING', abs: 'ABS', max: 'MAX', min: 'MIN', sqrt: 'SQRT',
};
const STR_METHODS = {
  toUpperCase: 'UPPER', toLowerCase: 'LOWER', trim: 'ALLTRIM',
};
// funções do runtime fox.ts/db.ts mapeadas direto para FoxPro
const BUILTIN_FUNCS = {
  dowOf: (a) => `DOW(${a[0]}, 1)`,   // 1=Domingo ... 7=Sabado
  addDays: (a) => `(${a[0]} + ${a[1]})`,
  today: () => 'DATE()',
  empty: (a) => `EMPTY(${a[0]})`,
  inList: (a) => `INLIST(${a.join(', ')})`,
  isType: (a) => `VARTYPE(${a[0]})`,
  messageBox: (a) => `MESSAGEBOX(${a.join(', ')})`,
  cursorExists: (a) => `USED(${a[0]})`,
  reccount: (a) => `RECCOUNT(${a[0]})`,
  closeCursor: (a) => `USE IN (${a[0]})`,
  clearEvents: () => 'CLEAR EVENTS',
  sqlConnect: (a) => `SQLSTRINGCONNECT(${a[0]})`,       // db.ts: conecta por connection string
  sqlConnectDSN: (a) => `SQLCONNECT(${a.join(', ')})`,  // db.ts: conecta por DSN + usuário/senha
};

// lowerVfpCommand: comandos VFP cujo argumento é uma palavra-chave (bareword),
// não uma expressão — precisam do AST cru. Devolve a linha FoxPro ou null.
function lowerVfpCommand(name, rawArgs, ctx) {
  switch (name) {
    case 'setDate': {
      const a = rawArgs[0];
      if (!a || !ts.isStringLiteral(a)) throw new CompileError('setDate requer string literal (ex.: "DMY")', a || null, ctx.sf);
      return `SET DATE ${a.text}`;
    }
    case 'setCentury':
      return `SET CENTURY ${rawArgs[0] && rawArgs[0].kind === ts.SyntaxKind.TrueKeyword ? 'ON' : 'OFF'}`;
    default:
      return null;
  }
}

// ---- cursores e tipos Fox --------------------------------------------------

// litNum extrai o número de um type argument literal (ex.: o 13 em Char<13>).
function litNum(node, ctx) {
  if (node && ts.isLiteralTypeNode(node) && ts.isNumericLiteral(node.literal)) return node.literal.text;
  throw new CompileError('esperado número literal no tipo (ex.: Char<13>)', node, ctx.sf);
}

// foxColType traduz o tipo TS de uma coluna para o tipo de campo do DBF.
function foxColType(typeNode, ctx) {
  if (ts.isTypeReferenceNode(typeNode)) {
    const name = typeNode.typeName.getText(ctx.sf);
    const ta = typeNode.typeArguments || [];
    switch (name) {
      case 'Char': return `C(${litNum(ta[0], ctx)})`;
      case 'Numeric': return ta[1] ? `N(${litNum(ta[0], ctx)},${litNum(ta[1], ctx)})` : `N(${litNum(ta[0], ctx)})`;
      case 'Int': return 'I';
      case 'Logical': return 'L';
      case 'DateF':
      case 'Date': return 'D';
    }
  }
  if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) return 'L';
  throw new CompileError('coluna de cursor precisa de tipo Fox: Char<N>, Numeric<W[,D]>, Int, Logical ou DateF', typeNode, ctx.sf);
}

// cursorSchema lê a interface T de createCursor<T> e devolve as colunas do DBF.
function cursorSchema(typeArgNode, ctx) {
  const { checker, sf } = ctx;
  let members = null;
  const type = checker.getTypeFromTypeNode(typeArgNode);
  const sym = type.getSymbol() || type.aliasSymbol;
  if (sym && sym.declarations) {
    const decl = sym.declarations.find((d) => ts.isInterfaceDeclaration(d));
    if (decl) members = decl.members;
  }
  if (!members && ts.isTypeLiteralNode(typeArgNode)) members = typeArgNode.members;
  if (!members) throw new CompileError('createCursor<T>: T deve ser uma interface de colunas', typeArgNode, sf);
  const cols = [];
  for (const m of members) {
    if (!ts.isPropertySignature(m) || !m.type) throw new CompileError('coluna de cursor inválida', m, sf);
    cols.push(`${m.name.getText(sf)} ${foxColType(m.type, ctx)}`);
  }
  return cols.join(', ');
}

// nome da classe de UI (fox.ts) -> baseclass VFP
const NEW_TO_BASECLASS = {
  Form: 'form', Label: 'label', TextBox: 'textbox', EditBox: 'editbox',
  CommandButton: 'commandbutton', CheckBox: 'checkbox', ComboBox: 'combobox',
  Grid: 'grid', Timer: 'timer', Shape: 'shape', Image: 'image', OptionGroup: 'optiongroup',
};

// nome do decorator de controle (@TextBox, @Button, ...) -> baseclass VFP
const DECORATOR_BASECLASS = { ...NEW_TO_BASECLASS, Button: 'commandbutton' };

// buildControl: campo `nome = new Ctrl({cfg})` -> controle da IR.
function buildControl(name, baseclass, cfgNode, ctx) {
  const ctrl = { type: baseclass, name };
  if (cfgNode && ts.isObjectLiteralExpression(cfgNode)) {
    for (const p of cfgNode.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const key = p.name.getText(ctx.sf);
      const v = p.initializer;
      if (['top', 'left', 'width', 'height'].includes(key) && ts.isNumericLiteral(v)) ctrl[key] = Number(v.text);
      else if (key === 'caption' && ts.isStringLiteral(v)) ctrl.caption = v.text;
      else if (/^on[A-Z]/.test(key) && ts.isStringLiteral(v)) {
        (ctrl.methods = ctrl.methods || {})[key.slice(2)] = v.text; // onClick -> Click
      } else if (key === 'props' && ts.isObjectLiteralExpression(v)) ctrl.properties = readPropsBag(v, ctx);
    }
  }
  return ctrl;
}

// readClassField: distribui um campo da classe entre controle/escalar/props.
function readClassField(m, ir, ctx) {
  const name = m.name.getText(ctx.sf);
  const init = m.initializer;
  if (!init) return;
  if (ts.isNewExpression(init)) {
    const cls = init.expression.getText(ctx.sf);
    const baseclass = NEW_TO_BASECLASS[cls];
    if (!baseclass) throw new CompileError(`tipo de controle desconhecido: ${cls}`, init, ctx.sf);
    ir.controls.push(buildControl(name, baseclass, init.arguments && init.arguments[0], ctx));
  } else if (name === 'props' && ts.isObjectLiteralExpression(init)) {
    ir.properties = readPropsBag(init, ctx);
  } else if (['caption', 'name'].includes(name) && ts.isStringLiteral(init)) {
    ir[name] = init.text;
  } else if (['width', 'height'].includes(name) && ts.isNumericLiteral(init)) {
    ir[name] = Number(init.text);
  }
}

// isConnection: o receptor é uma conexão SQL Server (tipo Connection do db.ts)?
function isConnection(node, ctx) {
  return ctx.checker.typeToString(ctx.checker.getTypeAtLocation(node)) === 'Connection';
}

// lowerSqlMethod baixa db.exec/disconnect/transações/getProp para SQL pass-through do VFP.
function lowerSqlMethod(recv, method, args, node, ctx) {
  switch (method) {
    case 'exec': return `SQLEXEC(${[recv, ...args].join(', ')})`;   // SQLEXEC(handle, sql [, cursor])
    case 'disconnect': return `SQLDISCONNECT(${recv})`;
    // Frente D — transações SQL Server via pass-through (SQLEXEC com o comando T-SQL).
    case 'begin': return `SQLEXEC(${recv}, "BEGIN TRANSACTION")`;
    case 'commit': return `SQLEXEC(${recv}, "COMMIT TRANSACTION")`;
    case 'rollback': return `SQLEXEC(${recv}, "ROLLBACK TRANSACTION")`;
    // SQLGETPROP/SQLSETPROP: lê/grava propriedades da conexão (ex.: "Transactions",
    // "ConnectTimeout", "Asynchronous"). getProp(p) -> SQLGETPROP(db, p).
    case 'getProp': return `SQLGETPROP(${[recv, ...args].join(', ')})`;
    case 'setProp': return `SQLSETPROP(${[recv, ...args].join(', ')})`;
    default: throw new CompileError(`método de conexão ".${method}()"`, node, ctx.sf);
  }
}

// lowerCursorMethod baixa cur.append/goTop/skip/eof/count/field/use para FoxPro.
function lowerCursorMethod(cname, method, node, ctx) {
  const { sf } = ctx;
  switch (method) {
    case 'append': {
      const arg = node.arguments[0];
      if (!arg || !ts.isObjectLiteralExpression(arg)) throw new CompileError('append() requer um objeto literal de colunas', node, sf);
      const cols = [], vals = [];
      for (const p of arg.properties) {
        if (!ts.isPropertyAssignment(p)) throw new CompileError('propriedade de append inválida', p, sf);
        cols.push(p.name.getText(sf));
        vals.push(emitExpr(p.initializer, ctx));
      }
      return `INSERT INTO ${cname} (${cols.join(', ')}) VALUES (${vals.join(', ')})`;
    }
    case 'goTop': return `GO TOP IN ${cname}`;
    case 'goBottom': return `GO BOTTOM IN ${cname}`;
    case 'skip': return `SKIP IN ${cname}`;
    case 'use': return `USE IN ${cname}`;
    case 'eof': return `EOF("${cname}")`;
    case 'bof': return `BOF("${cname}")`;
    case 'count': return `RECCOUNT("${cname}")`;
    case 'field': {
      const a = node.arguments[0];
      if (!a || !ts.isStringLiteral(a)) throw new CompileError('field() requer o nome da coluna como string literal', node, sf);
      return `${cname}.${a.text}`;
    }
    // update(col, value, whereCol, whereValue) -> UPDATE keyed (SQL no VFP). Atualiza os
    // registros que casam SEM posicionar o ponteiro. col/whereCol = string literal.
    case 'update': {
      const [colA, valA, wColA, wValA] = node.arguments;
      if (!colA || !ts.isStringLiteral(colA)) throw new CompileError('update(col, value, whereCol, whereValue): col deve ser string literal', node, sf);
      if (!wColA || !ts.isStringLiteral(wColA)) throw new CompileError('update(...): whereCol deve ser string literal', node, sf);
      return `UPDATE ${cname} SET ${colA.text} = ${emitExpr(valA, ctx)} WHERE ${wColA.text} = ${emitExpr(wValA, ctx)}`;
    }
    // increment(col, by, whereCol, whereValue) -> col = col + by (keyed). by via emitExpr.
    case 'increment': {
      const [colA, byA, wColA, wValA] = node.arguments;
      if (!colA || !ts.isStringLiteral(colA)) throw new CompileError('increment(col, by, whereCol, whereValue): col deve ser string literal', node, sf);
      if (!wColA || !ts.isStringLiteral(wColA)) throw new CompileError('increment(...): whereCol deve ser string literal', node, sf);
      return `UPDATE ${cname} SET ${colA.text} = ${colA.text} + ${emitExpr(byA, ctx)} WHERE ${wColA.text} = ${emitExpr(wValA, ctx)}`;
    }
    default: throw new CompileError(`método de cursor ".${method}()"`, node, sf);
  }
}

function emitExpr(node, ctx) {
  const { checker, sf } = ctx;

  if (ts.isParenthesizedExpression(node)) return `(${emitExpr(node.expression, ctx)})`;
  if (ts.isNumericLiteral(node)) return node.text;
  if (ts.isStringLiteral(node)) return foxString(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return '.T.';
  if (node.kind === ts.SyntaxKind.FalseKeyword) return '.F.';
  if (node.kind === ts.SyntaxKind.ThisKeyword) return 'This';
  // ctx.subst: substituição de identificador -> expressão (ex.: o parâmetro de um
  // .refine(v => ...) vira a referência do campo `toObj.nome`/`ThisForm.nome`).
  if (ts.isIdentifier(node)) return (ctx.subst && node.text in ctx.subst) ? ctx.subst[node.text] : node.text;

  if (ts.isPrefixUnaryExpression(node)) {
    const x = emitExpr(node.operand, ctx);
    switch (node.operator) {
      case ts.SyntaxKind.ExclamationToken: return `NOT (${x})`;
      case ts.SyntaxKind.MinusToken: return `-${x}`;
      case ts.SyntaxKind.PlusToken: return x;
      default: throw new CompileError('operador unario', node, sf);
    }
  }

  if (ts.isBinaryExpression(node)) return emitBinary(node, ctx);

  // ternário a ? b : c -> IIF(a, b, c)
  if (ts.isConditionalExpression(node)) {
    return `IIF(${emitExpr(node.condition, ctx)}, ${emitExpr(node.whenTrue, ctx)}, ${emitExpr(node.whenFalse, ctx)})`;
  }

  // xs[i] -> xs.Item(i + 1) (Collection do VFP e 1-based; o indice TS e 0-based)
  if (ts.isElementAccessExpression(node)) {
    if (!isArrayType(node.expression, checker)) {
      throw new CompileError('indexacao [] so e suportada em arrays (viram Collection)', node, sf);
    }
    return `${emitExpr(node.expression, ctx)}.Item(${emitExpr(node.argumentExpression, ctx)} + 1)`;
  }

  if (ts.isPropertyAccessExpression(node)) {
    // .length em string -> LEN(recv); em array -> Count da Collection
    if (node.name.text === 'length' && typeKind(node.expression, checker) === 'string') {
      return `LEN(${emitExpr(node.expression, ctx)})`;
    }
    if (node.name.text === 'length' && isArrayType(node.expression, checker)) {
      return `${emitExpr(node.expression, ctx)}.Count`;
    }
    // this.txtIni.value -> This.txtIni.value (acesso a controles/props do form)
    const tp = dottedThisPath(node);
    if (tp) return tp;
    // db.connected -> (db > 0)
    if (node.name.text === 'connected' && isConnection(node.expression, ctx)) {
      return `(${emitExpr(node.expression, ctx)} > 0)`;
    }
    // propriedade de objeto (instância de classe/serviço ou objeto-linha de .first()):
    // recv.prop -> recv.prop (o TypeChecker já validou; receptor não-primitivo). Espelha
    // o caminho de obj.metodo() em emitCall.
    if (typeKind(node.expression, checker) === 'unknown') {
      // GUARDA: variável de 1 letra a–j que segura um OBJETO e é usada como recv.prop
      // colide com as letras de WORK AREA do VFP: `c.campo` é lido como ALIAS(C).campo
      // ("Variable not found"). Rejeitar (nunca palpitar) e sugerir nome >=2 letras.
      // Só para receptores não-primitivos (objeto): contadores/strings de 1 letra (i, n)
      // têm typeKind primitivo e não chegam aqui.
      if (ts.isIdentifier(node.expression) && /^[a-j]$/.test(node.expression.text)) {
        throw new CompileError(
          `variavel de 1 letra "${node.expression.text}" que segura um objeto e usada como "${node.expression.text}.${node.name.text}": as letras a-j sao aliases de work area no VFP, entao "${node.expression.text}.${node.name.text}" e lido como ALIAS(${node.expression.text.toUpperCase()}).${node.name.text} e falha em runtime. Use um nome com 2+ letras (ex.: loRow, loCli)`,
          node, sf
        );
      }
      return `${emitExpr(node.expression, ctx)}.${node.name.text}`;
    }
    throw new CompileError(`acesso a propriedade ".${node.name.text}"`, node, sf);
  }

  if (ts.isCallExpression(node)) return emitCall(node, ctx);

  // new Servico(args) -> CREATEOBJECT("Servico", args) (instanciar classe/serviço)
  if (ts.isNewExpression(node)) {
    if (!ts.isIdentifier(node.expression)) throw new CompileError('new requer um nome de classe', node, sf);
    const args = (node.arguments || []).map((a) => emitExpr(a, ctx));
    return `CREATEOBJECT(${[foxString(node.expression.text), ...args].join(', ')})`;
  }

  throw new CompileError(`expressao ${ts.SyntaxKind[node.kind]}`, node, sf);
}

function emitBinary(node, ctx) {
  const { checker, sf } = ctx;
  const op = node.operatorToken.kind;
  // comparacao com null -> ISNULL() (ex.: const row = from(...).first(); if (row == null)).
  // Trata antes de emitir os lados: o literal `null` sozinho nao tem emissao propria.
  const isNullKw = (n) => n.kind === ts.SyntaxKind.NullKeyword;
  if (isNullKw(node.left) || isNullKw(node.right)) {
    const other = emitExpr(isNullKw(node.left) ? node.right : node.left, ctx);
    if (op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsEqualsToken) return `ISNULL(${other})`;
    if (op === ts.SyntaxKind.ExclamationEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) return `NOT ISNULL(${other})`;
    throw new CompileError('comparacao com null suporta apenas == e != (ISNULL)', node, sf);
  }
  const lk = typeKind(node.left, checker);
  const rk = typeKind(node.right, checker);
  let l = emitExpr(node.left, ctx);
  let r = emitExpr(node.right, ctx);

  switch (op) {
    case ts.SyntaxKind.PlusToken:
      if (lk === 'string' || rk === 'string') {
        // concat: converte o lado nao-string com TRANSFORM()
        if (lk !== 'string') l = `TRANSFORM(${l})`;
        if (rk !== 'string') r = `TRANSFORM(${r})`;
        return `${l} + ${r}`;
      }
      return `${l} + ${r}`; // numero+numero ou data+numero
    case ts.SyntaxKind.MinusToken: return `${l} - ${r}`;
    case ts.SyntaxKind.AsteriskToken: return `${l} * ${r}`;
    case ts.SyntaxKind.SlashToken: return `${l} / ${r}`;
    case ts.SyntaxKind.PercentToken: return `MOD(${l}, ${r})`;
    case ts.SyntaxKind.EqualsEqualsToken:
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      return `${l} ${lk === 'string' || rk === 'string' ? '==' : '='} ${r}`;
    case ts.SyntaxKind.ExclamationEqualsToken:
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      return `${l} != ${r}`;
    case ts.SyntaxKind.LessThanToken: return `${l} < ${r}`;
    case ts.SyntaxKind.LessThanEqualsToken: return `${l} <= ${r}`;
    case ts.SyntaxKind.GreaterThanToken: return `${l} > ${r}`;
    case ts.SyntaxKind.GreaterThanEqualsToken: return `${l} >= ${r}`;
    case ts.SyntaxKind.AmpersandAmpersandToken: return `${l} AND ${r}`;
    case ts.SyntaxKind.BarBarToken: return `${l} OR ${r}`;
    default:
      throw new CompileError(`operador binario "${node.operatorToken.getText(sf)}"`, node, sf);
  }
}

// asFormNav: a expressão é uma navegação open/showModal? Reconhece três receptores
// equivalentes: FormManager.x(), router.x() e this.router.x(). Devolve "open"/"showModal".
function asFormNav(expr) {
  if (!ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression)) return null;
  const callee = expr.expression, recv = callee.expression, m = callee.name.text;
  if (m !== 'open' && m !== 'showModal') return null;
  if (ts.isIdentifier(recv) && (recv.text === 'FormManager' || recv.text === 'router')) return m;
  if (ts.isPropertyAccessExpression(recv) && recv.name.text === 'router' && recv.expression.kind === ts.SyntaxKind.ThisKeyword) return m;
  return null;
}

// emitFormNav: FormManager.open/showModal(FormX, { a, b }) -> DO FORM FormX [WITH a, b]
// [NAME <captura> LINKED | TO <captura>]. open captura por referência (NAME LINKED);
// showModal captura o retorno modal (TO). É a tradução do "abrir outro form".
function emitFormNav(method, node, ctx, captureVar) {
  const { sf } = ctx;
  const target = node.arguments[0];
  let formName;
  if (target && ts.isIdentifier(target)) {
    formName = target.text; // router.open(PedidoForm) -> classe direta
  } else if (target && ts.isStringLiteral(target)) {
    // router.open("cliente") -> resolve a rota via mapa global (@Route -> nome do form).
    // O mapa chega pelo ctx.routes (montado no `vfp build`); sem ele, nao da pra resolver.
    const routes = ctx.routes;
    if (!routes) throw new CompileError(`router.${method}("${target.text}"): rotas por string so resolvem no \`vfp build\` (precisam do mapa global de @Route)`, node, sf);
    formName = routes[target.text];
    if (!formName) throw new CompileError(`router.${method}("${target.text}"): rota nao encontrada (nenhum form com @Route("${target.text}"))`, node, sf);
  } else {
    throw new CompileError('FormManager.' + method + ' requer a classe do form (ex.: FormManager.open(PedidoForm)) ou o nome da rota (ex.: FormManager.open("cliente"))', node, sf);
  }
  let line = `DO FORM ${formName}`;
  const params = node.arguments[1];
  if (params) {
    if (!ts.isObjectLiteralExpression(params)) throw new CompileError('parametros do form devem ser um objeto literal', params, sf);
    const vals = params.properties.map((p) => {
      if (ts.isShorthandPropertyAssignment(p)) return p.name.text;
      if (ts.isPropertyAssignment(p)) return emitExpr(p.initializer, ctx);
      throw new CompileError('parametro de form invalido', p, sf);
    });
    if (vals.length) line += ` WITH ${vals.join(', ')}`;
  }
  if (captureVar) line += method === 'showModal' ? ` TO ${captureVar}` : ` NAME ${captureVar} LINKED`;
  return line;
}

function emitCall(node, ctx) {
  const { sf } = ctx;
  const callee = node.expression;

  // query builder from(...)....all(...)/.first(...) -> SELECT ... INTO CURSOR
  if (asQuery(node)) return emitQuery(node, ctx);
  // .count() é valor escalar: só vale capturado (const n = ...count()), pois precisa
  // emitir um SELECT INTO ARRAY antes. Inline numa expressão maior não é suportado.
  if (asCountQuery(node)) throw new CompileError('query .count() deve ser atribuído a uma variável (ex.: const n = from(...).count()); não pode ser usado inline numa expressão', node, sf);
  // .first() sem cursor é objeto-linha: precisa ser capturado (emite SELECT + SCATTER antes).
  if (asFirstObjQuery(node)) throw new CompileError('query .first() (sem cursor) deve ser atribuído a uma variável (ex.: const c = from(...).first()); para criar um cursor use .first("nome")', node, sf);

  // FormManager.open/showModal(...) -> DO FORM ... (uso como statement, sem captura)
  const nav = asFormNav(node);
  if (nav) return emitFormNav(nav, node, ctx, null);

  // métodos de cursor: cur.append(...), cur.eof(), cur.field("x"), ... (antes de
  // mapear args, pois append recebe um objeto literal que emitExpr não suporta)
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    ctx.cursors[callee.expression.text]
  ) {
    return lowerCursorMethod(ctx.cursors[callee.expression.text], callee.name.text, node, ctx);
  }

  const args = node.arguments.map((a) => emitExpr(a, ctx));

  if (ts.isPropertyAccessExpression(callee)) {
    const obj = callee.expression;
    const method = callee.name.text;
    // console.log/info/warn/error(...) -> ? ... (saida pelo console do VFP)
    if (ts.isIdentifier(obj) && obj.text === 'console' && ['log', 'info', 'warn', 'error'].includes(method)) {
      return args.length ? `? ${args.join(', ')}` : '?';
    }
    // this.Gerar(...) / this.NomeDia(...) -> chamada de método do form
    const tp = dottedThisPath(callee);
    if (tp) return `${tp}(${args.join(', ')})`;
    // db.exec(...) / db.disconnect() -> SQL pass-through
    if (isConnection(obj, ctx)) return lowerSqlMethod(emitExpr(obj, ctx), method, args, node, ctx);
    // Math.floor(...) etc.
    if (ts.isIdentifier(obj) && obj.text === 'Math' && BUILTIN_MATH[method]) {
      return `${BUILTIN_MATH[method]}(${args.join(', ')})`;
    }
    // metodos de string: "x".toUpperCase()
    if (STR_METHODS[method]) {
      return `${STR_METHODS[method]}(${emitExpr(obj, ctx)})`;
    }
    // arrays (Collection): xs.push(v) -> xs.Add(v)
    if (method === 'push' && isArrayType(obj, ctx.checker)) {
      return `${emitExpr(obj, ctx)}.Add(${args.join(', ')})`;
    }
    // método de objeto (instância de classe/serviço): obj.metodo(args) -> obj.metodo(args).
    // Só para receptores não-primitivos (o TypeChecker já validou que o método existe).
    if (typeKind(obj, ctx.checker) === 'unknown') {
      return `${emitExpr(obj, ctx)}.${method}(${args.join(', ')})`;
    }
    throw new CompileError(`metodo ".${method}()"`, node, sf);
  }

  if (ts.isIdentifier(callee)) {
    const cmd = lowerVfpCommand(callee.text, node.arguments, ctx); // setDate/setCentury (bareword)
    if (cmd !== null) return cmd;
    if (BUILTIN_FUNCS[callee.text]) return BUILTIN_FUNCS[callee.text](args); // dowOf/empty/cursorExists/...
    return `${callee.text}(${args.join(', ')})`; // chamada de funcao do usuario
  }
  throw new CompileError('chamada complexa', node, sf);
}

// ---- statements ------------------------------------------------------------

function emitAssignOrCall(expr, ctx, depth) {
  const { sf } = ctx;
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return `${ind(depth)}${emitExpr(expr.left, ctx)} = ${emitExpr(expr.right, ctx)}`;
  }
  // x += 1, x++ etc.
  if (ts.isBinaryExpression(expr)) {
    const compound = {
      [ts.SyntaxKind.PlusEqualsToken]: '+',
      [ts.SyntaxKind.MinusEqualsToken]: '-',
      [ts.SyntaxKind.AsteriskEqualsToken]: '*',
      [ts.SyntaxKind.SlashEqualsToken]: '/',
    }[expr.operatorToken.kind];
    if (compound) {
      const lhs = emitExpr(expr.left, ctx);
      return `${ind(depth)}${lhs} = ${lhs} ${compound} ${emitExpr(expr.right, ctx)}`;
    }
  }
  if (ts.isPostfixUnaryExpression(expr) || ts.isPrefixUnaryExpression(expr)) {
    const o = expr.operator;
    if (o === ts.SyntaxKind.PlusPlusToken || o === ts.SyntaxKind.MinusMinusToken) {
      const lhs = emitExpr(expr.operand, ctx);
      return `${ind(depth)}${lhs} = ${lhs} ${o === ts.SyntaxKind.PlusPlusToken ? '+' : '-'} 1`;
    }
  }
  if (ts.isCallExpression(expr)) return `${ind(depth)}${emitExpr(expr, ctx)}`;
  throw new CompileError('expressao-statement (so atribuicao, ++/--, += ou chamada)', expr, sf);
}

// emitArrayInit: `target = [a, b, c]` -> CREATEOBJECT("Collection") + um .Add por
// elemento. `target` ja vem como expressao FoxPro (nome local ou This.x).
function emitArrayInit(target, arrLit, ctx, depth, out) {
  out.push(`${ind(depth)}${target} = CREATEOBJECT("Collection")`);
  for (const el of arrLit.elements) {
    out.push(`${ind(depth)}${target}.Add(${emitExpr(el, ctx)})`);
  }
}

// emitCaseBody: corpo de uma clausula de switch. O DO CASE do VFP nao tem
// fallthrough, entao exigimos break/return como terminador (o break some, pois e
// implicito); a ultima clausula pode omiti-lo (nao ha para onde "cair").
function emitCaseBody(stmts, ctx, depth, out, allowNoBreak, atNode) {
  let list = Array.from(stmts);
  if (list.length === 1 && ts.isBlock(list[0])) list = Array.from(list[0].statements);
  const last = list[list.length - 1];
  if (last && ts.isBreakStatement(last)) list.pop();
  else if (!(last && ts.isReturnStatement(last)) && !allowNoBreak) {
    throw new CompileError('clausula de switch deve terminar com break ou return (DO CASE nao tem fallthrough)', last || atNode, ctx.sf);
  }
  for (const s of list) {
    if (ts.isBreakStatement(s)) throw new CompileError('break so e suportado no fim de um case', s, ctx.sf);
    emitStatement(s, ctx, depth, out);
  }
}

function emitStatement(stmt, ctx, depth, out) {
  const { sf } = ctx;

  if (ts.isBlock(stmt)) {
    for (const s of stmt.statements) emitStatement(s, ctx, depth, out);
    return;
  }

  if (ts.isVariableStatement(stmt)) {
    for (const d of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(d.name)) throw new CompileError('desestruturacao', d, sf);
      // const cur = createCursor<Linha>("nome")  ->  CREATE CURSOR nome (...)
      if (
        d.initializer && ts.isCallExpression(d.initializer) &&
        ts.isIdentifier(d.initializer.expression) && d.initializer.expression.text === 'createCursor'
      ) {
        const call = d.initializer;
        const nameArg = call.arguments[0];
        if (!nameArg || !ts.isStringLiteral(nameArg)) throw new CompileError('createCursor("nome") requer o nome do cursor como string', call, sf);
        const typeArg = call.typeArguments && call.typeArguments[0];
        if (!typeArg) throw new CompileError('createCursor precisa do tipo da linha: createCursor<MinhaLinha>("nome")', call, sf);
        ctx.cursors[d.name.text] = nameArg.text;
        out.push(`${ind(depth)}CREATE CURSOR ${nameArg.text} (${cursorSchema(typeArg, ctx)})`);
        continue;
      }
      // let xs: T[] = [ ... ]  ->  Collection + .Add por elemento
      if (d.initializer && ts.isArrayLiteralExpression(d.initializer)) {
        emitArrayInit(d.name.text, d.initializer, ctx, depth, out);
        continue;
      }
      // const r = FormManager.showModal(X)  ->  DO FORM X TO r (captura)
      if (d.initializer && asFormNav(d.initializer)) {
        out.push(`${ind(depth)}${emitFormNav(asFormNav(d.initializer), d.initializer, ctx, d.name.text)}`);
        continue;
      }
      // const n = from(...).count()  ->  SELECT COUNT(*) ... INTO ARRAY tmp ; n = tmp[1]
      if (d.initializer && asCountQuery(d.initializer)) {
        for (const l of emitCountQuery(d.initializer, ctx, d.name.text, depth)) out.push(l);
        continue;
      }
      // const c = from(...).first()  ->  SELECT TOP 1 ... INTO CURSOR tmp ; SCATTER NAME c
      if (d.initializer && asFirstObjQuery(d.initializer)) {
        for (const l of emitFirstObjQuery(d.initializer, ctx, d.name.text, depth)) out.push(l);
        continue;
      }
      if (d.initializer) out.push(`${ind(depth)}${d.name.text} = ${emitExpr(d.initializer, ctx)}`);
    }
    return;
  }

  if (ts.isExpressionStatement(stmt)) {
    const e = stmt.expression;
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      // xs = [ ... ]  ->  Collection + .Add (multi-linha)
      if (ts.isArrayLiteralExpression(e.right)) {
        emitArrayInit(emitExpr(e.left, ctx), e.right, ctx, depth, out);
        return;
      }
      // xs[i] = v  ->  rejeitado: Collection do VFP nao reatribui por indice (use .push)
      if (ts.isElementAccessExpression(e.left)) {
        throw new CompileError('atribuicao a elemento de array (Collection do VFP nao reatribui por indice; use .push)', e, sf);
      }
      // this.pedidoForm = FormManager.open(X)  ->  DO FORM X NAME This.pedidoForm LINKED
      if (asFormNav(e.right)) {
        out.push(`${ind(depth)}${emitFormNav(asFormNav(e.right), e.right, ctx, emitExpr(e.left, ctx))}`);
        return;
      }
      // total = from(...).count()  ->  SELECT COUNT(*) ... INTO ARRAY tmp ; total = tmp[1]
      if (asCountQuery(e.right)) {
        for (const l of emitCountQuery(e.right, ctx, emitExpr(e.left, ctx), depth)) out.push(l);
        return;
      }
      // this.row = from(...).first()  ->  SELECT TOP 1 ... ; SCATTER NAME tmp ; This.row = tmp
      if (asFirstObjQuery(e.right)) {
        for (const l of emitFirstObjQuery(e.right, ctx, emitExpr(e.left, ctx), depth)) out.push(l);
        return;
      }
    }
    out.push(emitAssignOrCall(e, ctx, depth));
    return;
  }

  if (ts.isReturnStatement(stmt)) {
    out.push(stmt.expression ? `${ind(depth)}RETURN ${emitExpr(stmt.expression, ctx)}` : `${ind(depth)}RETURN`);
    return;
  }

  if (ts.isIfStatement(stmt)) {
    out.push(`${ind(depth)}IF ${emitExpr(stmt.expression, ctx)}`);
    emitStatement(stmt.thenStatement, ctx, depth + 1, out);
    if (stmt.elseStatement) {
      // else-if vira ELSE + IF aninhado (FoxPro nao tem ELSEIF)
      out.push(`${ind(depth)}ELSE`);
      emitStatement(stmt.elseStatement, ctx, depth + 1, out);
    }
    out.push(`${ind(depth)}ENDIF`);
    return;
  }

  if (ts.isWhileStatement(stmt)) {
    out.push(`${ind(depth)}DO WHILE ${emitExpr(stmt.expression, ctx)}`);
    emitStatement(stmt.statement, ctx, depth + 1, out);
    out.push(`${ind(depth)}ENDDO`);
    return;
  }

  if (ts.isForStatement(stmt)) {
    // for(init; cond; update) -> init; DO WHILE cond; corpo; update; ENDDO
    if (stmt.initializer && ts.isVariableDeclarationList(stmt.initializer)) {
      for (const d of stmt.initializer.declarations) {
        if (d.initializer) out.push(`${ind(depth)}${d.name.getText(sf)} = ${emitExpr(d.initializer, ctx)}`);
      }
    } else if (stmt.initializer) {
      out.push(emitAssignOrCall(stmt.initializer, ctx, depth));
    }
    out.push(`${ind(depth)}DO WHILE ${stmt.condition ? emitExpr(stmt.condition, ctx) : '.T.'}`);
    emitStatement(stmt.statement, ctx, depth + 1, out);
    if (stmt.incrementor) out.push(emitAssignOrCall(stmt.incrementor, ctx, depth + 1));
    out.push(`${ind(depth)}ENDDO`);
    return;
  }

  if (ts.isSwitchStatement(stmt)) {
    // switch -> DO CASE; cada CASE compara o discriminante (= num, == string).
    // Cases vazios consecutivos agrupam com OR (case 1: case 2: -> CASE x=1 OR x=2).
    const disc = emitExpr(stmt.expression, ctx);
    const eq = typeKind(stmt.expression, ctx.checker) === 'string' ? '==' : '=';
    out.push(`${ind(depth)}DO CASE`);
    const clauses = stmt.caseBlock.clauses;
    let pending = [];
    clauses.forEach((cl, i) => {
      const isLast = i === clauses.length - 1;
      if (ts.isCaseClause(cl)) {
        pending.push(emitExpr(cl.expression, ctx));
        let body = Array.from(cl.statements);
        if (body.length === 1 && ts.isBlock(body[0])) body = Array.from(body[0].statements);
        if (body.length === 0) return; // fallthrough vazio: acumula o teste no proximo CASE
        out.push(`${ind(depth)}CASE ${pending.map((t) => `${disc} ${eq} ${t}`).join(' OR ')}`);
        pending = [];
        emitCaseBody(cl.statements, ctx, depth + 1, out, isLast, cl);
      } else {
        if (pending.length) throw new CompileError('case sem corpo antes do default (fallthrough nao suportado)', cl, sf);
        out.push(`${ind(depth)}OTHERWISE`);
        emitCaseBody(cl.statements, ctx, depth + 1, out, true, cl);
      }
    });
    if (pending.length) throw new CompileError('case final sem corpo (fallthrough nao suportado)', stmt, sf);
    out.push(`${ind(depth)}ENDCASE`);
    return;
  }

  throw new CompileError(`statement ${ts.SyntaxKind[stmt.kind]}`, stmt, sf);
}

// ---- funcoes ---------------------------------------------------------------

function collectLocals(body, sf) {
  const names = [];
  const seen = new Set();
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && !seen.has(n.name.text)) {
      seen.add(n.name.text);
      names.push(n.name.text);
    }
    n.forEachChild(visit);
  };
  visit(body);
  return names;
}

// analyzeFunction transforma uma FunctionDeclaration tipada na estrutura
// intermediaria { name, params, locals, body } — base das duas formas de saida.
function analyzeFunction(fn, ctx) {
  const { sf } = ctx;
  if (!fn.name) throw new CompileError('funcao anonima', fn, sf);
  if (!fn.body) throw new CompileError('funcao sem corpo (declaração)', fn, sf);
  const params = fn.parameters
    .filter((p) => !(ts.isIdentifier(p.name) && p.name.text === 'this')) // `this: Form` não é parâmetro real
    .map((p) => {
      if (!ts.isIdentifier(p.name)) throw new CompileError('parametro desestruturado', p, sf);
      return p.name.text;
    });
  ctx.cursors = {}; // vars ligadas a cursores (var local -> nome do cursor), por função
  const body = [];
  for (const s of fn.body.statements) emitStatement(s, ctx, 1, body);
  // cursores não são variáveis FoxPro reais — não entram no LOCAL
  const locals = collectLocals(fn.body, sf).filter((n) => !params.includes(n) && !ctx.cursors[n]);
  return { name: fn.name.text, params, locals, body };
}

// procedureText: PROCEDURE name(params) ... ENDPROC (biblioteca .prg standalone).
function procedureText(fn) {
  const lines = [`PROCEDURE ${fn.name}(${fn.params.join(', ')})`];
  if (fn.locals.length) lines.push(`${ind(1)}LOCAL ${fn.locals.join(', ')}`);
  lines.push(...fn.body, 'ENDPROC');
  return lines.join('\n');
}

// methodBodyText: corpo para o memo METHODS de um SCX — params via LPARAMETERS,
// sem o wrapper PROCEDURE/ENDPROC (o gerador de SCX ja o adiciona).
function methodBodyText(fn) {
  const lines = [];
  if (fn.params.length) lines.push(`${ind(1)}LPARAMETERS ${fn.params.join(', ')}`);
  if (fn.locals.length) lines.push(`${ind(1)}LOCAL ${fn.locals.join(', ')}`);
  lines.push(...fn.body);
  return lines.join('\n');
}

// ---- classes (DEFINE CLASS) ------------------------------------------------


// isFormClass: a classe vira um FORM (SCX, via foxc) e nao um DEFINE CLASS de PRG?
// Verdadeiro se `extends Form` (modo campo) ou se tem o decorator @Form.
function isFormClass(cls) {
  if (hasDeco(cls, 'Form')) return true;
  for (const h of cls.heritageClauses || []) {
    if (h.token === ts.SyntaxKind.ExtendsKeyword) {
      for (const t of h.types) if (['Form', 'FoxForm'].includes(t.expression.getText())) return true;
    }
  }
  return false;
}

// propDefault: RHS do default de uma propriedade de classe (por tipo, se nao houver
// inicializador): string -> "", number -> 0, boolean -> .F., date -> {}, resto -> .NULL.
function propDefault(m, ctx) {
  if (m.initializer) return emitExpr(m.initializer, ctx);
  switch (typeKind(m, ctx.checker)) {
    case 'string': return '""';
    case 'number': return '0';
    case 'boolean': return '.F.';
    case 'date': return '{}';
    default: return '.NULL.';
  }
}

// analyzeClass: class comum -> { name, base, props:[{name,default}], methods:[fn] }.
function analyzeClass(cls, ctx) {
  const { sf } = ctx;
  if (!cls.name) throw new CompileError('classe anonima', cls, sf);
  let base = 'Custom';
  for (const h of cls.heritageClauses || []) {
    if (h.token === ts.SyntaxKind.ExtendsKeyword && h.types[0]) base = h.types[0].expression.getText(sf);
  }
  const props = [], methods = [], diInit = [];
  for (const m of cls.members) {
    if (ts.isPropertyDeclaration(m)) {
      props.push({ name: m.name.getText(sf), default: propDefault(m, ctx) });
    } else if (ts.isMethodDeclaration(m)) {
      methods.push(analyzeFunction(m, ctx));
    } else if (ts.isConstructorDeclaration(m)) {
      // DI: cada parâmetro do construtor (tipado) vira propriedade + CREATEOBJECT no Init
      for (const p of m.parameters) {
        const pname = p.name.getText(sf);
        if (!p.type) throw new CompileError('parametro de construtor precisa de tipo (injeção de dependência)', p, sf);
        props.push({ name: pname, default: '.NULL.' });
        diInit.push(`${ind(1)}This.${pname} = CREATEOBJECT(${foxString(p.type.getText(sf))})`);
      }
    }
  }
  if (diInit.length) {
    const init = methods.find((f) => f.name.toLowerCase() === 'init');
    if (init) init.body = [...diInit, ...init.body]; // DI antes do corpo do Init do usuário
    else methods.unshift({ name: 'Init', params: [], locals: [], body: diInit });
  }
  return { name: cls.name.text, base, props, methods };
}

// classText: DEFINE CLASS <name> AS <base> ... ENDDEFINE (com propriedades e PROCEDUREs).
function classText(cls) {
  const lines = [`DEFINE CLASS ${cls.name} AS ${cls.base}`, ''];
  for (const p of cls.props) lines.push(`${ind(1)}${p.name} = ${p.default}`);
  if (cls.props.length) lines.push('');
  for (const fn of cls.methods) {
    lines.push(`${ind(1)}PROCEDURE ${fn.name}`);
    if (fn.params.length) lines.push(`${ind(2)}LPARAMETERS ${fn.params.join(', ')}`);
    if (fn.locals.length) lines.push(`${ind(2)}LOCAL ${fn.locals.join(', ')}`);
    for (const b of fn.body) lines.push(ind(1) + b); // corpo ja vem com 1 nivel de indent
    lines.push(`${ind(1)}ENDPROC`, '');
  }
  lines.push('ENDDEFINE');
  return lines.join('\n');
}

// ---- entrada ---------------------------------------------------------------

// compile parseia + checa tipos e devolve as funcoes analisadas. Em modo nao
// estrito, ignora qualquer statement que nao seja funcao (ex.: o `export const
// form = {...}` do arquivo de autoria, lido a parte pelo orquestrador).
// fallbackCompilerOptions: opções "de fábrica" usadas quando o tsconfig.json da
// raiz some ou nao parseia — espelham o que o tsconfig declara. baseUrl/paths
// resolvem relativo a __dirname (raiz do repo) para que "@vfp/core" -> decorators
// funcione independentemente da pasta do arquivo de entrada.
function fallbackCompilerOptions() {
  return {
    strict: true,
    experimentalDecorators: true,
    target: ts.ScriptTarget.ES2020,
    lib: ['lib.es2020.d.ts'],
    jsx: ts.JsxEmit.Preserve, // forms .tsx: render() devolve JSX lido estruturalmente
    // "@vfp/core" (decorators, FormManager) resolve para a lib empacotada — assim
    // um projeto scaffolded usa o import publico sem precisar instalar nada.
    baseUrl: __dirname,
    paths: { '@vfp/core': ['decorators'] },
  };
}

// readRootCompilerOptions: le o tsconfig.json da raiz do repo como FONTE ÚNICA
// das opções (jsx/strict/experimentalDecorators/paths/baseUrl/target/lib). Resolve
// tudo relativo a __dirname (raiz), nao a pasta do arquivo de entrada. Se o arquivo
// some ou nao parseia, devolve os defaults de fallbackCompilerOptions() — nunca crasha.
function readRootCompilerOptions() {
  try {
    const cfgPath = path.join(__dirname, 'tsconfig.json');
    const read = ts.readConfigFile(cfgPath, ts.sys.readFile);
    if (read.error || !read.config) return fallbackCompilerOptions();
    // parseJsonConfigFileContent resolve baseUrl/paths/lib relativo a __dirname e
    // converte strings ("ES2020", "preserve") nos enums da API do TS.
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, __dirname);
    if (!parsed.options || (parsed.errors && parsed.errors.some((e) => e.category === ts.DiagnosticCategory.Error))) {
      return fallbackCompilerOptions();
    }
    return parsed.options;
  } catch {
    return fallbackCompilerOptions();
  }
}

// loadProgram: cria o Program, valida tipagem e devolve { sf, checker }.
function loadProgram(entry) {
  const abs = path.resolve(entry);
  // globals.d.ts (ambientes que viram comandos VFP, ex.: console) entra como root
  // file mas nunca e emitido — compile() so percorre o arquivo de entrada.
  const globals = path.join(__dirname, 'globals.d.ts');
  const roots = require('fs').existsSync(globals) ? [globals, abs] : [abs];
  // FONTE ÚNICA: jsx/strict/experimentalDecorators/paths/baseUrl/target/lib vêm do
  // tsconfig.json da raiz (lido via readRootCompilerOptions). Aqui só forçamos o que
  // PRECISA ser programatico: noEmit (so checamos tipos) e module/moduleResolution
  // (resolucao de imports do compilador, independente do que o editor usa).
  const options = {
    ...readRootCompilerOptions(),
    noEmit: true,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10 || ts.ModuleResolutionKind.NodeJs,
  };
  const program = ts.createProgram(roots, options);
  const sf = program.getSourceFile(abs);
  if (!sf) throw new Error(`arquivo nao encontrado: ${entry}`);
  // reporta erros de TODOS os arquivos do programa (entry + imports), nao so do
  // entry — um model/servico importado com erro de tipo nao pode passar batido.
  // Exclui libs do TS, node_modules e o globals.d.ts (ambiente, nunca emitido).
  const diags = ts.getPreEmitDiagnostics(program).filter((d) => d.file
    && !program.isSourceFileDefaultLibrary(d.file)
    && !/node_modules/.test(d.file.fileName)
    && path.resolve(d.file.fileName).toLowerCase() !== globals.toLowerCase());
  if (diags.length) {
    const msg = diags.map((d) => {
      const p = d.file.getLineAndCharacterOfPosition(d.start);
      const rel = path.relative(process.cwd(), d.file.fileName) || d.file.fileName;
      return `  ${rel}:${p.line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
    }).join('\n');
    throw new Error(`[foxts] erros de tipagem TypeScript:\n${msg}`);
  }
  return { sf, checker: program.getTypeChecker() };
}

function compile(entry, { strict = true, routes } = {}) {
  const { sf, checker } = loadProgram(entry);
  // emitExpr/emitCall no ctx: nucleo injetado p/ os modulos extraidos (query/validation)
  // chamarem sem dependencia circular. Hoisted -> disponiveis aqui.
  const ctx = { checker, sf, cursors: {}, routes, emitExpr, emitCall };
  const fns = [];
  const defines = [];
  const classes = [];
  const validators = [];
  const menus = [];
  for (const stmt of sf.statements) {
    const sch = asSchema(stmt);
    if (sch) { // export const X = schema({...}) -> PROCEDURE ValidarX(toObj)
      validators.push(emitValidator(sch.name, sch.shape, ctx));
      continue;
    }
    const mnu = asMenu(stmt);
    if (mnu) { // export const X = menu([...]) -> PROCEDURE X (DEFINE MENU ...)
      menus.push(emitMenu(mnu.name, mnu.pads, ctx));
      continue;
    }
    if (ts.isFunctionDeclaration(stmt)) {
      fns.push(analyzeFunction(stmt, ctx));
    } else if (ts.isClassDeclaration(stmt) && (stmt.modifiers || []).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) {
      // `declare class` é ambiente (só tipagem, ex.: referência a serviço em outro arquivo) — não emite
    } else if (ts.isClassDeclaration(stmt) && !isFormClass(stmt) && !hasDeco(stmt, 'Component')) {
      // classe comum -> DEFINE CLASS; classes de form (extends Form / @Form) e
      // @Component ficam para o pipeline de SCX (foxc/transpileForm), fora do PRG.
      classes.push(analyzeClass(stmt, ctx));
    } else if (ts.isClassDeclaration(stmt)) {
      // classe de form / @Component: nao emitida no PRG (vai por foxc build -> SCX)
    } else if (ts.isVariableStatement(stmt) && isConstLiterals(stmt)) {
      // const NOME = <literal> no topo -> #DEFINE NOME valor (constante de compilação)
      for (const d of stmt.declarationList.declarations) {
        defines.push({ name: d.name.getText(sf), value: emitExpr(d.initializer, ctx) });
      }
    } else if (
      strict &&
      !ts.isImportDeclaration(stmt) &&
      !ts.isExportDeclaration(stmt) &&
      !ts.isInterfaceDeclaration(stmt) && // tipos: somem na saída, usados para schema
      !ts.isTypeAliasDeclaration(stmt) &&
      stmt.kind !== ts.SyntaxKind.EmptyStatement
    ) {
      throw new CompileError('apenas declaracoes de funcao, classe ou const literal no nivel superior', stmt, sf);
    }
  }
  return { fns, defines, classes, validators, menus };
}

// isConstLiterals: VariableStatement `const` cujos initializers são todos literais.
function isConstLiterals(stmt) {
  if (!(stmt.declarationList.flags & ts.NodeFlags.Const)) return false;
  return stmt.declarationList.declarations.every((d) => {
    const e = d.initializer;
    return e && (ts.isStringLiteral(e) || ts.isNumericLiteral(e) ||
      e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword);
  });
}

// transpile: arquivo .ts (funcoes + const literais) -> biblioteca FoxPro .prg.
function transpile(entry, opts = {}) {
  const { fns, defines, classes, validators, menus } = compile(entry, { strict: true, routes: opts.routes });
  const header = `* ${path.basename(entry)} -> FoxPro | gerado por foxts (NAO editar)\n`;
  const defs = defines.map((d) => `#DEFINE ${d.name} ${d.value}`).join('\n');
  const blocks = [];
  if (fns.length) blocks.push(fns.map(procedureText).join('\n\n'));
  if (validators.length) blocks.push(validators.join('\n\n'));
  if (menus.length) blocks.push(menus.join('\n\n'));
  if (classes.length) blocks.push(classes.map(classText).join('\n\n'));
  return header + '\n' + (defs ? defs + '\n\n' : '') + blocks.join('\n\n') + '\n';
}

// analyze: extrai as funcoes (lenient) para o orquestrador injeta-las como
// metodos de um SCX. Devolve [{ name, params, locals, body }].
function analyze(entry, opts = {}) {
  return compile(entry, { strict: false, routes: opts.routes }).fns;
}

// findControlDeco: primeiro decorator de controle (@TextBox/@Button/...) de um
// membro -> { baseclass, config }. null se o membro não tiver nenhum.
function findControlDeco(node) {
  const decos = ts.canHaveDecorators && ts.canHaveDecorators(node) ? (ts.getDecorators(node) || []) : [];
  for (const d of decos) {
    const e = d.expression;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
      const bc = DECORATOR_BASECLASS[e.expression.text];
      if (bc) return { baseclass: bc, config: e.arguments[0] };
    }
  }
  return null;
}

// readFormDecorator: @Form({ caption, width, height, name, props }) -> props do form.
function readFormDecorator(call, ir, ctx) {
  const cfg = call.arguments[0];
  if (!cfg || !ts.isObjectLiteralExpression(cfg)) return;
  for (const p of cfg.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = p.name.getText(ctx.sf);
    const v = p.initializer;
    if (key === 'caption' && ts.isStringLiteral(v)) ir.caption = v.text;
    else if (key === 'name' && ts.isStringLiteral(v)) ir.name = v.text;
    else if ((key === 'width' || key === 'height') && ts.isNumericLiteral(v)) ir[key] = Number(v.text);
    else if (key === 'props' && ts.isObjectLiteralExpression(v)) ir.properties = readPropsBag(v, ctx);
    // validate: <SchemaConst> -> gera o método Validar() do form a partir do schema (Frente F)
    else if (key === 'validate' && ts.isIdentifier(v)) ir._validate = v.text;
  }
}

// buildDecoratedControl: membro decorado -> controle na IR. Em método (ex.: @Button
// salvar()) cria um botão cmd<Salvar> cujo Click chama o método, e mantém o corpo
// do método no memo METHODS do form (transpilado).
function buildDecoratedControl(m, deco, ir, ctx) {
  const memberName = m.name.getText(ctx.sf);
  const isMethod = ts.isMethodDeclaration(m);
  let name = memberName;
  if (isMethod && deco.baseclass === 'commandbutton') {
    name = 'cmd' + memberName.charAt(0).toUpperCase() + memberName.slice(1);
  }
  const ctrl = buildControl(name, deco.baseclass, deco.config, ctx);
  if (isMethod) {
    (ctrl.methods = ctrl.methods || {}).Click = memberName; // foxc liga -> ThisForm.<m>()
    const fn = analyzeFunction(m, ctx);
    ir.methods[fn.name] = methodBodyText(fn);
  }
  ir.controls.push(ctrl);
}

// ---- JSX: render() -> árvore de controles, layout resolvido em build-time -----

// applyWindowChrome: Tier-0 "grátis" — cantos arredondados (e titlebar escura no
// modo dark) via DWM (Win11). DECLARE DLL + DwmSetWindowAttribute em ThisForm.HWnd,
// prependido no Init. Opt-in por token `win11`; em <Win11 o atributo é ignorado
// (no-op gracioso). Mantém a promessa "sem runtime" — é só API nativa do Windows.
function applyWindowChrome(ir) {
  if (!THEME.win11) return;
  const dark = THEME._mode === 'dark';
  const L = [
    `${ind(1)}* chrome Win11 (DWM): cantos arredondados${dark ? ' + titlebar escura' : ''} (ignorado em <Win11)`,
    `${ind(1)}DECLARE INTEGER DwmSetWindowAttribute IN dwmapi.dll INTEGER hwnd, INTEGER attr, INTEGER @ pv, INTEGER cb`,
    `${ind(1)}LOCAL lnVal`,
    `${ind(1)}lnVal = 2  && DWMWCP_ROUND`,
    `${ind(1)}DwmSetWindowAttribute(ThisForm.HWnd, 33, @lnVal, 4)  && WINDOW_CORNER_PREFERENCE`,
  ];
  if (dark) {
    L.push(`${ind(1)}lnVal = 1`);
    L.push(`${ind(1)}DwmSetWindowAttribute(ThisForm.HWnd, 20, @lnVal, 4)  && USE_IMMERSIVE_DARK_MODE`);
  }
  prependInit(ir, L.join('\n'));
}

// prependInit: injeta código no início do Init, mas DEPOIS de um LPARAMETERS/PARAMETERS
// líder (que precisa ser a 1ª linha executável) e de comentários iniciais.
function prependInit(ir, code) {
  const init = ir.methods.Init;
  if (!init) { ir.methods.Init = code; return; }
  const lines = init.split('\n');
  let at = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('*')) { at = i + 1; continue; }
    at = /^L?PARAMETERS\b/i.test(t) ? i + 1 : i; // depois do (L)PARAMETERS; senão antes do 1º código
    break;
  }
  lines.splice(at, 0, code);
  ir.methods.Init = lines.join('\n');
}

// resolveNestedControlRefs: nos MÉTODOS, `this.lblTotal` (escrito pelo autor) vira
// `ThisForm.lblTotal` — mas se o controle está ANINHADO num Container, o caminho real é
// `ThisForm.pCardapio.lblTotal`. Sem resolver, o acesso falha em runtime ("propriedade
// não encontrada"). Aqui reescrevemos `This[Form].<nome>` -> `This[Form].<caminho.pontilhado>`
// para todo controle com pai (nomes de controle são únicos; membros do form e métodos não
// estão no mapa, então `This.total`/`This.mostrar()` ficam intactos). Passe único (regex com
// callback) p/ não re-escanear o caminho inserido (que contém nomes de container).
function resolveNestedControlRefs(ir) {
  if (!ir.controls || !ir.methods) return;
  const byName = {};
  for (const c of ir.controls) if (c.name) byName[c.name.toLowerCase()] = c;
  const pathOf = (c) => {
    const parts = [c.name];
    let p = c.parent && byName[c.parent.toLowerCase()];
    while (p) { parts.unshift(p.name); p = p.parent && byName[p.parent.toLowerCase()]; }
    return parts.join('.');
  };
  const map = {}; // só controles ANINHADOS (com pai) — top-level já resolve por This.<nome>
  for (const c of ir.controls) if (c.name && c.parent) map[c.name.toLowerCase()] = pathOf(c);
  if (!Object.keys(map).length) return;
  const re = /\bThis(Form)?\.(\w+)/g;
  for (const k of Object.keys(ir.methods)) {
    if (typeof ir.methods[k] !== 'string') continue;
    ir.methods[k] = ir.methods[k].replace(re, (m, f, name) => {
      const path = map[name.toLowerCase()];
      return path ? 'This' + (f || '') + '.' + path : m;
    });
  }
}

// applyRuntimeColors: cor de DESIGN no SCX gerado NÃO aplica no DO FORM (carrega
// corrompida — só o byte baixo sobrevive); atribuição em RUNTIME aplica certo. Então
// re-emitimos toda cor (form + controles, BackColor/ForeColor/BorderColor/FillColor)
// como atribuição no Init, pelo caminho pontilhado (PARENT já resolvido pós-layout).
function applyRuntimeColors(ir) {
  const byName = {};
  for (const c of ir.controls) byName[(c.name || '').toLowerCase()] = c;
  const pathOf = (c) => {
    const parts = [c.name];
    let p = c.parent && byName[c.parent.toLowerCase()];
    while (p) { parts.unshift(p.name); p = p.parent && byName[p.parent.toLowerCase()]; }
    return 'ThisForm.' + parts.join('.');
  };
  const COLOR = ['BackColor', 'ForeColor', 'BorderColor', 'FillColor'];
  const lines = [];
  for (const cp of ['BackColor', 'ForeColor']) {
    if (ir.properties && typeof ir.properties[cp] === 'number') lines.push(`${ind(1)}ThisForm.${cp} = ${ir.properties[cp]}`);
  }
  for (const c of ir.controls) {
    if (!c.properties) continue;
    const base = pathOf(c);
    for (const cp of COLOR) if (typeof c.properties[cp] === 'number') lines.push(`${ind(1)}${base}.${cp} = ${c.properties[cp]}`);
  }
  if (lines.length) prependInit(ir, lines.join('\n'));
}

// applyFlatChrome: modo "FLAT" (inspirado no Pwi_vf9_Platavf). Tira a borda/titlebar
// nativa do form e injeta um header próprio: título (fontTitle) + controlbox custom
// (minimizar/maximizar/fechar em fonte Marlett, hover por shade(), arrastar-para-mover
// via WM_NCLBUTTONDOWN). Tudo inline no SCX — sem .vcx externa, mantém o artefato
// auto-contido. Opt-in pelo token `flat`. Só em forms TSX (render()).
function applyFlatChrome(ir) {
  if (!THEME.flat) return;
  const W = typeof ir.width === 'number' ? ir.width : 400;
  const H = 34; // altura do header
  ir.properties = ir.properties || {};
  ir.properties.TitleBar = 0;   // sem barra de título nativa
  ir.properties.BorderStyle = 0; // sem borda (chrome é nosso)
  // empurra o conteúdo do render() p/ baixo do header (só controles de topo; filhos
  // de container acompanham o pai). Cresce a altura do form na mesma medida.
  for (const c of ir.controls) if (!c.parent) c.top = (c.top || 0) + H;
  if (typeof ir.height === 'number') ir.height += H;
  const onPri = hexToRGB(THEME.onPrimary);
  const hoverBtn = shade('primary', 24);    // hover min/max: primary mais claro
  const hoverClose = hexToRGB('#e81123');   // hover fechar: vermelho (padrão Windows)
  // arrastar a janela sem borda: devolve a captura e manda o gerenciador tratar como
  // clique na "legenda" (HTCAPTION) — drag nativo, com snap, igual a uma titlebar.
  const drag = [
    'DECLARE INTEGER ReleaseCapture IN user32',
    'DECLARE INTEGER SendMessage IN user32 INTEGER hWnd, INTEGER Msg, INTEGER wParam, INTEGER lParam',
    'ReleaseCapture()',
    'SendMessage(ThisForm.HWnd, 161, 2, 0)  && WM_NCLBUTTONDOWN, HTCAPTION',
  ].join('\n');
  const chrome = [];
  // header (barra colorida full-width)
  chrome.push({ type: 'container', name: 'cntFlatBar', left: 0, top: 0, width: W, height: H,
    properties: { BackColor: hexToRGB(THEME.primary), BackStyle: 1, BorderWidth: 0 },
    methods: { MouseDown: drag } });
  // título
  chrome.push({ type: 'label', name: 'lblFlatTitle', parent: 'cntFlatBar', left: 12, top: 9, width: W - 110, height: 18,
    caption: ir.caption || '',
    properties: { BackStyle: 0, ForeColor: onPri, FontSize: 11, FontName: foxString(THEME.fontTitle || THEME.fontBody || THEME.font || 'Segoe UI') },
    methods: { MouseDown: drag } });
  // botão do controlbox: container (área de hover full-height) + label Marlett centrado.
  // Click e MouseEnter ficam no container E no label (o label é o controle de topo sob
  // o cursor sobre o glifo) — assim clicar/hoverar no símbolo funciona sem buraco.
  const btn = (name, glyph, x, click, hover) => {
    chrome.push({ type: 'container', name, parent: 'cntFlatBar', left: x, top: 0, width: 30, height: H,
      properties: { BackStyle: 0, BorderWidth: 0 },
      methods: { Click: click, MouseEnter: `This.BackStyle = 1\nThis.BackColor = ${hover}`, MouseLeave: 'This.BackStyle = 0' } });
    chrome.push({ type: 'label', name: name + 'g', parent: name, left: 0, top: 9, width: 30, height: 16,
      caption: glyph,
      properties: { BackStyle: 0, Alignment: 2, FontName: foxString('Marlett'), FontSize: 10, ForeColor: onPri },
      methods: { Click: click, MouseEnter: `This.Parent.BackStyle = 1\nThis.Parent.BackColor = ${hover}` } });
  };
  btn('cntFlatMin', '0', W - 90, 'ThisForm.WindowState = 1', hoverBtn);
  btn('cntFlatMax', '1', W - 60, 'IF ThisForm.WindowState = 2\n    ThisForm.WindowState = 0\nELSE\n    ThisForm.WindowState = 2\nENDIF', hoverBtn);
  btn('cntFlatClose', 'r', W - 30, 'ThisForm.Release()', hoverClose);
  for (const c of chrome) ir.controls.push(c);
}

// devolve o NÚMERO de cor do VFP (0x00BBGGRR). Crucial: no memo do SCX a expressão
// "RGB(r,g,b)" NÃO é avaliada pelo DO FORM (vira lixo) — tem que ser número literal.
// O número também é válido em código runtime (This.BackColor = 16579320).

function transpileForm(entry, opts = {}) {
  const { sf, checker } = loadProgram(entry);
  const cls = sf.statements.filter(ts.isClassDeclaration).find(isFormClass);
  if (!cls) return null;
  const ctx = { checker, sf, cursors: {}, routes: opts.routes, emitExpr, emitCall };
  const ir = { name: cls.name ? cls.name.text : 'frmSemNome', properties: {}, controls: [], methods: {}, members: [] };
  const formDeco = hasDeco(cls, 'Form');
  if (formDeco) readFormDecorator(formDeco, ir, ctx);
  // tipografia default do token de tema (ex.: "Segoe UI") — herdada por todos os
  // controles do form, sem path baked. Só aplica se o form não fixou FontName.
  ir.properties = ir.properties || {};
  const bodyFont = THEME.fontBody || THEME.font; // papel "conteúdo"
  if (bodyFont && ir.properties.FontName == null) ir.properties.FontName = foxString(bodyFont);
  // fundo do form pelo token `bg` (neutro claro/escuro) — base do visual moderno.
  if (THEME.bg && ir.properties.BackColor == null) ir.properties.BackColor = hexToRGB(THEME.bg);
  const routeDeco = hasDeco(cls, 'Route'); // @Route("nome") -> ir.route (mapa em routes.json)
  if (routeDeco && routeDeco.arguments[0] && ts.isStringLiteral(routeDeco.arguments[0])) ir.route = routeDeco.arguments[0].text;

  // modo TSX: se a classe tem render(), os controles vêm da árvore JSX (com layout
  // calculado em build-time); os demais métodos viram métodos do form.
  const renderM = cls.members.find((m) => ts.isMethodDeclaration(m) && m.name.getText(sf) === 'render');
  if (renderM) {
    const tree = parseJsx(findRenderReturn(renderM, ctx), ctx);
    const st = { ir, counts: {}, post: [] }; // post: ajustes pós-layout (headers de grid)
    const lt = toLayoutTree(tree, ctx, st);
    layout.compute(lt); // motor de layout (flex | yoga) grava Top/Left/Width/Height
    for (const m of cls.members) {
      if (ts.isMethodDeclaration(m) && m !== renderM) {
        const fn = analyzeFunction(m, ctx);
        ir.methods[fn.name] = methodBodyText(fn);
      } else if (ts.isPropertyDeclaration(m) && m.initializer) {
        // campo de ESTADO do form (ex.: phase = 0 p/ animação) -> membro com default.
        // (controles vêm do JSX; este caminho é só p/ propriedades de valor escalar.)
        const pname = m.name.getText(sf);
        const init = m.initializer;
        let def;
        if (ts.isNumericLiteral(init)) def = init.text;
        else if (ts.isStringLiteral(init)) def = foxString(init.text);
        else if (init.kind === ts.SyntaxKind.TrueKeyword) def = '.T.';
        else if (init.kind === ts.SyntaxKind.FalseKeyword) def = '.F.';
        else if (ts.isPrefixUnaryExpression(init) && init.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(init.operand)) def = '-' + init.operand.text;
        if (def !== undefined && !ir.members.some((x) => x.name.toLowerCase() === pname.toLowerCase())) {
          ir.members.push({ name: pname, kind: 'property', desc: `(estado) ${pname}`, default: def });
        }
      }
    }
    applyConstructorDI(cls, ir, ctx);
    // headers de grid reaplicados no fim do Init (após a vinculação ao cursor, que
    // reescreve o Header1.Caption pelo nome do campo). O caminho de acesso usa o
    // PARENT já resolvido pelo layout (ThisForm.cnt1.grd1 etc.).
    if (st.post.length) {
      const fix = st.post.map((p) => {
        if (p.goTop) return `${ind(1)}GO TOP IN ${p.goTop}`; // grade exibe a partir do 1º registro
        if (p.setProp) { // prop string (ex: Value/placeholder) atribuída em runtime
          const sp = 'ThisForm.' + (p.setProp.parent ? p.setProp.parent + '.' : '') + p.setProp.name;
          return `${ind(1)}${sp}.${p.prop} = ${foxString(p.value)}`;
        }
        const path = 'ThisForm.' + (p.ctrl.parent ? p.ctrl.parent + '.' : '') + p.ctrl.name;
        const lines = [`${ind(1)}${path}.Column${p.col}.Header1.Caption = ${foxString(p.header)}`];
        if (p.bold) lines.push(`${ind(1)}${path}.Column${p.col}.Header1.FontBold = .T.`);
        if (p.headBg) { // header com cores nossas (precisa Themes=.F. no grid)
          lines.push(`${ind(1)}${path}.Column${p.col}.Header1.BackColor = ${p.headBg}`);
          lines.push(`${ind(1)}${path}.Column${p.col}.Header1.ForeColor = ${p.headFg}`);
        }
        return lines.join('\n');
      }).join('\n');
      ir.methods.Init = ir.methods.Init ? ir.methods.Init + '\n' + fix : fix;
    }
    resolveNestedControlRefs(ir); // this.<ctrl> aninhado -> caminho pontilhado (antes das cores)
    applyFlatChrome(ir);   // modo flat: header custom + controlbox (se token flat)
    applyRuntimeColors(ir); // cores no Init (design-prop de cor não aplica no SCX)
    applyWindowChrome(ir); // Tier-0: chrome Win11 (cantos/dark) via DWM, se token win11
    applyFormValidate(ir, ctx); // @Form({ validate: Schema }) -> método Validar()
    return ir;
  }

  for (const m of cls.members) {
    const ctrlDeco = formDeco ? findControlDeco(m) : null;
    if (ctrlDeco) {
      buildDecoratedControl(m, ctrlDeco, ir, ctx);
    } else if (ts.isPropertyDeclaration(m)) {
      if (!formDeco) readClassField(m, ir, ctx); // modo campo (extends Form); no modo
      // decorator, propriedade sem decorator de controle é ignorada
    } else if (ts.isMethodDeclaration(m)) {
      const fn = analyzeFunction(m, ctx);
      ir.methods[fn.name] = methodBodyText(fn);
    }
  }
  applyConstructorDI(cls, ir, ctx);
  applyRuntimeColors(ir); // cores no Init (design-prop de cor não aplica no SCX)
  applyWindowChrome(ir); // Tier-0: chrome Win11 (cantos/dark) via DWM, se token win11
  applyFormValidate(ir, ctx); // @Form({ validate: Schema }) -> método Validar()
  return ir;
}

// eventos base do VFP — não precisam de membro custom (RESERVED3) nem de prefixo.
const BASE_EVENTS = new Set([
  'init', 'load', 'destroy', 'click', 'dblclick', 'rightclick', 'gotfocus', 'lostfocus',
  'keypress', 'interactivechange', 'valid', 'when', 'activate', 'deactivate', 'resize',
  'unload', 'error', 'refresh', 'show', 'hide', 'timer', 'mousedown', 'mouseup', 'mousemove',
]);

// Eventos do VFP que são DISPARADOS COM PARÂMETROS. O VFP chama, p.ex., MouseEnter passando
// (nButton, nShift, nXCoord, nYCoord); se o corpo do método não tiver um LPARAMETERS, o VFP
// lança "No PARAMETER statement is found" (erro 1229) no 1º hover/clique. Por isso injetamos
// o LPARAMETERS no início desses métodos gerados (hover dos botões flat/sidebar/toolbar etc.).
const EVENT_PARAMS = {
  mouseenter: 'nButton, nShift, nXCoord, nYCoord',
  mouseleave: 'nButton, nShift, nXCoord, nYCoord',
  mousemove: 'nButton, nShift, nXCoord, nYCoord',
  mousedown: 'nButton, nShift, nXCoord, nYCoord',
  mouseup: 'nButton, nShift, nXCoord, nYCoord',
  mousewheel: 'nDirection, nShift, nXCoord, nYCoord',
  keypress: 'nKeyCode, nShiftAltCtrl',
  dragdrop: 'oSource, nXCoord, nYCoord',
  dragover: 'oSource, nXCoord, nYCoord, nState',
};

// finalizeFormIR: pós-processa a IR de um form antes de gerar o SCX —
//  (1) Click de controle com nome de método ("salvar") vira ThisForm.salvar();
//  (2) registra um membro custom (RESERVED3) para cada método que não é evento base.
// Compartilhado por foxc.js e pela CLI vfp. `tsNames` marca quais métodos vieram de
// TypeScript (descrição); se omitido, assume todos.
function finalizeFormIR(ir, tsNames) {
  ir.members = ir.members || [];
  ir.methods = ir.methods || {};
  // B3: garante nomes de controle únicos (VFP é case-insensitive). Sem isso, dois
  // <SaveButton/> ou dois <CustomerLookup/> colidiriam (cmdSalvar, cmdSalvar).
  const seen = new Map();
  const renamed = new Map(); // nome antigo (lower) -> novo, p/ corrigir PARENT dos filhos
  for (const c of ir.controls || []) {
    const key = c.name.toLowerCase();
    const n = seen.get(key) || 0;
    if (n > 0) { const novo = c.name + (n + 1); renamed.set(key, novo); c.name = novo; }
    seen.set(key, n + 1);
  }
  // se um container/pageframe foi renomeado, reaponta o PARENT pontilhado dos filhos
  if (renamed.size) for (const c of ir.controls || []) {
    if (!c.parent) continue;
    const segs = c.parent.split('.').map((s) => renamed.get(s.toLowerCase()) || s);
    c.parent = segs.join('.');
  }
  for (const c of ir.controls || []) {
    if (!c.methods) continue;
    for (const k of Object.keys(c.methods)) {
      let v = c.methods[k];
      if (typeof v === 'string' && /^[A-Za-z_]\w*$/.test(v.trim())) v = c.methods[k] = `ThisForm.${v.trim()}()`;
      // injeta LPARAMETERS em eventos disparados com parâmetros (MouseEnter/Leave etc.),
      // senão o VFP erra "No PARAMETER statement is found" no 1º hover. Pula se já houver.
      const ep = typeof v === 'string' ? EVENT_PARAMS[k.toLowerCase()] : null;
      if (ep && !/^\s*L?PARAMETERS\b/i.test(v)) c.methods[k] = `LPARAMETERS ${ep}\n${v}`;
    }
  }
  for (const name of Object.keys(ir.methods)) {
    if (BASE_EVENTS.has(name.toLowerCase())) continue;
    if (ir.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) continue;
    const isTs = !tsNames || tsNames.some((t) => t.toLowerCase() === name.toLowerCase());
    ir.members.push({ name, kind: 'method', desc: `(${isTs ? 'TypeScript' : 'FoxPro'}) ${name}` });
  }
  return ir;
}

module.exports = { transpile, analyze, transpileForm, collectRoute, collectMenus, finalizeFormIR, setTheme, setMessages, procedureText, methodBodyText, CompileError };
