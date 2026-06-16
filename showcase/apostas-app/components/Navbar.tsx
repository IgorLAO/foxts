// components/Navbar.tsx — topo do app de apostas: marca + saldo + alertas/usuario.
// Componente de usuario reutilizado pelo AppLayout em todas as paginas.
import { Component, Container, Row, Label, Icon } from "@vfp/core";

@Component()
export class Navbar {
  title!: string;
  saldo!: string;
  render() {
    return (
      <Container color="surface" padding={10} alignSelf="stretch">
        <Row align="center" gap={10} padding={0} width={704}>
          <Icon name="trophy" size={16} color="primary" />
          <Label caption={this.title} bold fontSize={14} textColor="onSurface" transparent width={120} />
          <Label caption="" transparent width={370} />
          <Icon name="wallet" size={16} color="success" />
          <Label caption={this.saldo} bold fontSize={12} textColor="success" transparent width={90} />
          <Icon name="bell" size={16} color="muted" />
          <Icon name="user" size={16} color="muted" />
        </Row>
      </Container>
    );
  }
}
