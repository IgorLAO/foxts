// wrap.form.tsx — Frente A (resto): flex-wrap + alignSelf no motor Yoga.
//   <Row wrap width={200}> com 4 botões de 80px -> quebra em 2 linhas (2 + 2).
//   <Label alignSelf="end"/> sobrepõe o align do container no eixo cruzado.
import { Form, FoxForm, Column, Row, Label, OpenFormButton } from "@vfp/core";

declare class OutroForm {}

@Form({ caption: "Wrap", width: 260, height: 260 })
export class WrapForm extends FoxForm {
  render() {
    return (
      <Column gap={10} align="start" width={240} height={240}>
        <Row wrap width={200} gap={10}>
          <OpenFormButton form={OutroForm} caption="A" width={80} />
          <OpenFormButton form={OutroForm} caption="B" width={80} />
          <OpenFormButton form={OutroForm} caption="C" width={80} />
          <OpenFormButton form={OutroForm} caption="D" width={80} />
        </Row>
        <Label caption="rodape" alignSelf="end" />
      </Column>
    );
  }
}
