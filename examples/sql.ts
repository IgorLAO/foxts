// sql.ts — acesso a SQL Server escrito em TypeScript, transpilado para o
// SQL pass-through nativo do VFP. Build: node cli.js examples/sql.ts

import { sqlConnect, sqlConnectDSN } from "../db";

const CONN = "DRIVER=SQL Server;SERVER=.;DATABASE=vendas;Trusted_Connection=yes";

// abre conexão, executa um SELECT com parâmetro (?uf) e devolve o status do SQLEXEC
export function carregarClientes(uf: string): number {
  const db = sqlConnect(CONN);
  let r: number = db.exec("SELECT id, nome, uf FROM clientes WHERE uf = ?uf ORDER BY nome", "clientes");
  db.disconnect();
  return r;
}

// agregação para um cursor de relatório
export function totalPorUf(): number {
  const db = sqlConnect(CONN);
  let r: number = db.exec("SELECT uf, COUNT(*) AS qt FROM clientes GROUP BY uf", "poruf");
  db.disconnect();
  return r;
}

// conexão por DSN + usuário/senha, com checagem de handle antes de executar
export function inserirCliente(nome: string, uf: string): number {
  const db = sqlConnectDSN("vendasDSN", "sa", "senha");
  let r: number = 0;
  if (db.connected) {
    r = db.exec("INSERT INTO clientes (nome, uf) VALUES (?nome, ?uf)");
    db.disconnect();
  }
  return r;
}

// Frente D — transação SQL Server: dois INSERTs atômicos. Modo manual
// (setProp Transactions=2), begin/commit, rollback no erro. SQLGETPROP lê
// o modo de transação corrente.
export function transferir(nome: string, uf: string): number {
  const db = sqlConnect(CONN);
  db.setProp("Transactions", 2); // DB_TRANSMANUAL
  const modo: number = db.getProp("Transactions");
  db.begin();
  let r: number = db.exec("INSERT INTO clientes (nome, uf) VALUES (?nome, ?uf)");
  if (r >= 0) {
    db.commit();
  } else {
    db.rollback();
  }
  db.disconnect();
  return modo;
}
