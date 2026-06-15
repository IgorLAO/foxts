#!/usr/bin/env node
// foxcli.js — atalho para rodar o foxcli BUNDLADO (resolvido por foxcli-path.js) com
// os argumentos passados. A camada que fala com o VFP9 fica a um `npm run` de distancia.
//   npm run foxcli -- doctor
//   npm run foxcli -- build showcase/totem-app/build_exe.prg --timeout 300
//   npm run foxcli -- inspect crm.pjx --json
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');
const FOXCLI = require('./foxcli-path');

if (!fs.existsSync(FOXCLI)) {
  console.error('[foxcli] binario nao encontrado em: ' + FOXCLI);
  console.error('[foxcli] rode `npm run foxcli:build` (precisa de Go) ou aponte FOXCLI=<path>.');
  process.exit(1);
}
const r = spawnSync(FOXCLI, process.argv.slice(2), { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
