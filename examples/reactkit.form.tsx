// reactkit.form.tsx — fixture dos recursos "modelo React" do FoxTS, exercitados juntos:
//  (1) children/composição: <Panel> é um @Component que envolve um <Card> e reinjeta os
//      filhos do uso via <Slot/>;  (2) compound components: <Card.Header>/<Card.Body>/
//      <Card.Footer>;  (3) ícones: <Icon name> e o alias nomeado <SaveIcon/>.
// Self-contained (1 arquivo) p/ os oráculos verify{children,compound,icons}.js e p/ o
// build standalone do test.js. (O caso CROSS-FILE é provado pelo showcase react-app.)
import { Form, Component, Card, Column, Label, Slot, FormField, Button, Icon, SaveIcon } from "@vfp/core";

@Component()
export class Panel {
  render() {
    return (
      <Card title="Painel">
        <Slot />
      </Card>
    );
  }
}

@Form({ caption: "React Kit", width: 420, height: 360 })
export class ReactKitForm {
  salvar(): void { }
  render() {
    return (
      <Column gap={10} padding={12}>
        <Panel>
          <Label caption="Dentro do slot" transparent width={180} />
          <FormField label="Nome" bind="nome" width={180} />
        </Panel>

        <Card>
          <Card.Header>Cabecalho</Card.Header>
          <Card.Body>
            <FormField label="Email" bind="email" width={180} />
          </Card.Body>
          <Card.Footer>
            <Button flat caption="Salvar" variant="primary" icon="save" onClick="salvar" />
          </Card.Footer>
        </Card>

        <Icon name="search" size={20} />
        <SaveIcon size={18} color="primary" />
      </Column>
    );
  }
}
