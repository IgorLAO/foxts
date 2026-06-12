// diascursor.form.ts — form com a LÓGICA INTEIRA em TypeScript, inclusive o
// cursor e o acesso aos controles (this.*). Só Init/Destroy continuam como glue
// FoxPro mínima. Build:  foxc build examples/diascursor.form.ts -o dist/frmdiascur.scx

import { createCursor, Char, Logical, DateF, Int, dowOf, addDays } from "../fox";

interface Dia {
  dia: DateF;
  semana: Char<13>;
  util: Logical;
}

// `this` do form — index signature deixa o acesso a controles/métodos passar
// como `any` (pragmático); o transpilador mapeia this.x.y -> This.x.y.
interface FrmDias {
  [key: string]: any;
}

export const form = {
  name: "frmDiasCur",
  caption: "Dias da semana (cursor + logica em TypeScript)",
  width: 470,
  height: 430,
  properties: { AutoCenter: ".T.", BorderStyle: 2, MaxButton: ".F.", ShowWindow: 2 },
  methods: {
    // glue mínima em FoxPro:
    Init: ["SET DATE DMY", "This.txtIni.Value = DATE()", "This.txtFim.Value = DATE() + 13", "This.Gerar()"].join("\n"),
    Destroy: ['IF USED("curdias")', "   USE IN curdias", "ENDIF", "CLEAR EVENTS"].join("\n"),
  },
  controls: [
    { type: "label", name: "lblIni", top: 12, left: 16, caption: "Data inicial", properties: { AutoSize: ".T." } },
    { type: "textbox", name: "txtIni", top: 32, left: 16, width: 110, height: 24, properties: { Value: "{}" } },
    { type: "label", name: "lblFim", top: 12, left: 150, caption: "Data final", properties: { AutoSize: ".T." } },
    { type: "textbox", name: "txtFim", top: 32, left: 150, width: 110, height: 24, properties: { Value: "{}" } },
    { type: "commandbutton", name: "cmdGerar", top: 30, left: 284, width: 80, height: 27, caption: "Gerar",
      methods: { Click: "ThisForm.Gerar()" } },
    { type: "grid", name: "grdDias", top: 70, left: 16, width: 438, height: 340,
      properties: { ColumnCount: -1, ReadOnly: ".T.", DeleteMark: ".F." } },
  ],
};

// --- LÓGICA em TypeScript (transpilada para dentro do SCX) ---

export function NomeDia(tnDow: Int): Char<13> {
  if (tnDow === 1) return "Domingo";
  if (tnDow === 2) return "Segunda-feira";
  if (tnDow === 3) return "Terca-feira";
  if (tnDow === 4) return "Quarta-feira";
  if (tnDow === 5) return "Quinta-feira";
  if (tnDow === 6) return "Sexta-feira";
  return "Sabado";
}

export function ehDiaUtil(tnDow: Int): boolean {
  return tnDow !== 1 && tnDow !== 7;
}

// Gerar: cria o cursor, preenche uma linha por dia e liga na grade — tudo TS.
export function Gerar(this: FrmDias): void {
  const cur = createCursor<Dia>("curdias");
  let d: DateF = this.txtIni.value;
  const fim: DateF = this.txtFim.value;
  while (d <= fim) {
    let dow: Int = dowOf(d);
    cur.append({ dia: d, semana: this.NomeDia(dow), util: this.ehDiaUtil(dow) });
    d = addDays(d, 1);
  }
  this.grdDias.recordSource = "curdias";
}

// casos de oráculo: métodos de lógica pura (Gerar usa this/cursor, validado pelas linhas geradas)
export const cases: [string, any[]][] = [
  ["NomeDia", [2]],
  ["NomeDia", [7]],
  ["ehDiaUtil", [3]],
  ["ehDiaUtil", [7]],
];
