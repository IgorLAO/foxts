// main.ts — entrada de logica. Demonstra a resolucao DI cross-file (Frente G):
// `new ClienteService()` -> CREATEOBJECT, linkado pelo app.prg via SET PROCEDURE.
// Como ha um form de entrada (entry="DashboardForm" no vfp.config.json), o app.prg
// gerado faz: DO mainMenu (ativa a barra) + DO FORM Dashboard + READ EVENTS.
// main() fica como ponto de inicializacao/uso headless da logica.
import { ClienteService } from "./services/clienteservice";

export function main(): void {
  const svc = new ClienteService();
  svc.carregarAtivos();
}
