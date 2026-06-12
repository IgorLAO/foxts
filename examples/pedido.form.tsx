// pedido.form.tsx — composição com @Component próprio.
//   <CustomerLookup/> expande para 3 controles; <SaveButton caption=.../> usa prop.
//   foxc build examples/pedido.form.tsx -o dist/pedido.scx
import { Form, Component, Prop, Column, Row, TextBox, Button } from "@vfp/core";

// componente composto: vira txtCodigo + txtNome + btnBuscar (com layout próprio)
@Component()
export class CustomerLookup {
  render() {
    return (
      <Row gap={5}>
        <TextBox bind="codigo" width={70} />
        <TextBox bind="nome" width={220} />
        <Button caption="Buscar" />
      </Row>
    );
  }
}

// componente com prop: caption vem do uso
@Component()
export class SaveButton {
  @Prop() caption: string = "";
  render() {
    return <Button variant="primary" caption={this.caption} />;
  }
}

@Form({ caption: "Pedido", width: 520, height: 360 })
export class PedidoForm {
  render() {
    return (
      <Column gap={12}>
        <CustomerLookup />
        <SaveButton caption="Gravar pedido" />
      </Column>
    );
  }
}
