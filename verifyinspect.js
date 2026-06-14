'use strict';
// verifyinspect.js — autoteste PURO NODE do gerador DBF -> interface TS.
// Escreve um DBF VFP minimo (so cabecalho) num temp, chama dbfToInterface e
// confere os mapeamentos de tipo, o nome da interface e a linha de import.
// NAO usa VFP nem foxcli.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { dbfToInterface } = require('./inspect');

// ---- monta um DBF VFP valido (so cabecalho, sem registros) ----
// campos representativos: C(50), N(12,2), I(4), L(1), D(8), M(4)
const FIELDS = [
  { name: 'nome',    type: 'C', length: 50, decimals: 0 },
  { name: 'saldo',   type: 'N', length: 12, decimals: 2 },
  { name: 'idade',   type: 'I', length: 4,  decimals: 0 },
  { name: 'ativo',   type: 'L', length: 1,  decimals: 0 },
  { name: 'nasc',    type: 'D', length: 8,  decimals: 0 },
  { name: 'obs',     type: 'M', length: 4,  decimals: 0 },
];

function buildDbf(fields) {
  const headerLen = 32 + fields.length * 32 + 1; // 32 base + descritores + terminador
  const recordLen = 1 + fields.reduce((s, f) => s + f.length, 0); // 1 = flag de delecao
  const buf = Buffer.alloc(headerLen + 1); // +1 para o EOF 0x1A

  buf[0] = 0x30;                 // versao: Visual FoxPro
  buf[1] = 26; buf[2] = 6; buf[3] = 14; // data ultima atualizacao (irrelevante)
  buf.writeUInt32LE(0, 4);       // record count = 0
  buf.writeUInt16LE(headerLen, 8);
  buf.writeUInt16LE(recordLen, 10);

  let off = 32;
  for (const f of fields) {
    buf.write(f.name, off, 'ascii');          // nome (0..10), restante fica NUL
    buf[off + 11] = f.type.charCodeAt(0);     // tipo
    buf[off + 16] = f.length;                 // largura
    buf[off + 17] = f.decimals;               // casas decimais
    off += 32;
  }
  buf[off] = 0x0d;               // terminador dos descritores
  buf[off + 1] = 0x1a;           // EOF
  return buf;
}

const tmpPath = path.join(os.tmpdir(), 'so_socio.dbf');
fs.writeFileSync(tmpPath, buildDbf(FIELDS));

const result = dbfToInterface(tmpPath, {});
const ts = result.ts;

// ---- checagens ----
const checks = [
  ['nome da interface = SoSocio',        result.name === 'SoSocio'],
  ['import vem de "foxts/fox"',          /import \{[^}]*\} from "foxts\/fox";/.test(ts)],
  ['import inclui Char',                 /import \{[^}]*\bChar\b[^}]*\} from "foxts\/fox";/.test(ts)],
  ['import inclui Numeric',              /import \{[^}]*\bNumeric\b[^}]*\} from "foxts\/fox";/.test(ts)],
  ['import inclui Int',                  /import \{[^}]*\bInt\b[^}]*\} from "foxts\/fox";/.test(ts)],
  ['import inclui Logical',              /import \{[^}]*\bLogical\b[^}]*\} from "foxts\/fox";/.test(ts)],
  ['import inclui DateF',                /import \{[^}]*\bDateF\b[^}]*\} from "foxts\/fox";/.test(ts)],
  ['C(50)  -> Char<50>',                ts.includes('Char<50>')],
  ['N(12,2)-> Numeric<12, 2>',          ts.includes('Numeric<12, 2>')],
  ['I      -> Int',                     /\bidade: Int;/.test(ts)],
  ['L      -> Logical',                 /\bativo: Logical;/.test(ts)],
  ['D      -> DateF',                   /\bnasc: DateF;/.test(ts)],
  ['M memo -> string',                  /\bobs: string;/.test(ts)],
  ['interface exportada',               /export interface SoSocio \{/.test(ts)],
  ['comentario in-repo "../fox"',       ts.includes('"../fox"')],
];

let ok = 0;
console.log('');
for (const [label, pass] of checks) {
  console.log(`  ${pass ? 'OK' : 'XX'} ${label}`);
  if (pass) ok++;
}
console.log('');
console.log('  --- interface gerada ---');
console.log(ts.split('\n').map((l) => '  ' + l).join('\n'));
console.log(`  ${ok}/${checks.length}`);
console.log('');

try { fs.unlinkSync(tmpPath); } catch (_e) { /* ignora */ }

process.exit(ok === checks.length ? 0 : 1);
