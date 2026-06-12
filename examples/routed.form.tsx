// routed.form.tsx — resto da Frente C: @Route + this.router + Init com parâmetro.
//   @Route("cliente")          -> entra no mapa de rotas (routes.json no build)
//   this.router.open(X, {...}) -> DO FORM X WITH ... (igual ao FormManager)
//   Init(clienteId)            -> LPARAMETERS clienteId (o form destino recebe params)
import { Form, Route, FoxForm, Column, Label, OpenFormButton } from "@vfp/core";

declare class PedidoForm {}

@Route("cliente")
@Form({ caption: "Cliente", width: 420, height: 300 })
export class ClienteForm extends FoxForm {
  // recebe parâmetros do form que o abriu (DO FORM ClienteForm WITH clienteId)
  Init(clienteId: number): void {
    this.caption = "Cliente " + clienteId;
  }

  // handler: navega para outro form passando parâmetro
  abrirPedido(): void {
    this.router.open(PedidoForm, { clienteId: 10 });
  }

  render() {
    return (
      <Column gap={10}>
        <Label caption="Cadastro de cliente" />
        <OpenFormButton form={PedidoForm} caption="Pedidos" />
      </Column>
    );
  }
}
