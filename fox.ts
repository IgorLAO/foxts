// fox.ts — a "stdlib" do foxts: tipos Fox-flavored + runtime JS.
//
// Os TIPOS (Char<N>, Numeric<W,D>, ...) carregam a largura/precisão do DBF que o
// `string`/`number` puro do TS não tem — o transpilador os lê para gerar o
// `CREATE CURSOR`. O RUNTIME (classe Cursor, dowOf, addDays) só existe para o
// ORÁCULO: quando o mesmo .ts roda em Node, ele executa de verdade e dá o
// resultado a comparar com o FoxPro gerado. No app VFP final nada disto roda —
// o transpilador substitui cada chamada pelo comando FoxPro equivalente.

// ---- tipos de coluna (a largura/precisão vira C(n) / N(w,d) no DBF) ----
export type Char<N extends number> = string;
export type Numeric<W extends number, D extends number = 0> = number;
export type Int = number;
export type Logical = boolean;
export type DateF = Date;

// ---- cursor (runtime apenas para o oráculo em Node) ----
export class Cursor<T> {
  private rows: T[] = [];
  private pos = 0;
  constructor(public readonly name: string) {}
  append(row: T): void { this.rows.push(row); }
  goTop(): void { this.pos = 0; }
  goBottom(): void { this.pos = this.rows.length - 1; }
  skip(): void { this.pos += 1; }
  eof(): boolean { return this.pos >= this.rows.length; }
  bof(): boolean { return this.pos < 0; }
  count(): number { return this.rows.length; }
  field<K extends keyof T>(col: K): T[K] { return this.rows[this.pos][col]; }
  use(_keep: boolean): void { /* USE IN — no-op no oráculo */ }
}
export function createCursor<T>(name: string): Cursor<T> { return new Cursor<T>(name); }

// ---- builtins de data (mapeados pelo transpilador para DOW/+/DATE) ----
export function dowOf(d: DateF): Int { return d.getDay() + 1; }          // 1=Domingo..7=Sabado (= DOW(d,1))
export function addDays(d: DateF, n: Int): DateF {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}
export function today(): DateF { return new Date(); }

// ---- controles de UI (form como CLASSE tipada) ----
//
// `this.<controle>` autocompleta porque cada campo é tipado (TextBox/Grid/...);
// o transpilador, porém, ignora o runtime e emite `This.x.y`. As props comuns
// (value, caption, recordSource) autocompletam; o índice `[k]: any` deixa
// acessar qualquer propriedade VFP sem erro.

export interface ControlConfig {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  caption?: string;
  onClick?: string;        // nome de um método do form -> ThisForm.<m>()
  onInit?: string;
  onValid?: string;
  onInteractiveChange?: string;
  onGotFocus?: string;
  onLostFocus?: string;
  props?: Record<string, string | number | boolean>; // props VFP (RHS verbatim)
}

class BaseControl {
  visible: boolean = true;
  enabled: boolean = true;
  [key: string]: any; // qualquer outra propriedade VFP
  constructor(public config: ControlConfig = {}) {}
}

// Os controles que carregam VALOR são GENÉRICOS no tipo do valor: `new TextBox<number>()`
// faz `txt.value = "x"` virar ERRO de compilação (em VFP isso é erro de RUNTIME num
// campo N). O `value: T` sobrepõe o index signature `[k]: any` SÓ p/ a chave `value`,
// então outras props VFP continuam livres. Default `T = string | number | Date | boolean`
// (os tipos que um campo VFP pode conter) preserva os usos atuais sem anotação.
type FieldValue = string | number | Date | boolean;

export class Label extends BaseControl { caption: string = ""; forecolor: number = 0; }
export class TextBox<T extends FieldValue = FieldValue> extends BaseControl { value: T = null as any; }
export class EditBox extends BaseControl { value: string = ""; }
export class CommandButton extends BaseControl { caption: string = ""; }
export class CheckBox extends BaseControl { value: boolean = false; caption: string = ""; }
export class ComboBox<T extends FieldValue = FieldValue> extends BaseControl { value: T = null as any; rowSource: string = ""; }
export class Grid extends BaseControl { recordSource: string = ""; readOnly: boolean = false; columnCount: number = -1; }
export class Timer extends BaseControl { interval: number = 0; }
export class Shape extends BaseControl {}
export class Image extends BaseControl {}
export class OptionGroup extends BaseControl { value: number = 1; }

/** classe base do form — a subclasse declara os controles como campos tipados. */
export class Form {
  caption: string = "";
  width: number = 400;
  height: number = 300;
  visible: boolean = true;
}

// ---- comandos e builtins do VFP (substituem as strings FoxPro) ----
export function setDate(fmt: string): void { /* -> SET DATE <fmt> */ }
export function setCentury(on: boolean): void { /* -> SET CENTURY ON/OFF */ }
export function clearEvents(): void { /* -> CLEAR EVENTS */ }
export function cursorExists(name: string): boolean { return false; }      // -> USED(name)
export function reccount(name: string): number { return 0; }               // -> RECCOUNT(name)
export function closeCursor(name: string): void { /* -> USE IN (name) */ }
export function empty(x: any): boolean { return x === null || x === undefined || x === "" || x === 0; } // -> EMPTY(x)
export function inList<T>(x: T, ...vals: T[]): boolean { return vals.indexOf(x) >= 0; }  // -> INLIST(x, ...)
export function messageBox(msg: string): void { /* -> MESSAGEBOX(msg) */ }
