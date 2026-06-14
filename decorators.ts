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

// ───────────────────────────────────────────────────────────────────────────
// Tipagem JSX (DX) — abordagem: COMPONENTES TIPADOS (FC<Props>) com dual-use.
//
// Cada tag de controle/layout é exportada como uma `DualTag<Props>`: uma interface
// callable com DUAS assinaturas de chamada — a 1ª como FÁBRICA DE DECORATOR
// (`@TextBox({...})`), a 2ª como TAG JSX (`<TextBox .../>`). AS DUAS usam o MESMO
// `Props` tipado, então um atributo errado (`widht`, `hraeder`) é rejeitado nas DUAS
// posições (decorator e JSX). A ordem importa: a assinatura de decorator vem 1ª p/
// `@Tag({...})` resolver pra ela; o JSX resolve props pela 2ª (TSX checa props de
// uma tag capitalizada contra a assinatura de chamada do valor importado).
//
// Não usamos `JSX.IntrinsicElements` nominal porque todas as tags daqui são
// IMPORTADAS e CAPITALIZADAS — em TSX, tags capitalizadas resolvem pelo VALOR
// importado (este `DualTag`), nunca pelo mapa de IntrinsicElements (esse só rege
// tags minúsculas). Os `Props` abaixo derivam dos atributos que o transpile.js
// realmente consome (readJsxAttrs/applyStyle/controlLeaf/gridLeaf/...).
// ───────────────────────────────────────────────────────────────────────────

/** Tag de uso duplo: fábrica de decorator (1ª) + componente JSX tipado (2ª). */
export interface DualTag<P extends object = {}> {
  (cfg?: P): Deco;        // @Tag({...})  — caminho decorator
  (props: P): JSX.Element; // <Tag .../>   — caminho JSX (checa os props)
}

/** Estilo/utilitários comuns a todo controle visual (applyStyle/applyClass). */
export interface StyleProps {
  variant?: string;    // -> BackColor (paleta do tema OU hex "#1e293b") + ForeColor branco
  color?: string;      // -> BackColor (nome do tema ou hex)
  textColor?: string;  // -> ForeColor (nome do tema ou hex)
  disabled?: boolean;  // -> Enabled = .F.
  bold?: boolean;      // -> FontBold = .T.
  italic?: boolean;    // -> FontItalic = .T.
  transparent?: boolean; // -> BackStyle = 0 (fundo transparente; Label/Shape/Container)
  rounded?: number;    // -> Curvature 0-90 (cantos arredondados; Shape/Container)
  borderColor?: string; // -> BorderColor (Shape/Container)
  borderWidth?: number; // -> BorderWidth (Shape/Container)
  fontSize?: number;   // -> FontSize
  fontName?: string;   // -> FontName ("Segoe UI")
  textAlign?: "left" | "center" | "right" | "auto"; // -> Alignment (alinhamento do texto)
  class?: string;      // utilitários "w-120 h-30 t-18 primary bg-red text-white text-center bold italic"
}

/** Posição/tamanho de um item dentro do layout flex (e config de decorator). */
export interface FlexItemProps {
  width?: number;
  height?: number;
  top?: number;        // usado no caminho decorator (@Label({ top, left }))
  left?: number;
  grow?: number | boolean; // estica no eixo principal (flex-grow)
  flexGrow?: number;
  alignSelf?: "start" | "center" | "end" | "stretch"; // sobrepõe o align do pai
}

/** Props de um controle simples (Label/TextBox/Button/...) como tag/decorator. */
export interface ControlProps extends StyleProps, FlexItemProps {
  name?: string;       // nome do controle no SCX (senão derivado de bind/contador)
  bind?: string;       // -> ControlSource = "ThisForm.<bind>" (cria o membro)
  caption?: string;
  value?: string | number; // valor inicial (-> Value)
  interval?: number;   // Timer: intervalo em ms (-> Interval)
  src?: string;        // <Image src> -> Picture (PNG/JPG; alpha suportado)
  picture?: string;    // sinonimo de src
  stretch?: number;    // Image.Stretch: 0=clip, 1=isometrico, 2=esticar
  // eventos: o valor é o nome de um método do form -> ThisForm.<metodo>() no evento.
  onClick?: string;
  onDblClick?: string;
  onInit?: string;
  onTimer?: string;            // Timer.Timer (animação por tick)
  onInteractiveChange?: string;
  onGotFocus?: string;
  onLostFocus?: string;
  onMouseEnter?: string;
  onMouseLeave?: string;
  props?: Record<string, string | number | boolean>; // props VFP cruas (RHS verbatim)
}

export function Form(_cfg: Cfg): ClassDecorator { return () => {}; }
export const Label: DualTag<ControlProps> = (() => () => {}) as any;
export const TextBox: DualTag<ControlProps> = (() => () => {}) as any;
export const EditBox: DualTag<ControlProps> = (() => () => {}) as any;
export const Button: DualTag<ControlProps> = (() => () => {}) as any;
export const CommandButton: DualTag<ControlProps> = (() => () => {}) as any;
export const CheckBox: DualTag<ControlProps> = (() => () => {}) as any;
export const ComboBox: DualTag<ControlProps> = (() => () => {}) as any;
export const Timer: DualTag<ControlProps> = (() => () => {}) as any;
export const Shape: DualTag<ControlProps> = (() => () => {}) as any;
export const Image: DualTag<ControlProps> = (() => () => {}) as any;
export const OptionGroup: DualTag<ControlProps> = (() => () => {}) as any;

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
  // acesso dinamico aos controles em metodos: this.shpBar.width, this.tmr.enabled, ...
  // (os controles vem do render()/JSX, nao sao campos declarados — o index libera o uso).
  [key: string]: any;
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

// ───────────────────────────────────────────────────────────────────────────
// tags JSX de layout/composição (usadas em render(); resolvidas em build-time).
// Agora TIPADAS (FC<Props>) p/ o JSX ficar type-safe no editor — typos de atributo
// (`widht`, `justfy`, `hraeder`) viram erro de compilação, sem perder o uso como
// tag JSX. Os Props derivam dos atributos que parseJsx/gridLeaf/containerLeaf
// consomem em transpile.js. `children` é opcional (o foxts lê os filhos da AST).
// ───────────────────────────────────────────────────────────────────────────

type FC<P extends object = {}> = (props: P) => JSX.Element;

/** alinhamento no eixo principal (justify) / cruzado (align) de um box flex. */
type Justify = "start" | "center" | "end" | "between" | "around" | "evenly";
type Align = "start" | "center" | "end" | "stretch";

/** <Column>/<Row>/<View>: caixa flex resolvida em layout no build. */
export interface BoxProps extends FlexItemProps {
  gap?: number;
  padding?: number;
  pad?: number;
  justify?: Justify;     // eixo principal
  align?: Align;         // eixo cruzado
  wrap?: boolean;        // flex-wrap (requer width/height fixo)
  flexWrap?: "wrap" | "nowrap";
  flexDirection?: "row" | "column"; // só <View> usa p/ escolher a direção
  absolute?: boolean;    // overlay: filhos posicionados por left/top (sobre uma imagem de fundo)
  children?: any;
}

export const Column: FC<BoxProps> = (() => {}) as any;
export const Row: FC<BoxProps> = (() => {}) as any;
export const View: FC<BoxProps> = (() => {}) as any;
export const Fragment: FC<{ children?: any }> = (() => {}) as any;

/** <Container>/<Panel>: controle `container` do VFP com filhos aninhados (PARENT). */
export interface ContainerProps extends StyleProps, FlexItemProps {
  name?: string;
  gap?: number;
  padding?: number;
  pad?: number;
  justify?: Justify;
  align?: Align;
  flexDirection?: "row" | "column";
  children?: any;
}
export const Container: FC<ContainerProps> = (() => {}) as any;
export const Panel: FC<ContainerProps> = (() => {}) as any;

/** <PageFrame>: pageframe nativo; só aceita <Page> como filho direto. */
export interface PageFrameProps extends StyleProps, FlexItemProps {
  name?: string;
  children?: any;
}
export const PageFrame: FC<PageFrameProps> = (() => {}) as any;

/** <Page caption>: uma aba do pageframe (PageCount + PageN.Caption). */
export interface PageProps {
  caption?: string;
  gap?: number;
  padding?: number;
  pad?: number;
  flexDirection?: "row" | "column";
  children?: any;
}
export const Page: FC<PageProps> = (() => {}) as any;

/** <Grid source><GridColumn/></Grid>: grid com colunas reais ligado a um cursor. */
export interface GridProps extends StyleProps, FlexItemProps {
  name?: string;
  source?: string;        // alias do cursor -> RecordSource (RecordSourceType=1)
  recordSource?: string;  // sinônimo de source
  children?: any;
}
export const Grid: FC<GridProps> = (() => {}) as any;

/** <GridColumn header field width>: uma coluna real (ColumnN.ControlSource/Width). */
export interface GridColumnProps {
  header?: string;        // caption do header (reaplicado no Init pós-vinculação)
  field?: string;         // campo do cursor -> ColumnN.ControlSource
  bind?: string;          // sinônimo de field
  width?: number;
}
export const GridColumn: FC<GridColumnProps> = (() => {}) as any;

/** <OpenFormButton form={X}>: botão que faz DO FORM X [WITH ...].
 *  Atributos extras (além dos conhecidos) viram os parâmetros do WITH, por isso
 *  a index signature permissiva — mas os atributos conhecidos continuam tipados. */
export interface OpenFormButtonProps extends StyleProps, FlexItemProps {
  form: unknown;          // classe do form de destino (obrigatório)
  caption?: string;
  [param: string]: unknown; // parâmetros extras -> WITH (clienteId={...}, etc.)
}
export const OpenFormButton: FC<OpenFormButtonProps> = (() => {}) as any;

/** <SaveButton caption variant>: botão "Salvar" pronto (ou @Component próprio). */
export interface SaveButtonProps extends StyleProps, FlexItemProps {
  caption?: string;
}
export const SaveButton: FC<SaveButtonProps> = (() => {}) as any;
