// forms/cliente.form.tsx — form de DETALHE. Junta varias frentes:
//   • @Route("cliente")              -> entra em dist/routes.json (Frente C)
//   • extends FoxForm                -> habilita this.router / this.caption
//   • Init(clienteId)                -> LPARAMETERS clienteId (recebe params do open)
//   • bind="campo"                   -> ControlSource; limite e num() => default 0 (nao "")
//   • @Form({ validate: ClienteForm_Schema }) -> ThisForm.Validar() gerado do schema
//     (Frente F). O schema fica NO MESMO arquivo (transpileForm le da AST local).
import { Form, Route, FoxForm, Column, Label, TextBox, SaveButton, schema, str, num } from "@vfp/core";

const ClienteSchema = schema({
  nome: str().required().min(3).max(40),
  uf: str().len(2),
  email: str().email(),
  limite: num().min(0).max(99999),
});

@Route("cliente")
@Form({ caption: "Cliente", width: 420, height: 360, validate: ClienteSchema })
export class ClienteForm extends FoxForm {
  // recebe parametros do form que o abriu (DO FORM ClienteForm WITH clienteId)
  Init(clienteId: number): void {
    this.caption = "Cliente " + clienteId;
  }

  render() {
    return (
      <Column gap={8} padding={12}>
        <Label caption="Nome" />
        <TextBox bind="nome" width={280} />
        <Label caption="UF" />
        <TextBox bind="uf" width={60} />
        <Label caption="Email" />
        <TextBox bind="email" width={280} />
        <Label caption="Limite de credito" />
        <TextBox bind="limite" width={120} />
        <SaveButton caption="Salvar" variant="primary" />
      </Column>
    );
  }
}
