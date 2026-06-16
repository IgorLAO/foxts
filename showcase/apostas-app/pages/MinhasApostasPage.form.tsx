// pages/MinhasApostasPage.form.tsx — 2a pagina, REUTILIZANDO AppLayout/PageHeader (mesmo
// design system) com conteudo diferente: StatCards + <Grid source> (grade de dados das
// apostas) + <Card> compound de resumo. Navega de volta p/ "Apostas" pela sidebar.
import { Form, Grid, GridColumn, Row, Card, StatCard, FormField, Button, FormManager, FoxForm } from "@vfp/core";
import { AppLayout } from "../layouts/AppLayout";
import { PageHeader } from "../components/PageHeader";
import { createCursor, Char, Numeric } from "../../../fox";

declare class ApostasPage { }

interface Aposta {
  evento: Char<28>;
  palpite: Char<14>;
  odd: Numeric<6, 2>;
  valor: Numeric<8, 2>;
  status: Char<10>;
}

@Form({ caption: "FoxBet - Minhas Apostas", width: 960, height: 900, props: { DataSession: 2 } })
export class MinhasApostasPage extends FoxForm {
  irApostas(): void { FormManager.open(ApostasPage); this.Release(); }
  irMinhas(): void { } // ja estamos aqui
  Load(): void {
    const cur = createCursor<Aposta>("curAp");
    cur.append({ evento: "Flamengo x Palmeiras", palpite: "Casa", odd: 2.10, valor: 50, status: "Aberta" });
    cur.append({ evento: "Barcelona x Real Madrid", palpite: "Empate", odd: 3.50, valor: 30, status: "Aberta" });
    cur.append({ evento: "Arsenal x Chelsea", palpite: "Casa", odd: 1.95, valor: 80, status: "Ganha" });
    cur.append({ evento: "Lakers x Celtics", palpite: "Fora", odd: 1.80, valor: 40, status: "Perdida" });
    cur.append({ evento: "Corinthians x Sao Paulo", palpite: "Casa", odd: 2.45, valor: 25, status: "Aberta" });
  }
  render() {
    return (
      <AppLayout title="FoxBet" saldo="R$ 250,00" navMinhas>
        <PageHeader title="Minhas Apostas" subtitle="5 apostas no periodo">
          <Button flat caption="Nova aposta" variant="primary" icon="plus" onClick="irApostas" />
        </PageHeader>

        <Grid columns={3} gap={14}>
          <StatCard label="Total apostado" value="R$ 225,00" />
          <StatCard label="Em aberto" value="3" />
          <StatCard label="Retorno potencial" value="R$ 410,00" delta="+82%" />
        </Grid>

        <Row gap={14} align="stretch" padding={0}>
          <Card title="Historico" grow={1}>
            <Grid source="curAp" width={370} height={340}>
              <GridColumn header="Evento" field="evento" width={180} />
              <GridColumn header="Palpite" field="palpite" width={70} />
              <GridColumn header="Odd" field="odd" width={45} />
              <GridColumn header="Status" field="status" width={70} />
            </Grid>
          </Card>

          <Card grow={1}>
            <Card.Header>Detalhe</Card.Header>
            <Card.Body>
              <FormField label="Evento" field="evento" source="curAp" width={240} />
              <FormField label="Palpite" field="palpite" source="curAp" width={120} />
              <FormField label="Odd" field="odd" source="curAp" width={90} />
              <FormField label="Valor (R$)" field="valor" source="curAp" width={120} />
              <FormField label="Status" field="status" source="curAp" width={120} />
            </Card.Body>
            <Card.Footer>
              <Button flat caption="Cancelar aposta" variant="danger" icon="x" />
            </Card.Footer>
          </Card>
        </Row>
      </AppLayout>
    );
  }
}
