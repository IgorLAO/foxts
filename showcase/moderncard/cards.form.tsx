// cards.form.tsx — comparacao dos dois caminhos "web moderno" lado a lado, dentro
// do VFP. Cada card e um PNG (gradiente+sombra+cantos+texto AA) carregado num
// <Image> (Picture). Esquerda: gerado em RUNTIME por GDIPlusX (gdi_card.prg).
// Direita: gerado em BUILD-TIME no Node (@napi-rs/canvas, build_card.js).
import { Form, Column, Row, Label, Image } from "@vfp/core";

@Form({
  caption: "Cards modernos - GDI+ (runtime) vs Node (build)",
  width: 860,
  height: 320,
  props: { BackColor: "RGB(15, 23, 42)" },
})
export class CardsForm {
  render() {
    return (
      <Column gap={10} padding={20}>
        <Label caption="Mesmo design, dois caminhos:" transparent bold fontSize={14} height={22} textColor="#e2e8f0" />
        <Row gap={24}>
          <Column gap={6}>
            <Label caption="GDIPlusX (runtime no VFP)" transparent fontSize={11} height={16} textColor="#a78bfa" />
            <Image src="C:\\projectos\\testesvf\\foxts\\showcase\\moderncard\\out_gdi.png" width={380} height={200} />
          </Column>
          <Column gap={6}>
            <Label caption="Node @napi-rs/canvas (build-time)" transparent fontSize={11} height={16} textColor="#34d399" />
            <Image src="C:\\projectos\\testesvf\\foxts\\showcase\\moderncard\\out_node.png" width={380} height={200} />
          </Column>
        </Row>
      </Column>
    );
  }
}
