'use strict';
// foxcli-path.js — resolve o caminho do executável foxcli ONCE, com precedência:
//   1. process.env.FOXCLI   — override explícito
//   2. process.env.FOXCLI_HOME + "\foxcli.exe"  — diretório customizado
//   3. foxcli BUNDLADO no repo: ./foxcli/foxcli.exe (fonte Go vendorizada + build
//      via `npm run foxcli:build`). Self-contained — a fonte de verdade do projeto.
//   4. candidates relativos ao módulo (layouts antigos: ../foxcli/, ../../foxcli/)
//   5. fallback "foxcli.exe" — confia no PATH (sem caminho pessoal embutido)
//
// Exporta a string do caminho absoluto resolvido.

const fs = require('fs');
const path = require('path');

const DEFAULT = 'foxcli.exe'; // último recurso: confia no PATH (sem caminho pessoal)

function resolveFoxcliPath() {
  // 1. Override explícito
  if (process.env.FOXCLI) {
    return path.resolve(process.env.FOXCLI);
  }

  // 2. FOXCLI_HOME aponta o diretório que contém foxcli.exe
  if (process.env.FOXCLI_HOME) {
    return path.resolve(process.env.FOXCLI_HOME, 'foxcli.exe');
  }

  // 3-4. Discovery: o BUNDLADO no repo vem primeiro (self-contained), depois os
  //      layouts antigos onde o foxcli ficava como vizinho do foxts.
  const base = __dirname; // diretório do foxts
  const candidates = [
    path.join(base, 'foxcli', 'foxcli.exe'),              // ./foxcli/foxcli.exe (BUNDLADO)
    path.join(base, '..', 'foxcli', 'foxcli.exe'),        // ../foxcli/foxcli.exe (legado)
    path.join(base, '..', '..', 'foxcli', 'foxcli.exe'),  // ../../foxcli/foxcli.exe (legado)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return path.resolve(c);
    }
  }

  // 5. Fallback hardcoded (compatibilidade com instalações existentes)
  return DEFAULT;
}

module.exports = resolveFoxcliPath();
