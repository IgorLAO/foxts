// diaspuro.form.ts — form com ZERO strings FoxPro. Todo Init/Gerar/Destroy é
// TypeScript de verdade; eventos de controle referenciam métodos pelo nome.
// Build:  node foxc.js build examples/diaspuro.form.ts -o dist/frmdiaspuro.scx

import {
  createCursor, Char, Logical, DateF, Int,
  dowOf, addDays, today, setDate, setCentury, clearEvents, cursorExists, closeCursor,
} from "../fox";

interface Dia {
  dia: DateF;
  semana: Char<13>;
  util: Logical;
}
interface Frm {
  [key: string]: any;
}

export const form = {
  name: "frmDiasPuro",
  caption: "Dias da semana (100% TypeScript)",
  width: 470,
  height: 430,
  properties: { AutoCenter: ".T.", BorderStyle: 2, MaxButton: ".F.", ShowWindow: 2 },
  controls: [
    { type: "label", name: "lblIni", top: 12, left: 16, caption: "Data inicial", properties: { AutoSize: ".T." } },
    { type: "textbox", name: "txtIni", top: 32, left: 16, width: 110, height: 24, properties: { Value: "{}" } },
    { type: "label", name: "lblFim", top: 12, left: 150, caption: "Data final", properties: { AutoSize: ".T." } },
    { type: "textbox", name: "txtFim", top: 32, left: 150, width: 110, height: 24, properties: { Value: "{}" } },
    // evento como NOME de método — não é FoxPro:
    { type: "commandbutton", name: "cmdGerar", top: 30, left: 284, width: 80, height: 27, caption: "Gerar",
      methods: { Click: "Gerar" } },
    { type: "grid", name: "grdDias", top: 70, left: 16, width: 438, height: 340,
      properties: { ColumnCount: -1, ReadOnly: ".T.", DeleteMark: ".F." } },
  ],
};

// ----- TODA a lógica em TypeScript -----

export function Init(this: Frm): void {
  setDate("DMY");
  setCentury(true);
  this.txtIni.value = today();
  this.txtFim.value = addDays(today(), 13);
  this.Gerar();
}

export function Gerar(this: Frm): void {
  if (cursorExists("curdias")) {
    closeCursor("curdias");
  }
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

export function NomeDia(tnDow: Int): Char<13> {
  if (tnDow === 1) return "Domingo";
  if (tnDow === 2) return "Segunda-feira";
  if (tnDow === 3) return "Terca-feira";
  if (tnDow === 4) return "Quarta-feira";
  if (tnDow === 5) return "Quinta-feira";
  if (tnDow === 6) return "Sexta-feira";
  return "Sabado";
}

// ternário -> IIF
export function ehDiaUtil(tnDow: Int): boolean {
  return tnDow !== 1 && tnDow !== 7 ? true : false;
}

export function Destroy(this: Frm): void {
  if (cursorExists("curdias")) {
    closeCursor("curdias");
  }
  clearEvents();
}

export const cases: [string, any[]][] = [
  ["NomeDia", [3]],
  ["NomeDia", [7]],
  ["ehDiaUtil", [4]],
  ["ehDiaUtil", [1]],
];
