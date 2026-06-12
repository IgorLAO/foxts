// dias.form.ts — UM arquivo de autoria para o pipeline completo.
//
//   foxc build examples/dias.form.ts -o dist/frmdiasts.scx
//
// O `form` é o layout (objeto declarativo); a glue específica do VFP (This.*,
// cursores, grid) fica como string FoxPro. A LÓGICA PURA (NomeDia, ehDiaUtil)
// é escrita em TypeScript tipado e o foxts a transpila para dentro do SCX.

export const form = {
  name: "frmDiasTS",
  caption: "Dias da semana (logica em TypeScript)",
  width: 470,
  height: 430,
  properties: { AutoCenter: ".T.", BorderStyle: 2, MaxButton: ".F.", ShowWindow: 2 },
  methods: {
    // --- glue VFP (objetos/dados): segue como FoxPro por enquanto ---
    Init: [
      "SET DATE DMY",
      "SET CENTURY ON",
      "This.txtIni.Value = DATE()",
      "This.txtFim.Value = DATE() + 13",
      "This.Gerar()",
    ].join("\n"),
    Gerar: [
      "LOCAL ldIni, ldFim, ldDia, lnDow",
      "ldIni = This.txtIni.Value",
      "ldFim = This.txtFim.Value",
      'IF VARTYPE(ldIni) # "D" OR VARTYPE(ldFim) # "D" OR EMPTY(ldIni) OR EMPTY(ldFim)',
      '   This.lblAviso.Caption = "Informe as duas datas."',
      "   RETURN",
      "ENDIF",
      "IF ldFim < ldIni",
      '   This.lblAviso.Caption = "Data final menor que a inicial."',
      "   RETURN",
      "ENDIF",
      'This.lblAviso.Caption = ""',
      'This.grdDias.RecordSource = ""',
      'IF USED("curdias")',
      "   USE IN curdias",
      "ENDIF",
      "CREATE CURSOR curdias (dia D, semana C(13), util C(3))",
      "ldDia = ldIni",
      "DO WHILE ldDia <= ldFim",
      "   lnDow = DOW(ldDia, 1)",
      // usa os DOIS metodos transpilados do TypeScript:
      '   INSERT INTO curdias VALUES (ldDia, ThisForm.NomeDia(lnDow), IIF(ThisForm.ehDiaUtil(lnDow), "Sim", "Nao"))',
      "   ldDia = ldDia + 1",
      "ENDDO",
      "GO TOP IN curdias",
      "WITH This.grdDias",
      '   .RecordSource = "curdias"',
      "   .ReadOnly = .T.",
      "   .DeleteMark = .F.",
      '   .Columns(1).Header1.Caption = "Dia"',
      "   .Columns(1).Width = 100",
      '   .Columns(2).Header1.Caption = "Dia da semana"',
      "   .Columns(2).Width = 200",
      '   .Columns(3).Header1.Caption = "Dia util"',
      "   .Columns(3).Width = 80",
      "   .Refresh()",
      "ENDWITH",
    ].join("\n"),
    Destroy: ['IF USED("curdias")', "   USE IN curdias", "ENDIF", "CLEAR EVENTS"].join("\n"),
  },
  controls: [
    { type: "label", name: "lblIni", top: 12, left: 16, caption: "Data inicial", properties: { AutoSize: ".T." } },
    { type: "textbox", name: "txtIni", top: 32, left: 16, width: 110, height: 24, properties: { Value: "{}" } },
    { type: "label", name: "lblFim", top: 12, left: 150, caption: "Data final", properties: { AutoSize: ".T." } },
    { type: "textbox", name: "txtFim", top: 32, left: 150, width: 110, height: 24, properties: { Value: "{}" } },
    { type: "commandbutton", name: "cmdGerar", top: 30, left: 284, width: 80, height: 27, caption: "Gerar",
      methods: { Click: "ThisForm.Gerar()" } },
    { type: "label", name: "lblAviso", top: 34, left: 376, width: 80, caption: "", properties: { AutoSize: ".T.", ForeColor: "255,0,0" } },
    { type: "grid", name: "grdDias", top: 70, left: 16, width: 438, height: 340,
      properties: { ColumnCount: -1, ReadOnly: ".T.", DeleteMark: ".F." } },
  ],
};

// --- LÓGICA PURA em TypeScript (transpilada pelo foxts para dentro do SCX) ---

export function NomeDia(tnDow: number): string {
  if (tnDow === 1) return "Domingo";
  if (tnDow === 2) return "Segunda-feira";
  if (tnDow === 3) return "Terca-feira";
  if (tnDow === 4) return "Quarta-feira";
  if (tnDow === 5) return "Quinta-feira";
  if (tnDow === 6) return "Sexta-feira";
  return "Sabado";
}

export function ehDiaUtil(tnDow: number): boolean {
  return tnDow !== 1 && tnDow !== 7;
}

// casos de verificação-oráculo: cada método (já dentro do SCX) vs a mesma função em Node
export const cases: [string, any[]][] = [
  ["NomeDia", [1]],
  ["NomeDia", [2]],
  ["NomeDia", [7]],
  ["ehDiaUtil", [1]],
  ["ehDiaUtil", [3]],
  ["ehDiaUtil", [7]],
];
