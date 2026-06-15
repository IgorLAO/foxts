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

class CompileError extends Error {
  constructor(msg, node, sf) {
    let loc = '';
    if (node && sf) {
      const p = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      loc = ` (linha ${p.line + 1}, coluna ${p.character + 1})`;
    }
    super(`[foxts] nao suportado: ${msg}${loc}`);
    this.name = 'CompileError';
  }
}

const IND = '\t';
const ind = (n) => IND.repeat(n);

// ---- tipos -----------------------------------------------------------------

function typeKind(node, checker) {
  const t = checker.getTypeAtLocation(node);
  if (t.flags & ts.TypeFlags.StringLike) return 'string';
  if (t.flags & ts.TypeFlags.NumberLike) return 'number';
  if (t.flags & ts.TypeFlags.BooleanLike) return 'boolean';
  if (checker.typeToString(t) === 'Date') return 'date';
  return 'unknown';
}

// isArrayType: o nó tem tipo de array TS (number[], string[], Array<T>)? Esses
// viram um objeto Collection do VFP (ver lowering de push/length/indexação).
function isArrayType(node, checker) {
  const t = checker.getTypeAtLocation(node);
  if (typeof checker.isArrayType === 'function') return checker.isArrayType(t);
  return /\[\]$/.test(checker.typeToString(t)); // fallback: "number[]"
}

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

function foxString(s) {
  // FoxPro nao tem escape dentro de aspas; se houver aspas duplas, usa delimitador [ ].
  return s.includes('"') ? `[${s}]` : `"${s}"`;
}

// dottedThisPath: se `node` for um acesso encadeado com raiz em `this`
// (this.txtIni.value), devolve "This.txtIni.value"; senão null.
function dottedThisPath(node) {
  const parts = [];
  let cur = node;
  while (ts.isPropertyAccessExpression(cur)) {
    parts.unshift(cur.name.text);
    cur = cur.expression;
  }
  if (cur.kind === ts.SyntaxKind.ThisKeyword) return 'This.' + parts.join('.');
  return null;
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

// readPropsBag: { Key: valor } literal -> { Key: <RHS para PROPERTIES> }.
// String vira verbatim (".T.", "{}", "RGB(...)"); número/booleano convertidos.
function readPropsBag(obj, ctx) {
  const out = {};
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = p.name.getText(ctx.sf);
    const v = p.initializer;
    if (ts.isStringLiteral(v)) out[key] = v.text;
    else if (ts.isNumericLiteral(v)) out[key] = Number(v.text);
    else if (v.kind === ts.SyntaxKind.TrueKeyword) out[key] = '.T.';
    else if (v.kind === ts.SyntaxKind.FalseKeyword) out[key] = '.F.';
    else if (ts.isPrefixUnaryExpression(v) && v.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(v.operand)) {
      out[key] = -Number(v.operand.text);
    }
  }
  return out;
}

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

// métodos terminais do query builder: produzem um comando/valor (fim da cadeia).
//   all(cur)/first(cur) -> SELECT ... INTO CURSOR (statement)
//   count()             -> valor escalar (capturado em const x = ...; ver emitStatement)
const QUERY_TERMINALS = new Set(['all', 'first', 'count']);

// queryTerminal: nome do método terminal de uma cadeia `from(...)....<terminal>()`,
// ou null se não for uma query. Reconhece os terminais em QUERY_TERMINALS.
function queryTerminal(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  const term = node.expression.name.text;
  if (!QUERY_TERMINALS.has(term)) return null;
  let cur = node.expression.expression;
  while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) cur = cur.expression.expression;
  return (ts.isCallExpression(cur) && ts.isIdentifier(cur.expression) && cur.expression.text === 'from') ? term : null;
}

// asQuery: a query é um statement-terminal que cria cursor? `all()` sempre; `first(cur)`
// (COM nome de cursor) também. `first()` SEM argumento é expressão (objeto-linha,
// capturado) e `count()` é expressão (escalar), então nenhum dos dois entra aqui.
function asQuery(node) {
  const t = queryTerminal(node);
  return t === 'all' || (t === 'first' && node.arguments.length > 0);
}
function asCountQuery(node) { return queryTerminal(node) === 'count'; }
// asFirstObjQuery: `from(...).first()` sem cursor -> SELECT TOP 1 + SCATTER NAME (objeto-linha).
function asFirstObjQuery(node) { return queryTerminal(node) === 'first' && node.arguments.length === 0; }

// parseQueryChain: desce a cadeia fluente from().join().where().groupBy()....() e
// devolve as partes estruturadas do SELECT (sem montar a string). Compartilhado por
// emitQuery (all/first) e emitCountQuery (count).
function parseQueryChain(node, ctx) {
  const { sf } = ctx;
  const strLit = (a) => { if (a && ts.isStringLiteral(a)) return a.text; throw new CompileError('query: esperado string literal', a || node, sf); };
  const calls = [];
  let cur = node;
  while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
    calls.unshift({ name: cur.expression.name.text, args: cur.arguments });
    cur = cur.expression.expression;
  }
  const q = { table: strLit(cur.arguments[0]), fields: '*', into: null, top: null, terminal: null,
    where: [], order: [], joins: [], groups: [], having: [] };
  for (const c of calls) {
    switch (c.name) {
      case 'select': q.fields = c.args.map(strLit).join(', '); break;
      case 'where': q.where.push(c.args.length >= 2 ? `${strLit(c.args[0])} = ${emitExpr(c.args[1], ctx)}` : strLit(c.args[0])); break;
      case 'whereRaw': q.where.push(strLit(c.args[0])); break;
      case 'join': q.joins.push(`INNER JOIN ${strLit(c.args[0])} ON ${strLit(c.args[1])}`); break;
      case 'leftJoin': q.joins.push(`LEFT JOIN ${strLit(c.args[0])} ON ${strLit(c.args[1])}`); break;
      case 'groupBy': for (const a of c.args) q.groups.push(strLit(a)); break;
      case 'having': q.having.push(strLit(c.args[0])); break;
      case 'orderBy': q.order.push(strLit(c.args[0])); break;
      case 'all': q.terminal = 'all'; if (c.args[0]) q.into = strLit(c.args[0]); break;
      case 'first': q.terminal = 'first'; q.top = 1; if (c.args[0]) q.into = strLit(c.args[0]); break;
      case 'count': q.terminal = 'count'; break;
      default: throw new CompileError(`query: método .${c.name}() não suportado (select/where/whereRaw/join/leftJoin/groupBy/having/orderBy/all/first/count)`, node, sf);
    }
  }
  return q;
}

// buildSelect: monta o SELECT a partir das partes; `fields`/`into` permitem override
// (count usa COUNT(*) e INTO ARRAY). Sem cláusula INTO se into===null.
function buildSelect(q, { fields = q.fields, into = q.into, intoKind = 'CURSOR' } = {}) {
  let sql = `SELECT ${q.top ? `TOP ${q.top} ` : ''}${fields} FROM ${q.table}`;
  if (q.joins.length) sql += ` ${q.joins.join(' ')}`;
  if (q.where.length) sql += ` WHERE ${q.where.join(' AND ')}`;
  if (q.groups.length) sql += ` GROUP BY ${q.groups.join(', ')}`;
  if (q.having.length) sql += ` HAVING ${q.having.join(' AND ')}`;
  if (q.order.length) sql += ` ORDER BY ${q.order.join(', ')}`;
  if (into) sql += ` INTO ${intoKind} ${into}${intoKind === 'CURSOR' ? ' READWRITE' : ''}`;
  return sql;
}

// emitQuery: from().where().orderBy().all()/.first() -> SELECT ... INTO CURSOR nativo.
function emitQuery(node, ctx) {
  return buildSelect(parseQueryChain(node, ctx));
}

// emitCountQuery: `const n = from(...).where(...).count()` -> SELECT COUNT(*) ... INTO
// ARRAY <tmp> (statement) + atribuição `n = <tmp>[1]`. count é o único terminal que
// é expressão (valor escalar): por isso é capturado no statement, não em emitExpr.
function emitCountQuery(node, ctx, target, depth) {
  const q = parseQueryChain(node, ctx);
  const tmp = `__cnt${(ctx.tmpSeq = (ctx.tmpSeq || 0) + 1)}`;
  const sel = buildSelect(q, { fields: 'COUNT(*)', into: tmp, intoKind: 'ARRAY' });
  return [`${ind(depth)}${sel}`, `${ind(depth)}${target} = ${tmp}[1]`];
}

// emitFirstObjQuery: `const c = from(...).first()` -> SELECT TOP 1 ... INTO CURSOR tmp +
// SCATTER NAME (objeto com uma propriedade por campo). Sem linha, `target = .NULL.`.
// `first()` é o 2º terminal-expressão (capturado): acessar `c.nome`/`c.uf` no FoxPro
// lê as propriedades do objeto. SCATTER NAME exige um memvar simples; quando o alvo é
// pontilhado (This.x) usamos um temp e atribuímos.
function emitFirstObjQuery(node, ctx, target, depth) {
  const q = parseQueryChain(node, ctx);
  q.top = 1; // garante TOP 1 mesmo sem .first() ter setado (defensivo)
  const seq = (ctx.tmpSeq = (ctx.tmpSeq || 0) + 1);
  const tmp = `__row${seq}`;
  const simple = /^[A-Za-z_]\w*$/.test(target);
  const obj = simple ? target : `__obj${seq}`;
  const sel = buildSelect(q, { into: tmp, intoKind: 'CURSOR' });
  const lines = [
    `${ind(depth)}${sel}`,
    `${ind(depth)}IF _TALLY > 0`,
    `${ind(depth + 1)}SCATTER NAME ${obj} MEMO`,
    ...(simple ? [] : [`${ind(depth + 1)}${target} = ${obj}`]),
    `${ind(depth)}ELSE`,
    `${ind(depth + 1)}${target} = .NULL.`,
    `${ind(depth)}ENDIF`,
    `${ind(depth)}USE IN ${tmp}`,
  ];
  return lines;
}

// ── Frente F: validação estilo Zod -> validador VFP ───────────────────────────
// asSchema: `export const Cliente = schema({ ... })` no topo -> { name, shape }.
// O validador gerado é `PROCEDURE ValidarCliente(toObj)` que devolve "" se válido
// ou a 1ª mensagem de erro (string). Ver emitValidator.
function asSchema(stmt) {
  if (!ts.isVariableStatement(stmt) || !(stmt.declarationList.flags & ts.NodeFlags.Const)) return null;
  if (stmt.declarationList.declarations.length !== 1) return null;
  const d = stmt.declarationList.declarations[0];
  const e = d.initializer;
  if (!e || !ts.isCallExpression(e) || !ts.isIdentifier(e.expression) || e.expression.text !== 'schema') return null;
  if (!ts.isIdentifier(d.name)) return null;
  const shape = e.arguments[0];
  if (!shape || !ts.isObjectLiteralExpression(shape)) return null;
  return { name: d.name.text, shape };
}

// parseRule: desce a cadeia `str().min(3).max(10)` / `num().min(18)` -> { base, rules[] }.
function parseRule(expr, sf) {
  const calls = [];
  let cur = expr;
  while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
    calls.unshift({ name: cur.expression.name.text, args: cur.arguments });
    cur = cur.expression.expression;
  }
  if (!ts.isCallExpression(cur) || !ts.isIdentifier(cur.expression)) throw new CompileError('schema: cada campo deve ser str()/num() com regras encadeadas', expr, sf);
  const base = cur.expression.text; // 'str' | 'num'
  if (base !== 'str' && base !== 'num') throw new CompileError(`schema: tipo base "${base}" desconhecido (use str() ou num())`, expr, sf);
  const num = (a) => { if (!a || !ts.isNumericLiteral(a)) throw new CompileError('schema: regra requer um número literal', a || expr, sf); return Number(a.text); };
  const rules = calls.map((c) => {
    // .refine(v => <expr booleano>, "mensagem"): regra custom. O arrow devolve TRUE p/
    // VÁLIDO (estilo Zod); o param vira a referência do campo na hora de emitir.
    if (c.name === 'refine') {
      const fn = c.args[0];
      if (!fn || !ts.isArrowFunction(fn) || fn.parameters.length !== 1 || ts.isBlock(fn.body)) {
        throw new CompileError('schema: .refine espera (v => <expr booleano>, "mensagem") — arrow de 1 parâmetro com corpo-expressão', fn || expr, sf);
      }
      const msgArg = c.args[1];
      if (!msgArg || !ts.isStringLiteral(msgArg)) throw new CompileError('schema: .refine requer a mensagem como string literal', msgArg || expr, sf);
      return { name: 'refine', param: fn.parameters[0].name.getText(sf), body: fn.body, msg: msgArg.text };
    }
    return { name: c.name, n: c.args[0] ? num(c.args[0]) : null };
  });
  return { base, rules };
}

// MESSAGES: catálogo de mensagens dos validadores (i18n). Templates com {field} e {n},
// interpolados em BUILD-TIME (a mensagem fica como string estática no SCX). Default em
// PT; o projeto sobrepõe via vfp.messages.json (setMessages), igual ao tema. Chave =
// `${base}.${regra}`. As mensagens de `.refine` são explícitas (não passam por aqui).
const MESSAGES = {
  'str.required': '{field}: obrigatorio',
  'str.min': '{field}: minimo {n} caracteres',
  'str.max': '{field}: maximo {n} caracteres',
  'str.len': '{field}: deve ter {n} caracteres',
  'str.email': '{field}: email invalido',
  'num.required': '{field}: obrigatorio',
  'num.min': '{field}: minimo {n}',
  'num.max': '{field}: maximo {n}',
  'num.int': '{field}: deve ser inteiro',
};

// setMessages: mescla overrides de mensagens de validação (i18n). Aceita catálogo plano
// `{ "str.min": "..." }` ou `{ messages: {...} }`. Chamado por vfp/foxc antes de transpilar.
function setMessages(obj) {
  const cat = obj && obj.messages ? obj.messages : obj;
  if (cat && typeof cat === 'object') {
    for (const k of Object.keys(cat)) if (typeof cat[k] === 'string') MESSAGES[k] = cat[k];
  }
}

// msgFor: monta a mensagem de uma regra a partir do template (interpola {field} e {n}).
function msgFor(key, field, n) {
  const tpl = MESSAGES[key] != null ? MESSAGES[key] : `{field}: ${key}`;
  return tpl.replace(/\{field\}/g, field).replace(/\{n\}/g, n == null ? '' : String(n));
}

// schemaCheckLines: gera as linhas de checagem (IFs que dão RETURN da mensagem de erro)
// para um shape de schema. `refOf(field)` produz a expressão FoxPro que lê o valor do
// campo — `toObj.<f>` no validador-PROCEDURE; `ThisForm.<f>` no método de form (Frente F:
// validação gerada direto do schema). Compartilhado por emitValidator e transpileForm.
// As condições (lógica) são fixas; só as MENSAGENS vêm do catálogo MESSAGES (i18n).
function schemaCheckLines(shape, refOf, ctx, depth = 1) {
  const { sf } = ctx;
  const body = [];
  const fail = (cond, msg) => { body.push(`${ind(depth)}IF ${cond}`, `${ind(depth + 1)}RETURN ${foxString(msg)}`, `${ind(depth)}ENDIF`); };
  for (const p of shape.properties) {
    if (!ts.isPropertyAssignment(p)) throw new CompileError('schema: campo inválido (use nome: str()...)', p, sf);
    const field = p.name.getText(sf);
    const ref = refOf(field);
    const { base, rules } = parseRule(p.initializer, sf);
    const slen = `LEN(ALLTRIM(${ref}))`;
    for (const r of rules) {
      // .refine: emite o corpo do arrow com o parâmetro substituído pela ref do campo;
      // falha quando a condição é falsa (o predicado é TRUE p/ válido).
      if (r.name === 'refine') {
        const prev = ctx.subst;
        ctx.subst = Object.assign({}, prev, { [r.param]: ref });
        let cond;
        try { cond = emitExpr(r.body, ctx); } finally { ctx.subst = prev; }
        fail(`NOT (${cond})`, r.msg);
        continue;
      }
      const key = `${base}.${r.name}`;
      const msg = () => msgFor(key, field, r.n);
      switch (key) {
        case 'str.required': fail(`EMPTY(${ref})`, msg()); break;
        case 'str.min': fail(`${slen} < ${r.n}`, msg()); break;
        case 'str.max': fail(`${slen} > ${r.n}`, msg()); break;
        case 'str.len': fail(`${slen} <> ${r.n}`, msg()); break;
        case 'str.email': fail(`NOT ("@" $ ${ref})`, msg()); break;
        case 'num.required': fail(`ISNULL(${ref})`, msg()); break;
        case 'num.min': fail(`${ref} < ${r.n}`, msg()); break;
        case 'num.max': fail(`${ref} > ${r.n}`, msg()); break;
        case 'num.int': fail(`${ref} <> INT(${ref})`, msg()); break;
        default: throw new CompileError(`schema: regra .${r.name}() não suportada para ${base}()`, p, sf);
      }
    }
  }
  return body;
}

// emitValidator: PROCEDURE Validar<Nome>(toObj) — devolve "" se válido ou a 1ª mensagem
// de erro. O acesso ao campo é toObj.<campo> (um objeto Empty/scatter do VFP).
function emitValidator(name, shape, ctx) {
  const body = schemaCheckLines(shape, (f) => `toObj.${f}`, ctx, 1);
  body.push('\tRETURN ""');
  return `PROCEDURE Validar${name}(toObj)\n${body.join('\n')}\nENDPROC`;
}

// ── Frente G: menus VFP (DEFINE MENU/PAD/POPUP/BAR) ───────────────────────────
// asMenu: `export const mainMenu = menu([ pad(...), ... ])` no topo -> { name, pads }.
function asMenu(stmt) {
  if (!ts.isVariableStatement(stmt) || !(stmt.declarationList.flags & ts.NodeFlags.Const)) return null;
  if (stmt.declarationList.declarations.length !== 1) return null;
  const d = stmt.declarationList.declarations[0];
  const e = d.initializer;
  if (!e || !ts.isCallExpression(e) || !ts.isIdentifier(e.expression) || e.expression.text !== 'menu') return null;
  if (!ts.isIdentifier(d.name)) return null;
  const arr = e.arguments[0];
  if (!arr || !ts.isArrayLiteralExpression(arr)) return null;
  return { name: d.name.text, pads: arr.elements };
}

// menuActionCmd: 2º arg de bar(prompt, acao) -> comando FoxPro do ON SELECTION. String
// literal vira o comando verbatim ("CLEAR EVENTS"); identificador (classe de form) vira
// DO FORM <X> (mesma resolução do <OpenFormButton>).
function menuActionCmd(node, ctx) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) return `DO FORM ${node.text}`;
  throw new CompileError('menu: a acao de bar(prompt, acao) deve ser string (comando) ou classe de form (DO FORM)', node, ctx.sf);
}

// emitMenu: árvore menu([pad("titulo",[bar()|separator()])]) -> PROCEDURE <name> que
// monta um menu de barra (DEFINE MENU/PAD/POPUP/BAR) e o ativa (ACTIVATE MENU NOWAIT).
// Cada pad vira um POPUP; cada bar, um BAR com ON SELECTION. Nomes internos _padN/_popN.
function emitMenu(name, padsNodes, ctx) {
  const { sf } = ctx;
  if (!padsNodes.length) throw new CompileError('menu([...]) precisa de ao menos um pad()');
  const head = []; // DEFINE PAD + ON PAD (a barra)
  const pops = []; // DEFINE POPUP + bars (os menus suspensos)
  padsNodes.forEach((padNode, pi) => {
    if (!ts.isCallExpression(padNode) || !ts.isIdentifier(padNode.expression) || padNode.expression.text !== 'pad') {
      throw new CompileError('menu([...]) aceita apenas pad("titulo", [...]) como itens', padNode, sf);
    }
    const prompt = padNode.arguments[0], barsArr = padNode.arguments[1];
    if (!prompt || !ts.isStringLiteral(prompt)) throw new CompileError('pad("titulo", [...]): titulo deve ser string literal', prompt || padNode, sf);
    if (!barsArr || !ts.isArrayLiteralExpression(barsArr)) throw new CompileError('pad("titulo", [...]): 2o argumento deve ser um array de bar()/separator()', barsArr || padNode, sf);
    const padName = `_pad${pi + 1}`, popName = `_pop${pi + 1}`;
    head.push(`${ind(1)}DEFINE PAD ${padName} OF ${name} PROMPT ${foxString(prompt.text)}`);
    head.push(`${ind(1)}ON PAD ${padName} OF ${name} ACTIVATE POPUP ${popName}`);
    pops.push(`${ind(1)}DEFINE POPUP ${popName} MARGIN RELATIVE SHADOW`);
    barsArr.elements.forEach((barNode, bi) => {
      const barNo = bi + 1;
      const isCall = ts.isCallExpression(barNode) && ts.isIdentifier(barNode.expression);
      if (isCall && barNode.expression.text === 'separator') {
        pops.push(`${ind(1)}DEFINE BAR ${barNo} OF ${popName} PROMPT "\\-"`); // linha separadora
        return;
      }
      if (!isCall || barNode.expression.text !== 'bar') throw new CompileError('itens de pad devem ser bar("titulo", acao) ou separator()', barNode, sf);
      const bp = barNode.arguments[0];
      if (!bp || !ts.isStringLiteral(bp)) throw new CompileError('bar("titulo", acao): titulo deve ser string literal', bp || barNode, sf);
      pops.push(`${ind(1)}DEFINE BAR ${barNo} OF ${popName} PROMPT ${foxString(bp.text)}`);
      if (barNode.arguments[1]) pops.push(`${ind(1)}ON SELECTION BAR ${barNo} OF ${popName} ${menuActionCmd(barNode.arguments[1], ctx)}`);
    });
  });
  const body = [`${ind(1)}DEFINE MENU ${name} BAR`, ...head, ...pops, `${ind(1)}ACTIVATE MENU ${name} NOWAIT`];
  return `PROCEDURE ${name}\n${body.join('\n')}\nENDPROC`;
}

// collectMenus: pré-passe barato (parser sintático, sem type-check) que extrai os nomes
// de menus (`export const X = menu([...])`) de um arquivo. Usado pelo `vfp build` para
// wirar `DO X` no app.prg (ativa a barra de menus no bootstrap).
function collectMenus(entry) {
  const src = require('fs').readFileSync(path.resolve(entry), 'utf8');
  const sf = ts.createSourceFile(entry, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
  const names = [];
  for (const stmt of sf.statements) { const m = asMenu(stmt); if (m) names.push(m.name); }
  return names;
}

// findSchemaByName: localiza `const <name> = schema({...})` no arquivo (mesmo source),
// para um form validar a partir do schema referenciado em @Form({ validate: <name> }).
function findSchemaByName(sf, name) {
  for (const stmt of sf.statements) {
    const s = asSchema(stmt);
    if (s && s.name === name) return s;
  }
  return null;
}

// defaultForBase: default FoxPro adequado ao tipo base de um campo de schema.
//   num -> 0 (numerico)   bool -> .F. (logico)   str -> "" (string)
function defaultForBase(base) {
  if (base === 'num') return '0';
  if (base === 'bool') return '.F.';
  return '""';
}

// bindMemberDefault: infere o default do membro de form vinculado por bind="campo".
// Sem isso o default é sempre "" (string) e validar um campo num() antes de qualquer
// input compara "" < n e erra. Tenta, nesta ordem:
//   1. atributo `type` no proprio controle (type="num"|"str"|"bool");
//   2. o tipo declarado do campo no schema referenciado em @Form({ validate: Schema }).
// Devolve a string do default FoxPro ('0' / '.F.' / '""'); fallback '""'.
function bindMemberDefault(field, attrs, ir, ctx) {
  // 1. type explicito no controle
  if (attrs && typeof attrs.type === 'string') {
    const t = attrs.type.toLowerCase();
    if (t === 'num' || t === 'number' || t === 'numeric' || t === 'int') return '0';
    if (t === 'bool' || t === 'boolean' || t === 'logical') return '.F.';
    if (t === 'str' || t === 'string' || t === 'char') return '""';
  }
  // 2. tipo do campo no schema de @Form({ validate: Schema })
  if (ir && ir._validate) {
    const sch = findSchemaByName(ctx.sf, ir._validate);
    if (sch) {
      for (const p of sch.shape.properties) {
        if (ts.isPropertyAssignment(p) && p.name.getText(ctx.sf) === field) {
          try { return defaultForBase(parseRule(p.initializer, ctx.sf).base); } catch (_) { /* shape estranho: cai no default */ }
        }
      }
    }
  }
  return '""';
}

// applyFormValidate: @Form({ validate: Schema }) -> método Validar() do form. As mesmas
// checagens do schema, mas lendo ThisForm.<campo> (o membro vinculado por bind="campo").
// Devolve "" (válido) ou a 1ª mensagem de erro — autocontido (sem PROCEDURE externa).
// Uso no form: IF NOT EMPTY(ThisForm.Validar()) ... MESSAGEBOX(ThisForm.Validar()).
function applyFormValidate(ir, ctx) {
  if (!ir._validate) return;
  const sch = findSchemaByName(ctx.sf, ir._validate);
  if (!sch) throw new Error(`[foxts] @Form({ validate: ${ir._validate} }): schema "${ir._validate}" nao encontrado no arquivo (defina: const ${ir._validate} = schema({...}))`);
  if (ir.methods.Validar) throw new Error('[foxts] @Form({ validate }): o form ja define um metodo Validar(); remova um dos dois');
  const body = schemaCheckLines(sch.shape, (f) => `ThisForm.${f}`, ctx, 1);
  body.push(`${ind(1)}RETURN ""`);
  ir.methods.Validar = body.join('\n');
  delete ir._validate;
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

// hasDeco: a classe/membro tem um decorator @Nome (call)? Devolve a CallExpression.
function hasDeco(node, name) {
  const decos = ts.canHaveDecorators && ts.canHaveDecorators(node) ? (ts.getDecorators(node) || []) : [];
  for (const d of decos) {
    const e = d.expression;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === name) return e;
  }
  return null;
}

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
// loadProgram: cria o Program, valida tipagem e devolve { sf, checker }.
function loadProgram(entry) {
  const abs = path.resolve(entry);
  // globals.d.ts (ambientes que viram comandos VFP, ex.: console) entra como root
  // file mas nunca e emitido — compile() so percorre o arquivo de entrada.
  const globals = path.join(__dirname, 'globals.d.ts');
  const roots = require('fs').existsSync(globals) ? [globals, abs] : [abs];
  // NOTA: o tsconfig.json da raiz ESPELHA estas opções (só para o editor/tsc);
  // qualquer mudança aqui deve ser replicada lá (ler o tsconfig = melhoria futura).
  const program = ts.createProgram(roots, {
    strict: true,
    noEmit: true,
    experimentalDecorators: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10 || ts.ModuleResolutionKind.NodeJs,
    lib: ['lib.es2020.d.ts'],
    jsx: ts.JsxEmit.Preserve, // forms .tsx: render() devolve JSX lido estruturalmente
    // "@vfp/core" (decorators, FormManager) resolve para a lib empacotada — assim
    // um projeto scaffolded usa o import publico sem precisar instalar nada.
    baseUrl: __dirname,
    paths: { '@vfp/core': ['decorators'] },
  });
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
  const ctx = { checker, sf, cursors: {}, routes };
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

const JSX_BASECLASS = {
  Label: 'label', TextBox: 'textbox', EditBox: 'editbox', Button: 'commandbutton',
  CommandButton: 'commandbutton', CheckBox: 'checkbox', ComboBox: 'combobox',
  Grid: 'grid', Timer: 'timer', Image: 'image', Shape: 'shape', OptionGroup: 'optiongroup',
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
const THEME = {
  primary: '#2563eb', success: '#16a34a', danger: '#dc2626', warning: '#f59e0b',
  white: '#ffffff', black: '#000000', gray: '#6b7280', blue: '#2563eb', red: '#dc2626', green: '#16a34a',
  // tokens semânticos do UI Kit (consumidos por <Card>/<FormField> e por variant/class).
  // Trocar estes (via vfp.theme.json) re-estiliza o app inteiro no próximo build.
  surface: '#ffffff',   // fundo de card/painel
  onSurface: '#0f172a', // texto sobre surface (títulos)
  border: '#e2e8f0',    // borda neutra de card/input
  altRow: '#f1f5f9',    // linha alternada da grade (zebra)
  muted: '#64748b',     // texto secundário (labels de campo)
  onPrimary: '#ffffff', // texto sobre primary
  bg: '#f8fafc',        // fundo do form
};
// fonte default do app (token de tipografia). null = não força (mantém o do VFP).
// Definida por vfp.theme.json: { "font": "Segoe UI" } — o maior ganho visual barato.
THEME.font = null;

// setTheme: mescla cores de um vfp.theme.json do projeto (aceita { primary: "#.." }
// ou { colors: { primary: "#.." } }). Chamado por vfp/foxc antes de transpilar.
// Aceita também { font, mode, light:{...}, dark:{...} }: mescla a base (chaves de
// cor no topo / em `colors`), depois o set do modo ativo (`mode`, default "light").
// Assim um único vfp.theme.json carrega claro E escuro; trocar `mode` re-tematiza.
function setTheme(obj) {
  if (!obj || typeof obj !== 'object') return;
  const merge = (src) => {
    const colors = src && src.colors ? src.colors : src;
    if (colors && typeof colors === 'object') {
      for (const k of Object.keys(colors)) {
        if (k === 'colors' || k === 'light' || k === 'dark' || k === 'mode' || k === 'font') continue;
        if (typeof colors[k] === 'string') THEME[k] = colors[k];
      }
    }
  };
  if (typeof obj.font === 'string') THEME.font = obj.font;
  // tipografia em 3 papéis (como o FLAT: título/conteúdo/dados). font = fallback.
  for (const k of ['fontTitle', 'fontBody', 'fontData']) if (typeof obj[k] === 'string') THEME[k] = obj[k];
  if (typeof obj.win11 === 'boolean') THEME.win11 = obj.win11; // chrome DWM (opt-in)
  if (typeof obj.flat === 'boolean') THEME.flat = obj.flat;   // modo flat (chrome custom)
  merge(obj); // base (cores no topo / em colors)
  const mode = obj.mode === 'dark' ? 'dark' : (obj.mode === 'light' ? 'light' : null);
  THEME._mode = mode || THEME._mode || 'light';
  if (mode && obj[mode]) merge(obj[mode]); // sobrepõe com o set do modo ativo
}

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
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// devolve o NÚMERO de cor do VFP (0x00BBGGRR). Crucial: no memo do SCX a expressão
// "RGB(r,g,b)" NÃO é avaliada pelo DO FORM (vira lixo) — tem que ser número literal.
// O número também é válido em código runtime (This.BackColor = 16579320).
function hexToRGB(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return ((n >> 16) & 255) + ((n >> 8) & 255) * 256 + (n & 255) * 65536;
}
function themeColor(name) {
  if (THEME[name]) return hexToRGB(THEME[name]);
  if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(name)) return hexToRGB(name[0] === '#' ? name : '#' + name);
  return null;
}
// shade: deriva um tom mais claro (amt>0) ou escuro (amt<0) de uma cor base — como
// o ALTERARGB do "FLAT". Aceita token ou hex; devolve "RGB(r, g, b)". Usado p/ gerar
// estados (hover/zebra/borda) de UMA cor, em vez de hardcodar cada tom.
function shade(nameOrHex, amt) {
  const hex = THEME[nameOrHex] || nameOrHex;
  const h = String(hex).replace('#', '');
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(h)) return null;
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const clamp = (v) => Math.max(0, Math.min(255, v + amt));
  return clamp((n >> 16) & 255) + clamp((n >> 8) & 255) * 256 + clamp(n & 255) * 65536; // número VFP
}

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
      if (ts.isNumericLiteral(e)) out[k] = Number(e.text);
      else if (ts.isStringLiteral(e)) out[k] = e.text;
      else if (ts.isIdentifier(e)) out[k] = { ident: e.text };
      else if (e.kind === ts.SyntaxKind.TrueKeyword) out[k] = true;
      else if (e.kind === ts.SyntaxKind.FalseKeyword) out[k] = false;
      else if (ts.isPropertyAccessExpression(e) && e.expression.kind === ts.SyntaxKind.ThisKeyword && e.name.text in scope) {
        out[k] = scope[e.name.text]; // prop do @Component -> valor do uso
      } else out[k] = { expr: emitExpr(e, ctx) };
    }
  }
  return out;
}

// resolveComponentClass: tag JSX (<SaveButton/>) -> a ClassDeclaration @Component
// que ela referencia (segue alias de import via checker). null se não for componente.
function resolveComponentClass(node, ctx) {
  const el = ts.isJsxElement(node) ? node.openingElement : node;
  let sym = ctx.checker.getSymbolAtLocation(el.tagName);
  if (sym && sym.flags & ts.SymbolFlags.Alias) sym = ctx.checker.getAliasedSymbol(sym);
  const decls = (sym && sym.declarations) || [];
  return decls.find((d) => ts.isClassDeclaration(d) && hasDeco(d, 'Component')) || null;
}

const jsxKids = (node) => (ts.isJsxElement(node) ? Array.from(node.children) : []).filter(
  (c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c)
);
const jsxTag = (node) => (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText();

// parseJsx: nó JSX -> modelo de layout/controle. `scope` carrega as props quando
// estamos dentro do render() expandido de um @Component.
function parseJsx(node, ctx, scope = {}) {
  if (ts.isParenthesizedExpression(node)) return parseJsx(node.expression, ctx, scope);
  if (ts.isJsxFragment(node)) return { kind: 'box', dir: 'column', gap: 10, pad: 10, children: jsxKids(node).map((c) => parseJsx(c, ctx, scope)) };
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tag = jsxTag(node);
    const attrs = readJsxAttrs(node, ctx, scope);
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
      const title = typeof attrs.title === 'string' ? attrs.title : undefined;
      const kids = jsxKids(node).map((c) => parseJsx(c, ctx, scope));
      const titleModel = title ? { kind: 'control', baseclass: 'label', node, attrs: {
        caption: title, bold: true, textColor: 'onSurface', fontSize: 13, width: Math.max(120, title.length * 8),
        fontName: THEME.fontTitle || THEME.fontBody || THEME.font, transparent: true, // papel "título", fundo transparente
      } } : null;
      // divisória fina sob o título (separa header do conteúdo — padrão Win11 Settings)
      const dividerModel = title ? { kind: 'control', baseclass: 'shape', node, attrs: {
        color: 'border', height: 1, alignSelf: 'stretch',
      } } : null;
      const head = titleModel ? [titleModel, dividerModel] : [];
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
        children: [...head, ...kids],
      };
    }
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
    if (JSX_BASECLASS[tag]) return { kind: 'control', baseclass: JSX_BASECLASS[tag], attrs, node };
    // @Component do usuário: expande o render() dele inline, com as props do uso
    const comp = resolveComponentClass(node, ctx);
    if (comp) {
      const renderM = comp.members.find((m) => ts.isMethodDeclaration(m) && m.name.getText(ctx.sf) === 'render');
      if (!renderM) throw new CompileError(`@Component <${tag}/> precisa de um render()`, node, ctx.sf);
      return parseJsx(findRenderReturn(renderM, ctx), ctx, attrs); // attrs do uso viram o escopo de props
    }
    return { kind: 'component', tag, attrs, node }; // built-in (OpenFormButton/SaveButton)
  }
  throw new CompileError('JSX nao suportado: ' + ts.SyntaxKind[node.kind], node, ctx.sf);
}

// applyStyle: variant/color/textColor/disabled/bold + utilitários `class` -> props
// nativas do VFP. Devolve { width, height } se a class definir w-/h- (override).
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

function ctrlName(attrs, baseclass, st) {
  if (typeof attrs.name === 'string') return attrs.name;
  if (typeof attrs.bind === 'string') return (NAME_PREFIX[baseclass] || 'ctl') + cap1(attrs.bind);
  st.counts[baseclass] = (st.counts[baseclass] || 0) + 1;
  return (NAME_PREFIX[baseclass] || 'ctl') + st.counts[baseclass];
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
      const lbl = { type: 'label', name: name + 't', parent: name, caption: label,
        left: tx, top: Math.round((H - 16) / 2), width: W - tx - 6, height: 16,
        properties: { BackStyle: 0, Alignment: 0, ForeColor: fg,
          FontName: foxString(THEME.fontBody || THEME.font || 'Segoe UI'), FontSize: 10 },
        methods: Object.assign({ MouseEnter: enter }, click ? { Click: click } : {}) };
      if (active) lbl.properties.FontBold = '.T.';
      st.ir.controls.push(lbl);
      if (icon) st.ir.controls.push({ type: 'image', name: name + 'i', parent: name,
        left: 8, top: Math.round((H - 16) / 2), width: 16, height: 16,
        properties: { Picture: foxString(iconPath(icon)), BackStyle: 0 } });
    } };
}

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
  let bg, fg, hover, border = null;
  if (variant === 'ghost') {
    bg = null; fg = hexToRGB(THEME.primary); border = hexToRGB(THEME.border); hover = shade('surface', dark ? 18 : -8);
  } else if (variant === 'secondary') {
    bg = shade('surface', dark ? 22 : -10); fg = hexToRGB(THEME.onSurface); border = hexToRGB(THEME.border); hover = shade('surface', dark ? 34 : -20);
  } else if (variant === 'danger') {
    bg = hexToRGB(THEME.danger); fg = hexToRGB(THEME.onPrimary); hover = shade('danger', 18);
  } else {
    const base = THEME[variant] || THEME.primary; bg = hexToRGB(base); fg = hexToRGB(THEME.onPrimary); hover = shade(base, 18);
  }
  const outline = border != null;
  const icon = typeof a.icon === 'string' ? iconPath(a.icon) : null;
  const click = typeof a.onClick === 'string' ? `ThisForm.${a.onClick}()` : '';
  const w = typeof a.width === 'number' ? a.width : Math.max(86, caption.length * 7 + (icon ? 34 : 18));
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
    const shape = { type: 'shape', name: shp, left: x, top: y, width: W, height: H,
      properties: { BackStyle: bg ? 1 : 0, FillStyle: bg ? 0 : 1, Curvature: 8, BorderWidth: outline ? 1 : (bg ? 0 : 1) } };
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
    const lbl = { type: 'label', name: name + 't', parent: name, caption,
      left: tx, top: Math.round((H - 16) / 2), width: tw, height: 16,
      properties: { BackStyle: 0, Alignment: 2, ForeColor: fg, FontName: foxString(THEME.fontBody || THEME.font || 'Segoe UI'), FontSize: 9 },
      methods: Object.assign({ MouseEnter: restEnter }, click ? { Click: click } : {}) };
    st.ir.controls.push(lbl);
    if (icon) st.ir.controls.push({ type: 'image', name: name + 'i', parent: name,
      left: 8, top: Math.round((H - 16) / 2), width: 16, height: 16,
      properties: { Picture: foxString(icon), BackStyle: 0, Stretch: 1 } });
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

function transpileForm(entry, opts = {}) {
  const { sf, checker } = loadProgram(entry);
  const cls = sf.statements.filter(ts.isClassDeclaration).find(isFormClass);
  if (!cls) return null;
  const ctx = { checker, sf, cursors: {}, routes: opts.routes };
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
      const v = c.methods[k];
      if (typeof v === 'string' && /^[A-Za-z_]\w*$/.test(v.trim())) c.methods[k] = `ThisForm.${v.trim()}()`;
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
