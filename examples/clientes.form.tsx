// clientes.form.tsx — form escrito em TSX (a visão "React Native para VFP").
// render() devolve JSX; <Column>/<Row gap> são resolvidos em layout no build;
// bind -> ControlSource; variant -> cores; <OpenFormButton> reusa a navegação.
//   foxc build examples/clientes.form.tsx -o dist/clientes.scx
import { Form, Column, Row, Label, TextBox, Button, OpenFormButton, SaveButton } from "@vfp/core";

declare class PedidoForm {}

@Form({ caption: "Clientes", width: 520, height: 360 })
export class ClienteForm {
  render() {
    return (
      <Column gap={10}>
        <Label caption="Nome" />
        <TextBox bind="nome" width={300} />
        <Row gap={8}>
          <Button variant="primary" caption="Salvar" />
          <OpenFormButton variant="success" caption="Pedidos" form={PedidoForm} />
        </Row>
      </Column>
    );
  }
}
