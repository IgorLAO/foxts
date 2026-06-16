// pages/DashboardPage.form.tsx — página montada por COMPOSIÇÃO declarativa (estilo React):
// <AppLayout> (shell) > <PageHeader> (com ação no slot) + <Grid columns={3}> de <StatCard>
// + painéis. Usa compound components (<Card.Header>/<Card.Body>/<Card.Footer>) e ícones
// (<Icon>/<SaveIcon>). Zero coordenadas — o transpilador resolve o layout p/ um SCX nativo.
import { Form, Row, Grid, Card, StatCard, FormField, Button, FormManager, FoxForm } from "@vfp/core";
import { AppLayout } from "../layouts/AppLayout";
import { PageHeader } from "../components/PageHeader";
import { PanelCard } from "../components/PanelCard";
import { createCursor, Char, Numeric } from "../../../fox";

// navegação entre páginas: DO FORM <classe> (FormManager). Ambiente p/ evitar import circular.
declare class ClientesPage { }

interface Cliente {
  nome: Char<30>;
  cidade: Char<20>;
  uf: Char<2>;
  limite: Numeric<10, 2>;
}

@Form({ caption: "FoxTS Admin - Dashboard", width: 920, height: 600, props: { DataSession: 2 } })
export class DashboardPage extends FoxForm {
  Load(): void {
    const cur = createCursor<Cliente>("curCli");
    cur.append({ nome: "Joao Silva", cidade: "Sao Paulo", uf: "SP", limite: 1500 });
    cur.append({ nome: "Maria Souza", cidade: "Rio de Janeiro", uf: "RJ", limite: 3200 });
    cur.append({ nome: "Pedro Lima", cidade: "Belo Horizonte", uf: "MG", limite: 800 });
  }
  novo(): void { }
  salvar(): void { }
  irDashboard(): void { } // já estamos no Dashboard
  irClientes(): void { FormManager.open(ClientesPage); this.Release(); }
  render() {
    return (
      <AppLayout title="FoxTS Admin" navDashboard>
        <PageHeader title="Dashboard" subtitle="Visao geral do mes de junho">
          <Button flat caption="Novo" variant="primary" icon="plus" onClick="novo" />
        </PageHeader>

        <Grid columns={3} gap={14}>
          <StatCard label="Vendas hoje" value="R$ 12.340" delta="+8%" />
          <StatCard label="Clientes" value="1.284" delta="+24" />
          <StatCard label="Ticket medio" value="R$ 96" delta="-3%" />
        </Grid>

        <Row gap={14} align="stretch" padding={0}>
          <PanelCard title="Metas do mes">
            <FormField label="Meta" value="R$ 20.000" width={200} />
            <FormField label="Realizado" value="R$ 12.340" width={200} />
          </PanelCard>

          <Card grow={1}>
            <Card.Header>Dados do Cliente</Card.Header>
            <Card.Body>
              <FormField label="Nome" field="nome" source="curCli" width={230} />
              <FormField label="Cidade" field="cidade" source="curCli" width={230} />
            </Card.Body>
            <Card.Footer>
              <Button flat caption="Cancelar" variant="secondary" onClick="novo" />
              <Button flat caption="Salvar" variant="primary" icon="save" onClick="salvar" />
            </Card.Footer>
          </Card>
        </Row>
      </AppLayout>
    );
  }
}
