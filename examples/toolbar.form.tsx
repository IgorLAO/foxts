// toolbar.form.tsx — mostra o Yoga fazendo flexbox de verdade no build:
//   justify="between" distribui o espaço; align="center" centraliza no eixo cruzado;
//   grow faz o TextBox esticar. Tudo vira Top/Left/Width/Height absolutos no SCX.
import { Form, Column, Row, Label, TextBox, Button } from "@vfp/core";

@Form({ caption: "Toolbar", width: 540, height: 220 })
export class ToolbarForm {
  render() {
    return (
      <Column gap={12} width={520}>
        <Row width={500} justify="between" align="center">
          <Label caption="Pedido" />
          <Button caption="Novo" />
          <Button caption="Excluir" variant="danger" />
        </Row>
        <Row width={500} gap={8}>
          <Label caption="Busca" />
          <TextBox bind="filtro" grow={1} />
          <Button caption="Ir" variant="primary" />
        </Row>
      </Column>
    );
  }
}
