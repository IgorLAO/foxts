'use strict';
// foxcli-path.js — resolve o caminho do executável foxcli ONCE, com precedência:
//   1. process.env.FOXCLI   — override explícito
//   2. process.env.FOXCLI_HOME + "\foxcli.exe"  — diretório customizado
//   3. candidates relativos ao diretório deste módulo (layouts comuns de mono-repo)
//   4. fallback hardcoded  C:\projectos\testesvf\foxcli\foxcli.exe
//
// Exporta a string do caminho absoluto resolvido.

const fs = require('fs');
const path = require('path');

const DEFAULT = 'C:\\projectos\\testesvf\\foxcli\\foxcli.exe';

function resolveFoxcliPath() {
  // 1. Override explícito
  if (process.env.FOXCLI) {
    return path.resolve(process.env.FOXCLI);
  }

  // 2. FOXCLI_HOME aponta o diretório que contém foxcli.exe
  if (process.env.FOXCLI_HOME) {
    return path.resolve(process.env.FOXCLI_HOME, 'foxcli.exe');
  }

  // 3. Discovery: candidatos relativos a este módulo
  //    Típico em mono-repos onde foxcli fica como irmão/vizinho do foxts.
  const base = __dirname; // diretório do foxts
  const candidates = [
    path.join(base, '..', 'foxcli', 'foxcli.exe'),      // ../foxcli/foxcli.exe
    path.join(base, '..', '..', 'foxcli', 'foxcli.exe'), // ../../foxcli/foxcli.exe
    path.join(base, 'foxcli', 'foxcli.exe'),              // ./foxcli/foxcli.exe (bundle local)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return path.resolve(c);
    }
  }

  // 4. Fallback hardcoded (compatibilidade com instalações existentes)
  return DEFAULT;
}

module.exports = resolveFoxcliPath();
