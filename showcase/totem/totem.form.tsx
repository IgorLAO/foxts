// totem.form.tsx — a tela "Seu pedido e para?" do app React (Pwi_React_Totem) recriada
// em FoxTS -> SCX nativo do VFP. Layout flex nativo (Column/Row), tipografia/cores do
// tema do React (bg #FAFAFA, fonte #070707). Os cards arredondados com foto+sombra e o
// botao pill vem como PNG (gerados por build_totem.js no Node) num <Image> — o que o
// container nativo do VFP nao arredonda, o canvas resolve. Navegacao: cada card abre o
// proximo passo (DO FORM), igual ao navigate() do React.
import { Form, Column, Row, Label, Image } from "@vfp/core";

const DIR = "C:\\projectos\\testesvf\\foxts\\showcase\\totem\\";

@Form({
  caption: "Totem - Seu pedido e para?",
  width: 760,
  height: 880,
  props: { BackColor: "RGB(250, 250, 250)" }, // backgroundColor #FAFAFA
})
export class TotemForm {
  render() {
    return (
      <Column gap={28} padding={24}>
        {/* cabecalho: logo a direita (132px, como no React) */}
        <Row width={712} height={132} justify="end">
          <Image src={DIR + "assets\\logo132.png"} width={132} height={132} />
        </Row>

        {/* titulo (fontSize gigante do tema, reduzido p/ a janela) */}
        <Label caption="Seu pedido e para?" textAlign="center" bold fontSize={30} fontName="Segoe UI" width={712} height={64} textColor="#070707" />

        {/* dois cards (PNG: branco arredondado + foto + legenda + sombra) */}
        <Row gap={32} width={712} height={380} justify="center">
          <Image src={DIR + "comer.png"} width={320} height={380} />
          <Image src={DIR + "levar.png"} width={320} height={380} />
        </Row>

        {/* botao Cancelar (pill #ede8e8) */}
        <Row width={712} height={120} justify="center" align="center">
          <Image src={DIR + "cancel.png"} width={263} height={96} />
        </Row>
      </Column>
    );
  }
}
