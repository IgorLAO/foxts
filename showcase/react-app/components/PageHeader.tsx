// components/PageHeader.tsx — cabeçalho de página: título + subtítulo à esquerda e um
// <Slot/> à direita p/ ações (children, estilo React). Props tipadas (title/subtitle).
// Reutilizado em várias páginas; as ações variam por composição (o que o consumidor põe).
import { Component, Row, Column, Label, Slot } from "@vfp/core";

@Component()
export class PageHeader {
  title!: string;
  subtitle!: string;
  render() {
    return (
      <Row align="center" justify="between" gap={12} padding={0} width={664}>
        <Column gap={3} padding={0}>
          <Label caption={this.title} bold fontSize={18} height={26} textColor="onSurface" transparent width={320} />
          <Label caption={this.subtitle} fontSize={11} height={16} textColor="muted" transparent width={380} />
        </Column>
        <Slot />
      </Row>
    );
  }
}
