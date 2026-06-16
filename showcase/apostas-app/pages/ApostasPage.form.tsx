// pages/ApostasPage.form.tsx — home do app de apostas, montada por COMPOSICAO declarativa:
// <AppLayout> + <PageHeader> + <Grid columns={3}> de StatCard + <Grid columns={2}> de
// <MatchCard> (componente de usuario reutilizavel) + <Card> compound (Cupom). Navega p/
// "Minhas Apostas" pela sidebar. Zero coordenadas -> SCX nativo do VFP.
import { Form, Grid, Row, Card, StatCard, FormField, Button, FormManager, FoxForm } from "@vfp/core";
import { AppLayout } from "../layouts/AppLayout";
import { PageHeader } from "../components/PageHeader";
import { MatchCard } from "../components/MatchCard";

declare class MinhasApostasPage { }

@Form({ caption: "FoxBet - Apostas", width: 960, height: 900, props: { DataSession: 2 } })
export class ApostasPage extends FoxForm {
  valor: number = 50;
  irApostas(): void { } // ja estamos aqui
  irMinhas(): void { FormManager.open(MinhasApostasPage); this.Release(); }
  apostar(): void { }
  limpar(): void { }
  render() {
    return (
      <AppLayout title="FoxBet" saldo="R$ 250,00" navApostas>
        <PageHeader title="Futebol - Hoje" subtitle="Principais jogos do dia">
          <Button flat caption="Ao vivo" variant="danger" icon="zap" onClick="irApostas" />
        </PageHeader>

        <Grid columns={3} gap={14}>
          <StatCard label="Saldo" value="R$ 250,00" />
          <StatCard label="Apostas abertas" value="3" />
          <StatCard label="Ganhos do mes" value="R$ 1.240" delta="+18%" />
        </Grid>

        <Grid columns={2} gap={12}>
          <MatchCard league="Brasileirao" time="16:00" home="Flamengo" away="Palmeiras" oddHome="2.10" oddDraw="3.20" oddAway="3.40" />
          <MatchCard league="Brasileirao" time="18:30" home="Corinthians" away="Sao Paulo" oddHome="2.45" oddDraw="3.00" oddAway="2.90" />
          <MatchCard league="La Liga" time="17:00" home="Barcelona" away="Real Madrid" oddHome="2.30" oddDraw="3.50" oddAway="2.80" />
          <MatchCard league="Premier League" time="13:30" home="Arsenal" away="Chelsea" oddHome="1.95" oddDraw="3.40" oddAway="3.80" />
        </Grid>

        <Card>
          <Card.Header>Cupom de aposta</Card.Header>
          <Card.Body>
            <Row gap={12} align="stretch" padding={0}>
              <FormField label="Selecao" value="Flamengo (Casa)" width={220} />
              <FormField label="Odd" value="2.10" width={90} />
              <FormField label="Valor (R$)" bind="valor" width={120} />
              <FormField label="Retorno" value="R$ 105,00" width={130} />
            </Row>
          </Card.Body>
          <Card.Footer>
            <Button flat caption="Limpar" variant="secondary" onClick="limpar" />
            <Button flat caption="Apostar" variant="primary" icon="check" onClick="apostar" />
          </Card.Footer>
        </Card>
      </AppLayout>
    );
  }
}
