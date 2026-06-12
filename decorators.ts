// decorators.ts — decorators de form (açúcar sobre a IR de form do foxts).
//
// Em RUNTIME são no-ops: existem só para a tipagem e para o oráculo em Node
// conseguir instanciar a classe. O transpilador (transpileForm) lê os decorators
// direto da AST e gera a IR -> SCX. Use com `foxc build arquivo.form.ts`.
//
//   @Form({ caption, width, height })            -> propriedades do form
//   @Label/@TextBox/@Button/... em um campo      -> ADD OBJECT <campo> AS <classe>
//   @Button em um método                          -> botão cujo Click chama o método

type Cfg = Record<string, any>;
type Deco = (target: any, key?: any, desc?: any) => any;

export function Form(_cfg: Cfg): ClassDecorator { return () => {}; }
export function Label(_cfg?: Cfg): Deco { return () => {}; }
export function TextBox(_cfg?: Cfg): Deco { return () => {}; }
export function EditBox(_cfg?: Cfg): Deco { return () => {}; }
export function Button(_cfg?: Cfg): Deco { return () => {}; }
export function CommandButton(_cfg?: Cfg): Deco { return () => {}; }
export function CheckBox(_cfg?: Cfg): Deco { return () => {}; }
export function ComboBox(_cfg?: Cfg): Deco { return () => {}; }
export function Grid(_cfg?: Cfg): Deco { return () => {}; }
export function Timer(_cfg?: Cfg): Deco { return () => {}; }
export function Shape(_cfg?: Cfg): Deco { return () => {}; }
export function Image(_cfg?: Cfg): Deco { return () => {}; }
export function OptionGroup(_cfg?: Cfg): Deco { return () => {}; }

// FormManager — navegação entre forms. O transpilador converte estas chamadas em
// comandos nativos do VFP (em runtime são no-ops, só para tipagem/oráculo):
//   FormManager.open(PedidoForm)                 -> DO FORM PedidoForm
//   FormManager.open(PedidoForm, { clienteId })  -> DO FORM PedidoForm WITH clienteId
//   const r = FormManager.showModal(PedidoForm)  -> DO FORM PedidoForm TO r
//   this.x = FormManager.open(PedidoForm)        -> DO FORM PedidoForm NAME This.x LINKED
export const FormManager = {
  open(_form: any, _params?: Record<string, any>): any {},
  showModal(_form: any, _params?: Record<string, any>): any {},
};

// Router — mesma navegação do FormManager, no estilo injetado. Suporta:
//   router.open(PedidoForm)              (singleton importado)
//   this.router.open(PedidoForm)         (em forms que extends FoxForm)
export interface Router {
  open(form: any, params?: Record<string, any>): any;
  showModal(form: any, params?: Record<string, any>): any;
}
export const router: Router = { open() {}, showModal() {} };

// @Route("pedido") — registra um nome de rota -> classe de form (mapa de rotas em
// dist/routes.json no build). O transpilador grava a rota na IR do form.
export function Route(_path: string): ClassDecorator { return () => {}; }

// Base opcional para o estilo OO: `extends FoxForm` habilita this.router/this.caption.
export class FoxForm {
  router: Router = router;
  caption: string = "";
  width: number = 400;
  height: number = 300;
}

// decorators de framework (lidos pelo compilador; no-ops em runtime)
export function Component(_cfg?: Cfg): ClassDecorator { return () => {}; }
export function Injectable(_cfg?: Cfg): ClassDecorator { return () => {}; }
export function Prop(): Deco { return () => {}; }

// Query builder -> VFP SQL local (SELECT ... INTO CURSOR). Compilado em build-time;
// em runtime é no-op (só tipagem). Ex.:
//   from("CLIENTE").where("ATIVO", true).orderBy("NOME").all("curAtivos")
//   -> SELECT * FROM CLIENTE WHERE ATIVO = .T. ORDER BY NOME INTO CURSOR curAtivos READWRITE
export interface Query {
  select(...fields: string[]): Query;
  where(field: string, value?: any): Query;
  whereRaw(expr: string): Query;
  join(table: string, on: string): Query;
  leftJoin(table: string, on: string): Query;
  groupBy(...fields: string[]): Query;
  having(expr: string): Query;
  orderBy(field: string): Query;
  all(cursor: string): void;       // SELECT ... INTO CURSOR <cursor>
  first(cursor: string): void;     // SELECT TOP 1 ... INTO CURSOR <cursor>
  first(): any;                    // SELECT TOP 1 ... -> objeto-linha (capturar: const c = ...first())
  count(): number;                 // SELECT COUNT(*) ... (capturar: const n = ...count())
}
export function from(_table: string): Query { return null as any; }

// Validação estilo Zod (Frente F). Em runtime é no-op (só tipagem); o transpilador lê
// o schema da AST e gera `PROCEDURE Validar<Nome>(toObj)` que devolve "" (válido) ou a
// 1ª mensagem de erro. Ex.:
//   export const Cliente = schema({ nome: str().required().min(3), idade: num().min(18) });
//   -> PROCEDURE ValidarCliente(toObj)  (use: MESSAGEBOX(ValidarCliente(loObj)) no Valid)
export interface StrRule { required(): StrRule; min(n: number): StrRule; max(n: number): StrRule; len(n: number): StrRule; email(): StrRule; refine(fn: (v: string) => boolean, msg: string): StrRule; }
export interface NumRule { required(): NumRule; min(n: number): NumRule; max(n: number): NumRule; int(): NumRule; refine(fn: (v: number) => boolean, msg: string): NumRule; }
export function str(): StrRule { return null as any; }
export function num(): NumRule { return null as any; }
export function schema(_shape: Record<string, StrRule | NumRule>): any { return null as any; }

// Menus VFP (Frente G) -> DEFINE MENU/PAD/POPUP/BAR. Em runtime é no-op (só tipagem);
// o transpilador lê a árvore da AST e gera `PROCEDURE <nome>` que monta e ativa o menu:
//   export const mainMenu = menu([
//     pad("Arquivo", [ bar("Novo", ClienteForm), separator(), bar("Sair", "CLEAR EVENTS") ]),
//     pad("Cadastros", [ bar("Clientes", ClientesForm) ]),
//   ]);
// bar(titulo, acao): acao = string (comando FoxPro) | classe de form (vira DO FORM X).
export interface MenuItem { __menuitem: true; }
export interface MenuPad { __menupad: true; }
export interface MenuDef { __menu: true; }
export function menu(_pads: MenuPad[]): MenuDef { return null as any; }
export function pad(_prompt: string, _bars: MenuItem[]): MenuPad { return null as any; }
export function bar(_prompt: string, _action?: string | Function): MenuItem { return null as any; }
export function separator(): MenuItem { return null as any; }

// tags JSX de layout/composição (usadas em render(); resolvidas em build-time).
// Tipadas como `any` para serem componentes JSX válidos sem runtime React.
export const Column: any = () => {};
export const Row: any = () => {};
export const View: any = () => {};
export const Container: any = () => {}; // <Container>/<Panel>: agrupa filhos num controle container (PARENT aninhado)
export const Panel: any = () => {};
export const PageFrame: any = () => {}; // <PageFrame> com <Page caption>: pageframe nativo (páginas reais)
export const Page: any = () => {};
export const GridColumn: any = () => {}; // <GridColumn header field width> dentro de <Grid>: coluna real do VFP
export const Fragment: any = () => {};
export const OpenFormButton: any = () => {};
export const SaveButton: any = () => {};
