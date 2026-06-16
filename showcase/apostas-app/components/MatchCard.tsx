// components/MatchCard.tsx — cartao de um jogo: liga/hora + times + 3 OddBox (Casa/Empate/
// Fora). COMPOSICAO: compoe <Card>, <Row>, <Label>, <Icon> e o componente <OddBox>.
// Reutilizado para cada jogo (props tipadas) — prova de componentizacao reutilizavel.
import { Component, Card, Row, Label, Icon } from "@vfp/core";
import { OddBox } from "./OddBox";

@Component()
export class MatchCard {
  league!: string;
  time!: string;
  home!: string;
  away!: string;
  oddHome!: string;
  oddDraw!: string;
  oddAway!: string;
  render() {
    return (
      <Card grow={1} gap={6} padding={12}>
        <Row align="center" gap={6} padding={0}>
          <Icon name="activity" size={13} color="muted" />
          <Label caption={this.league} textColor="muted" fontSize={10} transparent width={150} />
          <Label caption={this.time} textColor="muted" fontSize={10} transparent width={56} />
        </Row>
        <Label caption={this.home} textColor="onSurface" bold fontSize={13} height={18} transparent width={240} />
        <Label caption={this.away} textColor="onSurface" bold fontSize={13} height={18} transparent width={240} />
        <Row gap={6} align="stretch" padding={0}>
          <OddBox market="Casa" odd={this.oddHome} />
          <OddBox market="Empate" odd={this.oddDraw} />
          <OddBox market="Fora" odd={this.oddAway} />
        </Row>
      </Card>
    );
  }
}
