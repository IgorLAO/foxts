// components/OddBox.tsx — uma "casa de odd" (mercado + cotacao), com cara de botao.
// Reutilizada 3x dentro de cada MatchCard (Casa/Empate/Fora). Props tipadas.
import { Component, Container, Label } from "@vfp/core";

@Component()
export class OddBox {
  market!: string;
  odd!: string;
  render() {
    return (
      <Container color="altRow" borderColor="border" padding={7} grow={1} align="center" gap={2}>
        <Label caption={this.market} textColor="muted" fontSize={10} transparent textAlign="center" width={72} />
        <Label caption={this.odd} textColor="primary" bold fontSize={15} transparent textAlign="center" width={72} />
      </Container>
    );
  }
}
