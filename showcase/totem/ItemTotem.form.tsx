// ItemTotem — tela do totem (front do app React) exibida no VFP via <Image> fullscreen.
import { Form, Column, Image } from "@vfp/core";
@Form({ caption: "Totem", width: 760, height: 1180, props: { BackColor: "RGB(250, 250, 250)" } })
export class ItemTotem {
  render() {
    return (
      <Column padding={0}>
        <Image src="C:/projectos/testesvf/foxts/showcase/totem/04_item.png" width={760} height={1180} />
      </Column>
    );
  }
}
