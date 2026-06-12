// cadcliente.form.ts — form VFP por DECORATORS (estilo da spec).
//   foxc build examples/cadcliente.form.ts -o dist/cadcliente.scx
//
// @Form na classe -> propriedades do form; @Label/@TextBox/@Button num campo ou
// método -> controles (ADD OBJECT). O @Button no método `salvar` cria o botão
// cmdSalvar cujo Click chama ThisForm.salvar(). Métodos sem decorator (maiusc)
// são lógica pura, transpilados e provados no oráculo (cases).

import { Form, Label, TextBox, Button } from "../decorators";

@Form({ caption: "Cadastro de Cliente", width: 600, height: 400 })
export class FrmCliente {
  @Label({ top: 20, left: 20, caption: "Nome:" })
  lblNome: string = "";

  @TextBox({ top: 18, left: 90, width: 220 })
  txtNome: string = "";

  @Button({ top: 60, left: 90, width: 100, caption: "Salvar" })
  salvar(): void {
    // handler do botão (Click)
  }

  // lógica pura (sem decorator) -> vira método do form; oráculo abaixo
  maiusc(s: string): string {
    return s.toUpperCase();
  }
}

export const cases: [string, any[]][] = [["maiusc", ["abc"]]];
