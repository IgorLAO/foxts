import { Injectable } from "@vfp/core";

@Injectable()
export class ClienteService {
  buscar(): void {}
}

@Injectable()
export class PedidoService {
  constructor(private clientes: ClienteService) {}
  salvar(): void {
    this.clientes.buscar();
  }
}
