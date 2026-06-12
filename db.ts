// db.ts — lib de conexão a SQL Server para o foxts.
//
// Você programa o acesso a dados em TypeScript tipado; o transpilador substitui
// cada chamada pelo SQL pass-through NATIVO do Visual FoxPro 9:
//
//   sqlConnect(cs)        -> SQLSTRINGCONNECT(cs)
//   sqlConnectDSN(d,u,p)  -> SQLCONNECT(d, u, p)
//   db.exec(sql, cursor)  -> SQLEXEC(db, sql, cursor)
//   db.disconnect()       -> SQLDISCONNECT(db)
//   db.connected          -> (db > 0)
//
// Parâmetros de consulta usam a sintaxe pass-through do VFP: `?nomeVar` na SQL
// liga-se à variável de mesmo nome em escopo (que o transpilador emite igual).
//
// O runtime abaixo só existe para tipagem (e um eventual oráculo); no app VFP
// final nada de JS roda — o handle `db` é um número devolvido por SQLSTRINGCONNECT.

export type SqlHandle = number;

export class Connection {
  constructor(public readonly handle: SqlHandle) {}

  /**
   * SQLEXEC: executa um comando SQL. O resultado (SELECT) vai para um cursor
   * VFP (nome em `intoCursor`, default "sqlresult"). Devolve o nº de result
   * sets, ou -1 em erro. Use `?nomeVar` na SQL para parâmetros.
   */
  exec(sql: string, intoCursor?: string): number {
    throw new Error("Connection.exec só executa no VFP (SQLEXEC)");
  }

  /** SQLDISCONNECT: fecha a conexão. */
  disconnect(): void { /* no-op no runtime */ }

  /** handle válido? -> (db > 0) */
  get connected(): boolean { return this.handle > 0; }
}

/**
 * SQLSTRINGCONNECT: conecta por connection string.
 * SQL Server: "DRIVER=SQL Server;SERVER=host;DATABASE=db;UID=user;PWD=pass"
 * (ou `Trusted_Connection=yes` para autenticação integrada do Windows).
 */
export function sqlConnect(connString: string): Connection {
  return new Connection(-1);
}

/** SQLCONNECT: conecta por DSN ODBC + usuário/senha. */
export function sqlConnectDSN(dsn: string, user: string, pass: string): Connection {
  return new Connection(-1);
}
