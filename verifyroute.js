'use strict';
// verifyroute.js — resolucao de rota por string em build-time (resto da Frente C).
//   @Route("pedido")  em PedidoForm   -> mapa global { pedido: "PedidoForm" }
//   this.router.open("pedido", {...}) em outro form -> DO FORM PedidoForm WITH ...
// E um teste de build (sem VFP): collectRoute monta o mapa, transpileForm resolve a
// string. Tambem cobre o caminho de erro (sem mapa, ou rota inexistente -> CompileError).

const fs = require('fs');
const path = require('path');
const { transpileForm, collectRoute, CompileError } = require('./transpile');

const DIR = path.resolve('dist/_routefix');
fs.mkdirSync(DIR, { recursive: true });

const PEDIDO = path.join(DIR, 'pedido.form.tsx');
const CLIENTE = path.join(DIR, 'cliente.form.tsx');

fs.writeFileSync(PEDIDO, [
  'import { Form, Route, FoxForm, Column, Label } from "@vfp/core";',
  '@Route("pedido")',
  '@Form({ caption: "Pedido", width: 400, height: 300 })',
  'export class PedidoForm extends FoxForm {',
  '  render() { return (<Column><Label caption="Pedido" /></Column>); }',
  '}',
  '',
].join('\n'), 'utf8');

fs.writeFileSync(CLIENTE, [
  'import { Form, FoxForm, Column, Label } from "@vfp/core";',
  '@Form({ caption: "Cliente", width: 400, height: 300 })',
  'export class ClienteForm extends FoxForm {',
  '  abrirPedido(): void {',
  '    this.router.open("pedido", { clienteId: 10 });',
  '  }',
  '  render() { return (<Column><Label caption="Cliente" /></Column>); }',
  '}',
  '',
].join('\n'), 'utf8');

const results = [];
const check = (name, fn) => {
  try { fn(); results.push([name, true, '']); }
  catch (e) { results.push([name, false, e.message]); }
};

// 1. collectRoute extrai a rota do form que declara @Route (parser sintatico barato).
let routes = {};
check('collectRoute monta { pedido: PedidoForm }', () => {
  const r = collectRoute(PEDIDO);
  if (!r || r.route !== 'pedido' || r.name !== 'PedidoForm') throw new Error('mapa inesperado: ' + JSON.stringify(r));
  routes[r.route] = r.name;
  // form sem @Route -> null
  if (collectRoute(CLIENTE) !== null) throw new Error('cliente nao deveria ter rota');
});

// 2. com o mapa, router.open("pedido") resolve para DO FORM PedidoForm WITH 10.
check('router.open("pedido") -> DO FORM PedidoForm WITH 10', () => {
  const ir = transpileForm(CLIENTE, { routes });
  const body = (ir.methods && ir.methods.abrirPedido) || '';
  if (!/DO FORM PedidoForm WITH 10/.test(body)) throw new Error('emitido: ' + JSON.stringify(body));
});

// 3. sem o mapa de rotas, a string nao resolve -> CompileError claro (DX de build).
check('sem mapa -> CompileError', () => {
  try { transpileForm(CLIENTE); throw new Error('deveria ter lancado'); }
  catch (e) { if (!(e instanceof CompileError) || !/rotas por string/.test(e.message)) throw new Error('erro inesperado: ' + e.message); }
});

// 4. rota inexistente no mapa -> CompileError apontando a rota.
check('rota inexistente -> CompileError', () => {
  try { transpileForm(CLIENTE, { routes: { outra: 'OutraForm' } }); throw new Error('deveria ter lancado'); }
  catch (e) { if (!(e instanceof CompileError) || !/nao encontrada/.test(e.message)) throw new Error('erro inesperado: ' + e.message); }
});

let ok = 0;
console.log('\n  resolucao de rota por string (build-time)');
console.log('  ' + '-'.repeat(48));
for (const [name, pass, msg] of results) {
  if (pass) ok++;
  console.log(`  ${pass ? 'OK ' : 'XX '} ${name}${pass ? '' : '  -> ' + msg}`);
}
console.log('  ' + '-'.repeat(48));
console.log(`\n  ${ok}/${results.length} checks de rota\n`);
process.exit(ok === results.length ? 0 : 1);
