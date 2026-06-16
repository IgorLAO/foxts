// components/PanelCard.tsx — painel reutilizável: um Card (surface + cantos + sombra)
// com `title` por prop e um <Slot/> p/ o conteúdo (children). Prova de COMPOSIÇÃO:
// um componente de usuário que envolve um built-in e repassa os filhos do consumidor.
// Reutilizado em Dashboard e Clientes com conteúdos diferentes (mesmo componente).
import { Component, Card, Slot } from "@vfp/core";

@Component()
export class PanelCard {
  title!: string;
  render() {
    return (
      <Card title={this.title} grow={1}>
        <Slot />
      </Card>
    );
  }
}
