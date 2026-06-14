// forms/splash.form.tsx — tela ANIMADA (criatividade: Shapes + Timer + programacao).
// Demonstra animacao real em VFP: um <Timer interval onTimer="tick"> chama o metodo
// tick() do form a cada 60ms, que MUTA as propriedades dos <Shape> (largura/posicao)
// -> barra de progresso que enche e reinicia, e um "cometa" que cruza a tela.
// Estado persistente: o campo `phase` vira propriedade do form (default 0).
// extends FoxForm libera this.<controle> nos metodos (acesso dinamico aos controles).
import { Form, FoxForm, Column, Row, Label, Shape, Timer } from "@vfp/core";

@Form({
  caption: "FoxTS - Animacao",
  width: 460,
  height: 300,
  props: { BackColor: "RGB(15, 23, 42)" }, // slate-900: fundo escuro do form
})
export class SplashForm extends FoxForm {
  phase: number = 0; // contador de animacao (propriedade do form)

  // chamado pelo Timer a cada tick: anima a barra e o cometa mutando os Shapes.
  tick(): void {
    this.phase = this.phase + 1;
    // barra de progresso: cresce e reinicia
    this.barFill.width = this.barFill.width + 12;
    if (this.barFill.width > 372) {
      this.barFill.width = 6;
    }
    // cometa: desliza para a direita e volta ao inicio
    this.dot.left = this.dot.left + 10;
    if (this.dot.left > 420) {
      this.dot.left = 24;
    }
  }

  render() {
    return (
      <Column gap={14} padding={22}>
        <Label
          caption="Carregando o sistema"
          transparent
          bold
          fontSize={20}
          fontName="Segoe UI"
          textColor="#e2e8f0"
        />
        <Label caption="preparando cursores e cache" transparent italic fontSize={11} textColor="#94a3b8" />
        <Shape name="barTrack" width={372} height={18} color="#1e293b" rounded={14} borderColor="#334155" borderWidth={1} />
        <Shape name="barFill" width={6} height={18} color="#7c3aed" rounded={14} />
        <Row gap={10} height={26}>
          <Shape name="dot" width={20} height={20} color="#22d3ee" rounded={90} />
          <Label caption="online" transparent bold fontSize={12} textColor="#22d3ee" />
        </Row>
        <Timer name="tmrAnim" width={0} height={0} interval={60} onTimer="tick" />
      </Column>
    );
  }
}
