// cadvalida.form.tsx — Frente F: validação do form GERADA DIRETO do schema.
//   @Form({ validate: Cliente }) -> método ThisForm.Validar() com as mesmas checagens
//   do schema, mas lendo ThisForm.<campo> (o membro vinculado por bind="campo").
//   Devolve "" (válido) ou a 1ª mensagem de erro — autocontido, sem PROCEDURE externa.
//   Uso típico: no Click do Salvar, IF NOT EMPTY(ThisForm.Validar()) ... MESSAGEBOX(...).
// Prova: verifyformvalidate.js (instancia, seta os campos e confere o retorno).
import { Form, Column, Label, TextBox, schema, str, num } from "@vfp/core";

const Cliente = schema({
  nome: str().required().min(3).max(10),
  uf: str().len(2),
  idade: num().min(18).max(120),
});

@Form({ caption: "Cadastro", width: 360, height: 240, validate: Cliente })
export class CadClienteForm {
  render() {
    return (
      <Column gap={8}>
        <Label caption="Nome" />
        <TextBox bind="nome" width={200} />
        <Label caption="UF" />
        <TextBox bind="uf" width={60} />
        <Label caption="Idade" />
        <TextBox bind="idade" width={60} />
      </Column>
    );
  }
}
