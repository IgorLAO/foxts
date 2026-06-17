// components/Brand.tsx — marca do produto (icone heroi + "PCI" + subtitulo). Reutilizada
// na splash. Prova de COMPOSICAO: componente de usuario com props tipadas (subtitle).
import { Component, Column, Label, Image } from "@vfp/core";

@Component()
export class Brand {
  subtitle!: string;
  render() {
    return (
      <Column gap={8} padding={0} align="center">
        <Image src="icons/hero-brand.png" width={116} height={116} stretch={1} />
        <Label caption="PCI" bold fontSize={40} height={52} textColor="primary" transparent textAlign="center" width={320} />
        <Label caption={this.subtitle} fontSize={13} height={20} textColor="muted" transparent textAlign="center" width={340} />
      </Column>
    );
  }
}
