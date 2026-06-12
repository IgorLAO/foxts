// nav.form.ts — navegação entre forms via FormManager (-> DO FORM ...).
import { Form, Button, FormManager } from "../decorators";

declare class PedidoForm {}

@Form({ caption: "Cliente", width: 400, height: 300 })
export class ClienteForm {
  pedidoForm?: PedidoForm;

  @Button({ caption: "Pedidos", top: 10, left: 10 })
  abrirPedido(): void {
    FormManager.open(PedidoForm, { clienteId: 123 });
  }

  abrirModal(): void {
    const ok = FormManager.showModal(PedidoForm);
  }

  abrirRef(): void {
    this.pedidoForm = FormManager.open(PedidoForm);
  }
}
