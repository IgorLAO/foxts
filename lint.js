#!/usr/bin/env node
'use strict';
// lint.js — linter preventivo para o foxts (TypeScript -> Visual FoxPro 9).
//
// Detecta construtos TypeScript que o transpilador foxts NAO sabe compilar para
// VFP9 e reporta com arquivo:linha:coluna ANTES do build, entregando um erro
// claro ao inves de uma falha confusa dentro do pipeline.
//
// Nota: o transpilador (transpile.js) ainda rejeita nos desconhecidos da AST em
// tempo de build ("rejeitar, nunca palpitar"). Este linter e apenas uma camada
// anterior de DX — mais rapida, sem precisar do VFP instalado, e com mensagens
// orientadas ao desenvolvedor.
//
// Uso: node lint.js [caminho ...]
//   Cada caminho pode ser arquivo .ts/.tsx ou diretorio (recursivo).
//   Sem argumentos: varre 'src' e 'examples' se existirem.
//
// Saida: uma linha por problema + resumo final.
// Codigo de saida: 0 = limpo, 1 = ha problemas.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// ---- construtos nao suportados ----------------------------------------------

// Identificadores globais que nao existem no runtime VFP9 e nao tem mapeamento
// no foxts. Flagramos qualquer referencia ao nome — como new Promise(), Symbol(),
// WeakMap etc.
const BANNED_IDENTIFIERS = new Set([
  'Promise', 'Symbol', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect',
]);

// ---- walker da AST ----------------------------------------------------------

/**
 * Percorre a AST sintatica de um SourceFile e retorna uma lista de achados:
 *   { line, col, code, message }
 * line e col sao 1-based.
 */
function walkFile(sf) {
  const findings = [];

  function report(node, code, message) {
    const pos = node.getStart(sf);
    const { line, character } = sf.getLineAndCharacterOfPosition(pos);
    findings.push({ line: line + 1, col: character + 1, code, message });
  }

  function hasModifier(node, kind) {
    const mods = node.modifiers;
    return mods != null && mods.some((m) => m.kind === kind);
  }

  function visit(node) {
    switch (node.kind) {

      // async function f() {}  /  async function* gen() {}
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.FunctionExpression:
        if (hasModifier(node, ts.SyntaxKind.AsyncKeyword)) {
          report(node, 'async-function',
            'funcao async nao e suportada (alvo VFP9 nao tem Promise)');
        }
        // function* gen() {} — gerador
        if (node.asteriskToken) {
          report(node, 'generator-function',
            'funcao geradora (function*) nao e suportada no alvo VFP9');
        }
        break;

      // metodo async ou gerador dentro de classe
      case ts.SyntaxKind.MethodDeclaration:
        if (hasModifier(node, ts.SyntaxKind.AsyncKeyword)) {
          report(node, 'async-method',
            'metodo async nao e suportado (alvo VFP9 nao tem Promise)');
        }
        if (node.asteriskToken) {
          report(node, 'generator-method',
            'metodo gerador (function*) nao e suportado no alvo VFP9');
        }
        break;

      // arrow function: const f = async () => {}
      case ts.SyntaxKind.ArrowFunction:
        if (hasModifier(node, ts.SyntaxKind.AsyncKeyword)) {
          report(node, 'async-arrow',
            'arrow function async nao e suportada (alvo VFP9 nao tem Promise)');
        }
        break;

      // await <expr>
      case ts.SyntaxKind.AwaitExpression:
        report(node, 'await',
          'await nao e suportado (alvo VFP9 nao tem Promise)');
        break;

      // yield <expr>
      case ts.SyntaxKind.YieldExpression:
        report(node, 'yield',
          'yield nao e suportado (alvo VFP9 nao tem geradores)');
        break;

      // for await (const x of xs) {}
      case ts.SyntaxKind.ForOfStatement:
        if (node.awaitModifier) {
          report(node, 'for-await',
            'for await...of nao e suportado (alvo VFP9 nao tem Promise)');
        }
        break;

      // referencias a identificadores banidos: Promise, Symbol, WeakMap etc.
      case ts.SyntaxKind.Identifier:
        if (BANNED_IDENTIFIERS.has(node.text)) {
          // evita duplo-reporte quando o identificador esta dentro de um no
          // que ja foi reportado (ex.: "async function f()" ja cobre o caso
          // das async; aqui cobrimos uso standalone de Promise/Symbol/etc.)
          report(node, `global-${node.text.toLowerCase()}`,
            `'${node.text}' nao e suportado no alvo VFP9`);
        }
        break;

      default:
        break;
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sf, visit);
  return findings;
}

// ---- coleta de arquivos -----------------------------------------------------

/** Retorna true para arquivos .ts/.tsx que devem ser verificados. */
function isTsFile(filePath) {
  const base = path.basename(filePath);
  return (base.endsWith('.ts') || base.endsWith('.tsx')) && !base.endsWith('.d.ts');
}

/**
 * Coleta recursivamente todos os arquivos .ts/.tsx dentro de um diretorio,
 * ignorando node_modules.
 */
function collectFiles(inputPath, result) {
  let stat;
  try {
    stat = fs.statSync(inputPath);
  } catch (_e) {
    return; // caminho inexistente — ignorado silenciosamente
  }

  if (stat.isDirectory()) {
    const base = path.basename(inputPath);
    if (base === 'node_modules') return;
    const entries = fs.readdirSync(inputPath);
    for (const entry of entries) {
      collectFiles(path.join(inputPath, entry), result);
    }
  } else if (stat.isFile() && isTsFile(inputPath)) {
    result.push(inputPath);
  }
}

// ---- ponto de entrada -------------------------------------------------------

function main(argv) {
  const args = argv.slice(2);

  // caminhos de entrada: argumentos da CLI ou defaults
  let inputPaths = args.length > 0 ? args : ['src', 'examples'];

  // resolve relativos ao cwd
  inputPaths = inputPaths.map((p) => path.resolve(process.cwd(), p));

  // filtra caminhos que nao existem (sem erro, para os defaults opcionais)
  inputPaths = inputPaths.filter((p) => fs.existsSync(p));

  // coleta arquivos
  const files = [];
  for (const ip of inputPaths) {
    collectFiles(ip, files);
  }

  if (files.length === 0) {
    console.log('nenhum arquivo .ts/.tsx encontrado para verificar.');
    process.exit(0);
  }

  // raiz para exibir caminhos relativos bonitos
  const cwd = process.cwd();

  let totalFindings = 0;
  const filesWithFindings = new Set();

  for (const filePath of files) {
    const rel = path.relative(cwd, filePath).replace(/\\/g, '/');
    const source = fs.readFileSync(filePath, 'utf8');
    const sf = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const findings = walkFile(sf);
    for (const f of findings) {
      console.log(`${rel}:${f.line}:${f.col}  ${f.code}  ${f.message}`);
      filesWithFindings.add(rel);
      totalFindings++;
    }
  }

  // resumo
  if (totalFindings === 0) {
    console.log('nenhum problema encontrado');
    process.exit(0);
  } else {
    console.log(`\n${totalFindings} problema(s) em ${filesWithFindings.size} arquivo(s)`);
    process.exit(1);
  }
}

main(process.argv);
