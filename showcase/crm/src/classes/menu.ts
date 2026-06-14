// classes/menu.ts — menu de barra do VFP (Frente G). O `vfp build` acha o menu()
// (pre-passe collectMenus) e emite `DO mainMenu` no app.prg, ativando a barra.
// bar(titulo, FormClass) -> DO FORM FormClass; bar(titulo, "cmd") -> comando verbatim.
import { menu, pad, bar, separator } from "@vfp/core";

// forms referenciados pela navegacao do menu (ambiente; vivem nos .form.tsx)
declare class ClientesForm {}
declare class PedidosForm {}
declare class ClienteForm {}

export const mainMenu = menu([
  pad("Cadastros", [
    bar("Clientes", ClientesForm),
    bar("Pedidos", PedidosForm),
  ]),
  pad("Arquivo", [
    bar("Novo Cliente", ClienteForm),
    separator(),
    bar("Sair", "CLEAR EVENTS"),
  ]),
]);
