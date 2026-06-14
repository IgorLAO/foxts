// diasclass.form.ts — o form como CLASSE TypeScript tipada.
// `this.txtIni` autocompleta (é um TextBox), `this.grdDias.recordSource` idem.
// Build:  node foxc.js build examples/diasclass.form.ts -o dist/frmdiasclass.scx

import {
  Form, Label, TextBox, CommandButton, Grid,
  createCursor, Char, Logical, DateF, Int,
  dowOf, addDays, today, setDate, setCentury, clearEvents, cursorExists, closeCursor,
} from "../fox";

interface Dia {
  dia: DateF;
  semana: Char<13>;
  util: Logical;
}

export default class frmDiasClass extends Form {
  caption = "Dias da semana (classe TypeScript tipada)";
  width = 470;
  height = 430;
  props = { AutoCenter: ".T.", BorderStyle: 2, MaxButton: ".F.", ShowWindow: 2 };

  // controles como campos TIPADOS — `this.<nome>` autocompleta nos métodos
  lblIni = new Label({ top: 12, left: 16, caption: "Data inicial", props: { AutoSize: ".T." } });
  txtIni = new TextBox<DateF>({ top: 32, left: 16, width: 110, height: 24, props: { Value: "{}" } });
  lblFim = new Label({ top: 12, left: 150, caption: "Data final", props: { AutoSize: ".T." } });
  txtFim = new TextBox<DateF>({ top: 32, left: 150, width: 110, height: 24, props: { Value: "{}" } });
  cmdGerar = new CommandButton({ top: 30, left: 284, width: 80, height: 27, caption: "Gerar", onClick: "Gerar" });
  grdDias = new Grid({ top: 70, left: 16, width: 438, height: 340, props: { ColumnCount: -1, ReadOnly: ".T.", DeleteMark: ".F." } });

  Init(): void {
    setDate("DMY");
    setCentury(true);
    this.txtIni.value = today();          // autocomplete: txtIni é TextBox, .value
    this.txtFim.value = addDays(today(), 13);
    this.Gerar();                          // autocomplete: método da classe
  }

  Gerar(): void {
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
    this.grdDias.recordSource = "curdias";  // autocomplete: grdDias é Grid, .recordSource
  }

  NomeDia(tnDow: Int): Char<13> {
    if (tnDow === 1) return "Domingo";
    if (tnDow === 2) return "Segunda-feira";
    if (tnDow === 3) return "Terca-feira";
    if (tnDow === 4) return "Quarta-feira";
    if (tnDow === 5) return "Quinta-feira";
    if (tnDow === 6) return "Sexta-feira";
    return "Sabado";
  }

  ehDiaUtil(tnDow: Int): boolean {
    return tnDow !== 1 && tnDow !== 7 ? true : false;
  }

  Destroy(): void {
    if (cursorExists("curdias")) {
      closeCursor("curdias");
    }
    clearEvents();
  }
}

export const cases: [string, any[]][] = [
  ["NomeDia", [2]],
  ["NomeDia", [7]],
  ["ehDiaUtil", [4]],
  ["ehDiaUtil", [1]],
];
