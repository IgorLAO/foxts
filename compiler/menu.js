'use strict';
// menu.js — Frente G: menus VFP (DEFINE MENU/PAD/POPUP/BAR). Extraido do transpile.js.
// Totalmente auto-contido: so depende de util (CompileError/ind/foxString) + a AST do TS.
const ts = require('typescript');
const path = require('path');
const fs = require('fs');
const { CompileError, ind, foxString } = require('./util');

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
  const src = fs.readFileSync(path.resolve(entry), 'utf8');
  const sf = ts.createSourceFile(entry, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
  const names = [];
  for (const stmt of sf.statements) { const m = asMenu(stmt); if (m) names.push(m.name); }
  return names;
}

module.exports = { asMenu, emitMenu, collectMenus };
