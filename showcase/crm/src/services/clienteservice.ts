// services/clienteservice.ts — servico injetavel (Frente C: DI) com o query builder
// local (Frente D). @Injectable -> DEFINE CLASS AS Custom; cada metodo vira PROCEDURE.
// As chamadas from(...).where(...).all/count/first sao compiladas para SELECT ... VFP.
import { Injectable, from } from "@vfp/core";

@Injectable()
export class ClienteService {
  // SELECT * FROM CLIENTE WHERE ATIVO = .T. ORDER BY NOME INTO CURSOR curAtivos
  carregarAtivos(): void {
    from("CLIENTE").where("ATIVO", true).orderBy("NOME").all("curAtivos");
  }

  // SELECT COUNT(*) FROM CLIENTE -> escalar (capturar numa variavel, nao inline)
  total(): number {
    const n = from("CLIENTE").count();
    return n;
  }

  // SELECT TOP 1 ... -> objeto-linha (loRow.nome le a propriedade)
  porUf(uf: string): void {
    from("CLIENTE").where("UF", uf).orderBy("NOME").all("curUf");
  }
}
