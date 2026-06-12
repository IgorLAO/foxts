// cliente.form.tsx — form de DETALHE, aberto pelo botão da lista (Frente C: navegação).
// Mostra: binding (bind="campo"), layout flex (<Column>), tema (variant), e a
// validação do form gerada DIRETO do schema (Frente F: @Form({ validate: Cliente })
// -> ThisForm.Validar() devolve "" ou a 1ª mensagem de erro).
import { Form, Column, Label, TextBox, SaveButton, schema, str, num } from "@vfp/core";

const Cliente = schema({
  nome: str().required().min(3).max(30),
  uf: str().len(2),
  limite: num().min(0).max(99999),
});

@Form({ caption: "Cliente", width: 380, height: 300, validate: Cliente })
export class ClienteForm {
  render() {
    return (
      <Column gap={8} padding={12}>
        <Label caption="Nome" />
        <TextBox bind="nome" width={240} />
        <Label caption="UF" />
        <TextBox bind="uf" width={60} />
        <Label caption="Limite de credito" />
        <TextBox bind="limite" width={100} />
        <SaveButton caption="Salvar" variant="primary" />
      </Column>
    );
  }
}
