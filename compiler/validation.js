'use strict';
// validation.js — Frente F: validacao estilo Zod -> validador VFP (PROCEDURE Validar<Nome>
// e metodo ThisForm.Validar()). Extraido do transpile.js. Estado proprio: MESSAGES (i18n),
// mutado por setMessages (mesma referencia). Acoplamento com o nucleo: usa ctx.emitExpr
// (regra .refine) — injetado no ctx pelo transpile.js p/ evitar ciclo. + util.
const ts = require('typescript');
const { CompileError, ind, foxString } = require('./util');

// asSchema: `export const Cliente = schema({...})` no topo -> { name, shape }.
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
        try { cond = ctx.emitExpr(r.body, ctx); } finally { ctx.subst = prev; }
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

module.exports = { asSchema, emitValidator, setMessages, bindMemberDefault, applyFormValidate };
