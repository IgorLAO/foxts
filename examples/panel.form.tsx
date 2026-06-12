// panel.form.tsx — containers aninhados: <Container> vira um controle `container`
// do VFP cujos filhos têm PARENT = nome do container e Top/Left RELATIVOS.
import { Form, Column, Row, Label, TextBox, Container, SaveButton } from "@vfp/core";

@Form({ caption: "Cadastro", width: 480, height: 360 })
export class CadForm {
  render() {
    return (
      <Column gap={12}>
        <Container padding={10} gap={6}>
          <Label caption="Dados pessoais" />
          <TextBox bind="nome" width={260} />
          <TextBox bind="email" width={260} />
        </Container>
        <Container flexDirection="row" gap={8} padding={10}>
          <TextBox bind="cidade" width={160} />
          <TextBox bind="uf" width={50} />
        </Container>
        <Row>
          <SaveButton caption="Gravar" />
        </Row>
      </Column>
    );
  }
}
