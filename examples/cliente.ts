// cliente.ts — classe comum -> DEFINE CLASS ... AS Custom (PRG VFP).
// `foxts examples/cliente.ts -o dist/cliente.prg`

export class Cliente {
  nome: string = "";
  saldo: number = 0;
  ativo: boolean = false;

  // logica pura: provada no oraculo (verifyclass: VFP == Node)
  saudacao(): string {
    return "Ola, " + this.nome;
  }

  // muta estado do objeto -> This.saldo = This.saldo + v
  deposita(v: number): void {
    this.saldo = this.saldo + v;
  }

  bonus(taxa: number): number {
    return this.saldo * taxa;
  }

  // console.log(...) -> ? ... (saida pelo console do VFP)
  mostra(): void {
    console.log(this.nome);
  }
}
