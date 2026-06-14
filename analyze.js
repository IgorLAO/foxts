#!/usr/bin/env node
'use strict';
// analyze.js — analisador estatico de projetos VFP legados.
//   foxts analyze [dir] [--json]
// Varre uma arvore de pastas, conta artefatos (PRG/SCX/VCX/TS/TSX, classes,
// funcoes) e roda heuristicas line-based sobre o fonte FoxPro para apontar
// problemas comuns de portabilidade/manutencao. Tudo aproximado e best-effort:
// e um diagnostico para empresas legadas, nao um compilador.

const fs = require('fs');
const path = require('path');

// extensoes tratadas como fonte FoxPro (texto)
const FOX_SOURCE_EXT = new Set(['.prg', '.spr', '.mpr']);
// tabelas binarias do VFP — apenas contadas por arquivo
const SCX_EXT = '.scx';
const VCX_EXT = '.vcx';
// pastas ignoradas na varredura
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

// ── Util: varredura recursiva ────────────────────────────────────────────────

/** Coleta recursivamente todos os arquivos (caminho absoluto), pulando SKIP_DIRS. */
function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return out; // pasta inacessivel — ignora
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      out.push(...walk(full));
    } else if (ent.isFile()) {
      out.push(full);
    }
  }
  return out;
}

// ── Util: limpeza de comentarios e strings por linha ─────────────────────────

/**
 * Remove de uma linha FoxPro: comentarios (* no inicio, && no meio) e o
 * conteudo de literais de string ("...", '...', [...]). Devolve a linha "limpa"
 * onde so sobra codigo executavel — usada pelas heuristicas pra evitar casar
 * dentro de comentario ou texto. Mantem o comprimento aproximado nao e exigido.
 */
function stripCommentsAndStrings(line) {
  // comentario de linha inteira: primeiro caractere nao-branco e '*'
  if (/^\s*\*/.test(line)) return '';
  let out = '';
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    // comentario inline &&
    if (ch === '&' && line[i + 1] === '&') break;
    // literais de string: ", ', [ ]
    if (ch === '"' || ch === "'") {
      const close = line.indexOf(ch, i + 1);
      if (close === -1) { i = n; break; }
      out += ' '; // placeholder neutro
      i = close + 1;
      continue;
    }
    if (ch === '[') {
      const close = line.indexOf(']', i + 1);
      if (close === -1) { i = n; break; }
      out += ' ';
      i = close + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// ── Heuristicas FoxPro ───────────────────────────────────────────────────────

// SELECT * de SQL (e nao o SELECT <workarea>). Casa "SELECT *" e "SELECT TOP n *"
// e "SELECT DISTINCT *", mas nao "SELECT minhatabela" nem "SELECT 0".
const RE_SELECT_STAR = /\bSELECT\b(\s+(TOP\s+\d+|ALL|DISTINCT))?\s+\*(\s*,|\s+FROM\b|\s*$)/i;

// SCAN no inicio do statement (eventualmente com SCAN REST/NEXT n).
const RE_SCAN = /^\s*SCAN\b/i;
// presenca de clausula FOR no mesmo statement do SCAN.
const RE_SCAN_FOR = /\bFOR\b/i;

// inicio de rotina e seus parametros.
const RE_ROUTINE = /^\s*(PROCEDURE|FUNCTION)\b\s+([A-Za-z_]\w*)/i;
const RE_ROUTINE_END = /^\s*(ENDPROC|ENDFUNC)\b/i;
const RE_DEFINE_CLASS = /^\s*DEFINE\s+CLASS\b/i;
const RE_END_DEFINE = /^\s*ENDDEFINE\b/i;

// declaracoes que introduzem nomes no escopo da rotina.
const RE_DECL = /^\s*(LOCAL|LPARAMETERS|PARAMETERS|PRIVATE|PUBLIC|DIMENSION|DECLARE)\b\s+(.*)$/i;

// atribuicao a um identificador simples (bare ident = ...). Exclui ==, <=, >=,
// !=, += etc. e exclui acesso a membro (obj.prop) / array (a[1]).
const RE_ASSIGN = /^\s*([A-Za-z_]\w*)\s*=(?!=)/;

// palavras-chave de comando que tambem podem aparecer como "ident =" em construcoes
// que NAO sao atribuicao de variavel (ex.: STORE ... TO, FOR i = ...). Tratadas a parte.
const RE_FOR_LOOP = /^\s*FOR\b/i;

// IF/ELSEIF com possivel atribuicao no lugar de comparacao.
const RE_IF = /^\s*(IF|ELSEIF)\b(.*)$/i;

/**
 * Extrai os nomes declarados de uma linha de declaracao (apos LOCAL/PUBLIC/...).
 * Lida com listas separadas por virgula, "AS Tipo", "ARRAY", e DIMENSION a(10).
 */
function parseDeclaredNames(rest) {
  const names = [];
  // remove "ARRAY" keyword solta (LOCAL ARRAY a[10])
  let body = rest.replace(/\bARRAY\b/gi, ' ');
  for (let part of body.split(',')) {
    part = part.trim();
    if (!part) continue;
    // pega o identificador inicial (antes de espaco, '(', '[', ou 'AS')
    const m = part.match(/^([A-Za-z_]\w*)/);
    if (m) names.push(m[1].toLowerCase());
  }
  return names;
}

/**
 * Analisa o fonte FoxPro de um arquivo e devolve os achados.
 * Heuristicas line-based, case-insensitive, ignorando comentarios e strings.
 */
function analyzeFoxSource(file, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  // estado de rotina para undeclared-var
  let inRoutine = false;
  let declared = new Set();

  let classes = 0;
  let functions = 0;

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const lineNo = idx + 1;
    const code = stripCommentsAndStrings(raw);
    if (!code.trim()) {
      // ainda assim contamos DEFINE CLASS/PROC mesmo se vierem em linha so de codigo;
      // linhas vazias/comentadas nao tem comando
      continue;
    }

    // contagens estruturais
    if (RE_DEFINE_CLASS.test(code)) classes++;
    if (RE_ROUTINE.test(code)) functions++;

    // controle de escopo de rotina
    const mRoutine = code.match(RE_ROUTINE);
    if (mRoutine) {
      inRoutine = true;
      declared = new Set();
      continue; // a propria linha PROCEDURE nao e atribuicao
    }
    if (RE_ROUTINE_END.test(code) || RE_DEFINE_CLASS.test(code) || RE_END_DEFINE.test(code)) {
      inRoutine = false;
      declared = new Set();
    }

    // declaracoes introduzem nomes no escopo
    const mDecl = code.match(RE_DECL);
    if (mDecl) {
      for (const nm of parseDeclaredNames(mDecl[2])) declared.add(nm);
      continue; // linha de declaracao nao e atribuicao a flaggar
    }

    // regra: SELECT *
    if (RE_SELECT_STAR.test(code)) {
      findings.push({
        file, line: lineNo, rule: 'select-star',
        message: 'SELECT * encontrado (portabilidade/performance: liste as colunas)',
      });
    }

    // regra: SCAN sem FOR
    if (RE_SCAN.test(code) && !RE_SCAN_FOR.test(code)) {
      findings.push({
        file, line: lineNo, rule: 'scan-no-index',
        message: 'SCAN sem clausula FOR (varredura de tabela inteira)',
      });
    }

    // regra: atribuicao no IF (=, nao ==)
    const mIf = code.match(RE_IF);
    if (mIf) {
      const cond = mIf[2];
      // conservador: so dispara quando ha exatamente um '=' simples, sem nenhum
      // '==' e sem operadores compostos (<=, >=, !=, <>). Evita falsos positivos.
      const hasDouble = /==/.test(cond);
      const hasCompound = /[<>!]=|<>/.test(cond);
      const singleEqs = (cond.match(/(?<![=<>!])=(?!=)/g) || []).length;
      if (!hasDouble && !hasCompound && singleEqs === 1) {
        findings.push({
          file, line: lineNo, rule: 'assign-in-condition',
          message: 'IF com = simples (parece atribuicao; use == para comparar)',
        });
      }
    }

    // regra: undeclared-var (so dentro de rotina)
    if (inRoutine && !RE_FOR_LOOP.test(code)) {
      const mAssign = code.match(RE_ASSIGN);
      if (mAssign) {
        // descarta acesso a membro/array: o ident casado ja e "bare" pelo regex,
        // mas confirmamos que nao ha '.' nem '[' antes do '=' grudado ao nome.
        const name = mAssign[1].toLowerCase();
        // ignora 'this'/'thisform' e nomes de campo obvios sao impossiveis de saber;
        // checamos apenas o conjunto declarado.
        if (!declared.has(name) && name !== 'this' && name !== 'thisform') {
          findings.push({
            file, line: lineNo, rule: 'undeclared-var',
            message: `atribuicao a '${mAssign[1]}' sem LOCAL/LPARAMETERS/PRIVATE/PUBLIC/DIMENSION (heuristica)`,
          });
          // depois de avisar uma vez, considera a var "vista" pra nao repetir em massa
          declared.add(name);
        }
      }
    }
  }

  return { findings, classes, functions };
}

// ── Contagens TS/TSX ─────────────────────────────────────────────────────────

function analyzeTsSource(text) {
  // contagem aproximada de classes e funcoes em TS/TSX
  const classes = (text.match(/\bclass\s+[A-Za-z_]/g) || []).length;
  // function declaradas + metodos-ish (nome( ... ) { ) + arrow atribuidas
  const fnDecl = (text.match(/\bfunction\b/g) || []).length;
  const arrow = (text.match(/=>/g) || []).length;
  return { classes, functions: fnDecl + arrow };
}

// ── API principal ────────────────────────────────────────────────────────────

/**
 * analyze(dir, opts) -> relatorio estruturado.
 * { counts:{prg,scx,vcx,tsx,ts,classes,functions}, findings:[...], totals:{...} }
 */
function analyze(dir, opts) {
  opts = opts || {};
  const root = path.resolve(dir || '.');
  const counts = { prg: 0, scx: 0, vcx: 0, tsx: 0, ts: 0, classes: 0, functions: 0 };
  const findings = [];

  const files = walk(root);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();

    if (FOX_SOURCE_EXT.has(ext)) {
      if (ext === '.prg') counts.prg++;
      let text;
      try {
        text = fs.readFileSync(file, 'latin1');
      } catch (_e) {
        continue;
      }
      const res = analyzeFoxSource(file, text);
      counts.classes += res.classes;
      counts.functions += res.functions;
      for (const f of res.findings) findings.push(f);
    } else if (ext === SCX_EXT) {
      counts.scx++; // tabela binaria — so conta
    } else if (ext === VCX_EXT) {
      counts.vcx++; // tabela binaria — so conta
    } else if (ext === '.tsx' || ext === '.ts') {
      if (ext === '.tsx') counts.tsx++; else counts.ts++;
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch (_e) {
        continue;
      }
      const res = analyzeTsSource(text);
      counts.classes += res.classes;
      counts.functions += res.functions;
    }
  }

  // totals: contagem de achados por regra
  const totals = {};
  for (const f of findings) {
    totals[f.rule] = (totals[f.rule] || 0) + 1;
  }
  totals.files = files.length;
  totals.findings = findings.length;

  return { dir: root, counts, findings, totals };
}

// ── Relatorio em texto ───────────────────────────────────────────────────────

const RULE_LABELS = {
  'select-star': 'SELECT *',
  'scan-no-index': 'SCAN sem FOR',
  'undeclared-var': 'Variaveis sem declaracao (heuristica)',
  'assign-in-condition': 'IF com = (parece atribuicao)',
};

function formatReport(report) {
  const c = report.counts;
  const lines = [];
  lines.push(`Projeto: ${report.dir}`);
  lines.push(
    `PRGs: ${c.prg}   Forms(SCX): ${c.scx}   VCX: ${c.vcx}   ` +
    `TS: ${c.ts}   TSX: ${c.tsx}   Classes: ${c.classes}   Funcoes: ${c.functions}`
  );
  lines.push('--');
  lines.push(`Achados (${report.findings.length}):`);

  // ordem estavel de exibicao
  const order = ['select-star', 'scan-no-index', 'undeclared-var', 'assign-in-condition'];
  for (const rule of order) {
    if (report.totals[rule]) {
      lines.push(`  ${RULE_LABELS[rule]}: ${report.totals[rule]}`);
    }
  }
  // regras eventuais nao previstas acima
  for (const rule of Object.keys(report.totals)) {
    if (order.includes(rule) || rule === 'files' || rule === 'findings') continue;
    lines.push(`  ${rule}: ${report.totals[rule]}`);
  }

  if (report.findings.length > 0) {
    lines.push('');
    lines.push('Primeiros achados:');
    const sample = report.findings.slice(0, 20);
    for (const f of sample) {
      const rel = path.relative(report.dir, f.file) || f.file;
      lines.push(`  ${rel}:${f.line}  [${f.rule}] ${f.message}`);
    }
    if (report.findings.length > sample.length) {
      lines.push(`  ... (+${report.findings.length - sample.length} outros)`);
    }
  }

  return lines.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log('uso: foxts analyze [dir] [--json]');
    console.log('  varre uma arvore de projeto VFP legado e imprime um diagnostico.');
    process.exit(0);
  }

  let asJson = false;
  let dir = null;
  for (const a of args) {
    if (a === '--json') asJson = true;
    else if (a.startsWith('-')) {
      console.error(`[analyze] opcao desconhecida: ${a}`);
      console.error('uso: foxts analyze [dir] [--json]');
      process.exit(2);
    } else if (dir === null) {
      dir = a;
    } else {
      console.error('[analyze] argumentos demais');
      console.error('uso: foxts analyze [dir] [--json]');
      process.exit(2);
    }
  }

  const target = dir || '.';
  if (!fs.existsSync(target)) {
    console.error(`[analyze] diretorio nao encontrado: ${target}`);
    process.exit(2);
  }

  const report = analyze(target, {});
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
  process.exit(0);
}

if (require.main === module) {
  main(process.argv);
}

module.exports = { analyze, formatReport, walk };
