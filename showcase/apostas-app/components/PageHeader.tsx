// components/PageHeader.tsx — titulo + subtitulo + <Slot/> p/ acoes (children). Reutilizado.
import { Component, Row, Column, Label, Slot } from "@vfp/core";

@Component()
export class PageHeader {
  title!: string;
  subtitle!: string;
  render() {
    return (
      <Row align="center" justify="between" gap={12} padding={0} width={704}>
        <Column gap={3} padding={0}>
          <Label caption={this.title} bold fontSize={18} height={26} textColor="onSurface" transparent width={340} />
          <Label caption={this.subtitle} fontSize={11} height={16} textColor="muted" transparent width={380} />
        </Column>
        <Slot />
      </Row>
    );
  }
}
