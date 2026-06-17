'use strict';
// util.js — utilitarios genericos do compilador (sem dependencia do nucleo). Extraido
// do transpile.js (modularizacao do monolito). Folhas puras: erro de compilacao,
// indentacao, predicados de tipo TS, literal de string FoxPro, caminho `this.*`.
const ts = require('typescript');

// CompileError — erro de "no de AST nao suportado" com linha/coluna (invariante
// "rejeitar, nunca palpitar"). node+sf opcionais (sem eles, sem localizacao).
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

// typeKind: classifica o tipo TS de um no em 'string'|'number'|'boolean'|'date'|'unknown'
// (o FoxPro de "a + b" depende disso: soma vs concat vs data).
function typeKind(node, checker) {
  const t = checker.getTypeAtLocation(node);
  if (t.flags & ts.TypeFlags.StringLike) return 'string';
  if (t.flags & ts.TypeFlags.NumberLike) return 'number';
  if (t.flags & ts.TypeFlags.BooleanLike) return 'boolean';
  if (checker.typeToString(t) === 'Date') return 'date';
  return 'unknown';
}

// isArrayType: o no tem tipo de array TS (number[], string[], Array<T>)? Esses
// viram um objeto Collection do VFP (ver lowering de push/length/indexacao).
function isArrayType(node, checker) {
  const t = checker.getTypeAtLocation(node);
  if (typeof checker.isArrayType === 'function') return checker.isArrayType(t);
  return /\[\]$/.test(checker.typeToString(t)); // fallback: "number[]"
}

// foxString: string literal FoxPro. FoxPro nao escapa aspas dentro de aspas; se
// houver aspas duplas, usa o delimitador [ ].
function foxString(s) {
  return s.includes('"') ? `[${s}]` : `"${s}"`;
}

// dottedThisPath: se `node` for um acesso encadeado com raiz em `this`
// (this.txtIni.value), devolve "This.txtIni.value"; senao null.
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

// hasDeco: a classe/membro tem um decorator @Nome (call)? Devolve a CallExpression (ou null).
function hasDeco(node, name) {
  const decos = ts.canHaveDecorators && ts.canHaveDecorators(node) ? (ts.getDecorators(node) || []) : [];
  for (const d of decos) {
    const e = d.expression;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === name) return e;
  }
  return null;
}

// cap1: primeira letra maiuscula (p/ nomes de controle/membro derivados de bind/campo).
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// readPropsBag: { Key: valor } literal -> { Key: <RHS para PROPERTIES> }. String vira
// verbatim (".T.", "{}", "RGB(...)"); número/booleano convertidos. Compartilhado pelo
// caminho decorator (transpile.js) e pelo JSX (props={{...}}).
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

module.exports = { CompileError, IND, ind, typeKind, isArrayType, foxString, dottedThisPath, hasDeco, cap1, readPropsBag };
