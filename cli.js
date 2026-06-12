#!/usr/bin/env node
'use strict';
// cli.js — foxts <entrada.ts> [-o saida.prg]
// Transpila um .ts (subconjunto tipado) para FoxPro .prg em build-time.

const fs = require('fs');
const path = require('path');
const { transpile, CompileError } = require('./transpile');

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log('uso: foxts <entrada.ts> [-o saida.prg]');
    process.exit(args.length === 0 ? 2 : 0);
  }
  let entry = null;
  let out = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--out') out = args[++i];
    else entry = args[i];
  }
  if (!entry) {
    console.error('[foxts] faltou o arquivo de entrada .ts');
    process.exit(2);
  }
  try {
    const prg = transpile(entry);
    if (out) {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, prg, 'latin1'); // VFP le PRG como ANSI, nao UTF-8
      console.log(`[foxts] ${entry} -> ${out}`);
    } else {
      process.stdout.write(prg);
    }
  } catch (e) {
    console.error(e instanceof CompileError ? e.message : String(e.message || e));
    process.exit(1);
  }
}

main(process.argv);
