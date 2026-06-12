// query.ts — Frente D: query builder fluente -> VFP SQL (SELECT INTO CURSOR).
//   from("cli").where("ativo", true).orderBy("nome").all("curAtivos")
//   -> SELECT * FROM cli WHERE ativo = .T. ORDER BY nome INTO CURSOR curAtivos READWRITE
import { createCursor, reccount, Char, Logical, Int } from "../fox";
import { from } from "../decorators";

interface Cli { nome: Char<10>; uf: Char<2>; ativo: Logical; }
interface Ped { cliente: Char<10>; valor: Int; }

// popula o cursor "cli" com 4 registros de teste (reutilizado pelos casos abaixo)
function seedCli(): void {
  const c = createCursor<Cli>("cli");
  c.append({ nome: "Ana", uf: "SP", ativo: true });
  c.append({ nome: "Bia", uf: "RJ", ativo: true });
  c.append({ nome: "Caio", uf: "SP", ativo: false });
  c.append({ nome: "Davi", uf: "SP", ativo: true });
}

// filtro composto: ativo=.T. AND uf="SP" -> Ana, Davi
export function ativosSP(): number {
  seedCli();
  from("cli").select("nome", "uf").where("ativo", true).where("uf", "SP").orderBy("nome").all("curOut");
  return reccount("curOut");
}

// count() como expressão: SELECT COUNT(*) ... INTO ARRAY -> escalar. ativo=.T. -> 3
export function contaAtivos(): number {
  seedCli();
  const n = from("cli").where("ativo", true).count();
  return n;
}

// first("cur"): SELECT TOP 1 ... ORDER BY -> cursor de 1 linha (o primeiro por nome)
export function primeiroPorNome(): number {
  seedCli();
  from("cli").orderBy("nome").first("curTop");
  return reccount("curTop"); // 1
}

// first() SEM cursor: devolve o OBJETO-LINHA (SCATTER NAME). loCli.nome/.uf leem os
// campos. Aqui o primeiro de SP por nome desc é "Davi" (Ana/Caio/Davi em SP).
// (Evite nomes de 1 letra a–j para o objeto: colidem com as letras de work area do VFP.)
export function primeiroSP(): Char<10> {
  seedCli();
  const loCli = from("cli").where("uf", "SP").orderBy("nome DESC").first();
  return loCli.nome; // "Davi"
}

// groupBy + having: agrupa por uf, mantém grupos com mais de 1 -> só "SP" (3) -> 1 grupo
export function ufsComMais(): number {
  seedCli();
  from("cli").select("uf", "COUNT(*) AS qtd").groupBy("uf").having("COUNT(*) > 1").all("curG");
  return reccount("curG");
}

// join: cli x ped por nome=cliente, soma valores dos pedidos de clientes de SP
export function pedidosSP(): number {
  seedCli();
  const p = createCursor<Ped>("ped");
  p.append({ cliente: "Ana", valor: 10 });
  p.append({ cliente: "Bia", valor: 20 });
  p.append({ cliente: "Davi", valor: 30 });
  from("cli").select("ped.valor").join("ped", "ped.cliente = cli.nome").where("cli.uf", "SP").all("curJ");
  return reccount("curJ"); // Ana + Davi = 2 pedidos
}
