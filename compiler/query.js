'use strict';
// query.js — Frente D: query builder local -> VFP SQL (SELECT ... INTO CURSOR/ARRAY).
// Extraido do transpile.js. Acoplamento com o nucleo: usa `ctx.emitExpr` (injetado no
// ctx pelo transpile.js) p/ avaliar o valor de .where(campo, valor) — sem isso seria
// dependencia circular. So mais util (CompileError/ind) + a AST do TS.
const ts = require('typescript');
const { CompileError, ind } = require('./util');

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
      case 'where': {
        if (c.args.length >= 2) {
          const col = strLit(c.args[0]);
          // FOOTGUN: where("cracha", cracha) onde o valor e um identificador com o MESMO
          // nome da coluna -> WHERE cracha = cracha (campo=campo, sempre verdadeiro).
          // Rejeita com sugestao de renomear (descoberto portando a catraca real).
          if (ts.isIdentifier(c.args[1]) && c.args[1].text === col) {
            throw new CompileError(`query: where("${col}", ${col}) — o valor tem o MESMO nome da coluna; vira WHERE ${col} = ${col} (sempre verdadeiro). Renomeie a variavel/parametro (ex.: ${col}Id)`, c.args[1], sf);
          }
          q.where.push(`${col} = ${ctx.emitExpr(c.args[1], ctx)}`);
        } else {
          q.where.push(strLit(c.args[0]));
        }
        break;
      }
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

module.exports = { queryTerminal, asQuery, asCountQuery, asFirstObjQuery, parseQueryChain, buildSelect, emitQuery, emitCountQuery, emitFirstObjQuery };
