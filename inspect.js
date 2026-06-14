#!/usr/bin/env node
'use strict';
// inspect.js — foxts inspect <tabela.dbf> [-o saida.ts]
// Le o cabecalho de um DBF (dBase III / VFP) e gera uma interface TypeScript
// tipada com o vocabulario do foxts (Char<N>, Numeric<W,D>, Int, Logical, DateF),
// pronta para virar um Cursor<T> sem strings magicas.

const fs = require('fs');
const path = require('path');

// ---- mapa de tipos DBF/VFP -> tipo TS (vocabulario do fox.ts) ----
// C -> Char<len>
// N -> Numeric<len[, dec]>   (dec opcional quando 0)
// F -> Numeric<len, dec>     (float, sempre com casas)
// I -> Int
// L -> Logical
// D -> DateF                 (date)
// T -> DateF                 (datetime)
// Y -> number                (currency)
// B -> number                (double)
// M -> string                (memo)
// G/Q/V/W -> string          (general/blob/varchar/varbinary)
// desconhecido -> string com comentario

// devolve { tsType, used } onde `used` e o tipo fox importavel (ou null p/ primitivos)
function mapType(type, length, decimals) {
  switch (type) {
    case 'C': return { tsType: `Char<${length}>`, used: 'Char' };
    case 'N': return decimals > 0
      ? { tsType: `Numeric<${length}, ${decimals}>`, used: 'Numeric' }
      : { tsType: `Numeric<${length}>`, used: 'Numeric' };
    case 'F': return { tsType: `Numeric<${length}, ${decimals}>`, used: 'Numeric' };
    case 'I': return { tsType: 'Int', used: 'Int' };
    case 'L': return { tsType: 'Logical', used: 'Logical' };
    case 'D': return { tsType: 'DateF', used: 'DateF' };
    case 'T': return { tsType: 'DateF', used: 'DateF' }; // datetime -> DateF
    case 'Y': return { tsType: 'number', used: null };   // currency
    case 'B': return { tsType: 'number', used: null };   // double
    case 'M': return { tsType: 'string', used: null };   // memo
    case 'G': case 'Q': case 'V': case 'W':
      return { tsType: 'string', used: null };           // general/blob/varchar/varbinary
    default:
      return { tsType: 'string', used: null, unknown: true };
  }
}

// PascalCase do nome base do arquivo: "so_socio.dbf" -> "SoSocio"
function pascalCase(base) {
  const parts = base.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'Tabela';
  let name = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  // identificador TS nao pode comecar com digito
  if (/^[0-9]/.test(name)) name = '_' + name;
  return name;
}

// identificador TS valido? (senao a chave precisa de aspas)
function isValidIdentifier(s) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
}

// ---- parse do cabecalho DBF ----
function parseDbfHeader(buf) {
  if (buf.length < 32) {
    throw new Error('arquivo DBF muito curto (cabecalho < 32 bytes)');
  }
  const version = buf[0];
  const recordCount = buf.readUInt32LE(4);
  const headerLength = buf.readUInt16LE(8);

  const fields = [];
  let off = 32;
  // descritores de 32 bytes ate o terminador 0x0D
  while (off + 1 <= buf.length && buf[off] !== 0x0d) {
    if (off + 32 > buf.length) break;
    // nome: bytes 0..10 (ASCII, cortado no NUL)
    let nameEnd = off;
    const limit = off + 11;
    while (nameEnd < limit && buf[nameEnd] !== 0x00) nameEnd++;
    const name = buf.toString('ascii', off, nameEnd).trim();
    const type = String.fromCharCode(buf[off + 11]);
    const length = buf[off + 16];
    const decimals = buf[off + 17];
    if (name.length === 0) { off += 32; continue; }
    fields.push({ name, type, length, decimals });
    off += 32;
  }

  return { version, recordCount, headerLength, fields };
}

// ---- gera a interface TS a partir do cabecalho ----
function dbfToInterface(dbfPath, opts) {
  opts = opts || {};
  const buf = fs.readFileSync(dbfPath);
  const header = parseDbfHeader(buf);

  const base = path.basename(dbfPath).replace(/\.[^.]*$/, '');
  const name = pascalCase(base);

  const usedFox = []; // ordem de descoberta, sem duplicar
  const fields = header.fields.map((f) => {
    const m = mapType(f.type, f.length, f.decimals);
    if (m.used && usedFox.indexOf(m.used) === -1) usedFox.push(m.used);
    return {
      name: f.name.toLowerCase(),
      type: f.type,
      length: f.length,
      decimals: f.decimals,
      tsType: m.tsType,
      unknown: !!m.unknown,
    };
  });

  // ---- monta o texto da interface ----
  const lines = [];
  // import so dos tipos fox realmente usados (na ordem canonica do fox.ts)
  const ORDER = ['Char', 'Numeric', 'Int', 'Logical', 'DateF'];
  const imports = ORDER.filter((t) => usedFox.indexOf(t) !== -1);
  if (imports.length > 0) {
    lines.push('// no repo use "../fox"; publicado e "foxts/fox"');
    lines.push(`import { ${imports.join(', ')} } from "foxts/fox";`);
    lines.push('');
  }

  lines.push(`export interface ${name} {`);
  for (const f of fields) {
    const key = isValidIdentifier(f.name) ? f.name : JSON.stringify(f.name);
    // largura de origem como comentario p/ rastreabilidade
    let comment = `${f.type}`;
    if (f.type === 'C' || f.type === 'M') comment += `(${f.length})`;
    else if (f.type === 'N' || f.type === 'F') comment += `(${f.length},${f.decimals})`;
    else if (f.type === 'I' || f.type === 'L' || f.type === 'D' || f.type === 'T') comment += ``;
    else comment += `(${f.length})`;
    let line = `  ${key}: ${f.tsType};`;
    line += ` // ${comment}`;
    if (f.unknown) line += ' (tipo DBF desconhecido -> string)';
    lines.push(line);
  }
  lines.push('}');
  lines.push('');

  const tsText = lines.join('\n');

  // fields expostos sem o flag interno `unknown`
  const outFields = fields.map((f) => ({
    name: f.name,
    type: f.type,
    length: f.length,
    decimals: f.decimals,
    tsType: f.tsType,
  }));

  return { name, fields: outFields, ts: tsText };
}

// ---- CLI ----
function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log('uso: foxts inspect <tabela.dbf> [-o saida.ts]');
    process.exit(args.length === 0 ? 2 : 0);
  }
  let entry = null;
  let out = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--out') out = args[++i];
    else entry = args[i];
  }
  if (!entry) {
    console.error('[foxts] faltou o arquivo de entrada .dbf');
    process.exit(2);
  }
  try {
    const result = dbfToInterface(entry, {});
    if (out) {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, result.ts, 'utf8');
      console.log(`[foxts] ${entry} -> ${out}`);
    } else {
      process.stdout.write(result.ts);
    }
  } catch (e) {
    console.error(String((e && e.message) || e));
    process.exit(1);
  }
}

module.exports = { dbfToInterface, parseDbfHeader, mapType, pascalCase };

if (require.main === module) {
  main(process.argv);
}
