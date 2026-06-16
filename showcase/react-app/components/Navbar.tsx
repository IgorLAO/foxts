// components/Navbar.tsx — barra superior do app (componente de usuário, estilo React).
// Compõe primitivos (Container surface + Row + Label + Icon) e recebe `title` por prop
// tipada. Reutilizado pelo AppLayout em TODAS as páginas. Sem coordenadas: layout flex.
import { Component, Container, Row, Label, Icon } from "@vfp/core";

@Component()
export class Navbar {
  title!: string;
  render() {
    return (
      <Container color="surface" padding={10} alignSelf="stretch">
        <Row align="center" gap={10} padding={0} width={664}>
          <Icon name="bag" size={16} color="primary" />
          <Label caption={this.title} bold fontSize={14} textColor="onSurface" transparent width={556} />
          <Icon name="bell" size={16} color="muted" />
          <Icon name="user" size={16} color="muted" />
        </Row>
      </Container>
    );
  }
}
