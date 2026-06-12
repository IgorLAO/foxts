// ola.form.ts — o form mais simples possível: um rótulo e um botão.
// Build:  node foxc.js build examples/ola.form.ts -o dist/frmola.scx

export const form = {
  name: "frmOla",
  caption: "Ola Mundo",
  width: 300,
  height: 150,
  properties: { AutoCenter: ".T.", ShowWindow: 2 },
  methods: { Destroy: "CLEAR EVENTS" }, // libera o READ EVENTS ao fechar
  controls: [
    { type: "label", name: "lblMsg", top: 30, left: 30, width: 240,
      caption: "Clique no botao", properties: { AutoSize: ".T." } },
    { type: "commandbutton", name: "cmdOi", top: 70, left: 100, width: 100, height: 30,
      caption: "Dizer Oi", methods: { Click: "ThisForm.Saudar()" } },
  ],
};

// um método do form, escrito em TypeScript
export function Saudar(this: any): void {
  this.lblMsg.caption = "Ola, mundo!";
}
