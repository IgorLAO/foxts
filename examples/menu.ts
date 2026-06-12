// menu.ts — Frente G: menu de barra do VFP a partir de uma árvore declarativa.
//   export const mainMenu = menu([ pad("...", [ bar(...) | separator() ]) ])
//   -> PROCEDURE mainMenu  (DEFINE MENU/PAD/POPUP/BAR + ACTIVATE MENU NOWAIT)
// bar(titulo, acao): acao = classe de form (-> DO FORM X) ou string (comando FoxPro).
// Uso no app: DO mainMenu  (monta e ativa a barra de menus).
import { menu, pad, bar, separator } from "../decorators";

// forms referenciados pela navegação do menu (ambiente; vivem em outros arquivos)
declare class ClienteForm {}
declare class ClientesForm {}

export const mainMenu = menu([
  pad("Arquivo", [
    bar("Novo Cliente", ClienteForm),
    separator(),
    bar("Sair", "CLEAR EVENTS"),
  ]),
  pad("Cadastros", [
    bar("Clientes", ClientesForm),
  ]),
]);
