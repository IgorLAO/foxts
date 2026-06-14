// anim.form.tsx — animacao + estilo no limite. <Timer onTimer> chama tick() a cada
// 50ms que MUTA a largura do <Shape> "bar" (barra de progresso que enche e reinicia).
// Estado: phase (campo -> propriedade do form). Estilo: fundo escuro do form, shapes
// com cor solida + cantos arredondados (rounded) + borda, tipografia (fontSize/
// fontName/bold/textAlign), tudo type-safe. Provado no VFP pelo build do test.js.
import { Form, FoxForm, Column, Label, Shape, Timer } from "@vfp/core";

@Form({
  caption: "Anim",
  width: 380,
  height: 220,
  props: { BackColor: "RGB(15, 23, 42)" },
})
export class AnimForm extends FoxForm {
  phase: number = 0;

  tick(): void {
    this.phase = this.phase + 1;
    this.bar.width = this.bar.width + 10;
    if (this.bar.width > 300) {
      this.bar.width = 6;
    }
  }

  render() {
    return (
      <Column gap={12} padding={18}>
        <Label caption="Carregando" transparent bold fontSize={18} fontName="Segoe UI" textAlign="center" width={320} height={28} textColor="#e2e8f0" />
        <Shape name="track" width={320} height={16} color="#1e293b" rounded={12} borderColor="#334155" borderWidth={1} />
        <Shape name="bar" width={6} height={16} color="#7c3aed" rounded={12} />
        <Timer name="tmr" width={0} height={0} interval={50} onTimer="tick" />
      </Column>
    );
  }
}
