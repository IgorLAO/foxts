// pages/ClientesPage.form.tsx — segunda página REUTILIZANDO os mesmos componentes
// (AppLayout, PageHeader, PanelCard) com conteúdo diferente — prova de reutilização
// entre páginas (estilo React/Next). Master-detail: Grid de dados + Card compound de
// detalhe, com ícones nomeados (<SearchIcon/>, <SaveIcon/>). Mesmo design system.
import { Form, Row, Card, Grid, GridColumn, FormField, Button, SearchBox, FormManager, FoxForm } from "@vfp/core";
import { AppLayout } from "../layouts/AppLayout";
import { PageHeader } from "../components/PageHeader";
import { PanelCard } from "../components/PanelCard";
import { createCursor, Char, Numeric } from "../../../fox";

// navegação entre páginas: DO FORM <classe> (FormManager). Ambiente p/ evitar import circular.
declare class DashboardPage { }

interface Cliente {
  nome: Char<30>;
  cidade: Char<20>;
  uf: Char<2>;
  limite: Numeric<10, 2>;
}

@Form({ caption: "FoxTS Admin - Clientes", width: 920, height: 600, props: { DataSession: 2 } })
export class ClientesPage extends FoxForm {
  Load(): void {
    const cur = createCursor<Cliente>("curCli");
    cur.append({ nome: "Joao Silva", cidade: "Sao Paulo", uf: "SP", limite: 1500 });
    cur.append({ nome: "Maria Souza", cidade: "Rio de Janeiro", uf: "RJ", limite: 3200 });
    cur.append({ nome: "Pedro Lima", cidade: "Belo Horizonte", uf: "MG", limite: 800 });
    cur.append({ nome: "Ana Costa", cidade: "Curitiba", uf: "PR", limite: 4100 });
    cur.append({ nome: "Carlos Dias", cidade: "Porto Alegre", uf: "RS", limite: 2750 });
  }
  novo(): void { }
  salvar(): void { }
  excluir(): void { }
  irDashboard(): void { FormManager.open(DashboardPage); this.Release(); }
  irClientes(): void { } // já estamos em Clientes
  render() {
    return (
      <AppLayout title="FoxTS Admin" navClientes>
        <PageHeader title="Clientes" subtitle="5 registros">
          <Button flat caption="Novo" variant="primary" icon="plus" onClick="novo" />
        </PageHeader>

        <SearchBox placeholder="Buscar cliente..." source="curCli" field="nome" />

        <Row gap={14} align="stretch" padding={0}>
          <PanelCard title="Lista">
            <Grid source="curCli" width={360} height={300} syncDetail>
              <GridColumn header="Nome" field="nome" width={185} />
              <GridColumn header="UF" field="uf" width={50} />
              <GridColumn header="Limite" field="limite" width={110} />
            </Grid>
          </PanelCard>

          <Card grow={1}>
            <Card.Header>Detalhe do cliente</Card.Header>
            <Card.Body>
              <FormField label="Nome" field="nome" source="curCli" width={240} />
              <FormField label="Cidade" field="cidade" source="curCli" width={240} />
              <FormField label="UF" field="uf" source="curCli" width={70} />
              <FormField label="Limite" field="limite" source="curCli" width={140} />
            </Card.Body>
            <Card.Footer>
              <Button flat caption="Excluir" variant="danger" icon="trash" onClick="excluir" />
              <Button flat caption="Salvar" variant="primary" icon="save" onClick="salvar" />
            </Card.Footer>
          </Card>
        </Row>
      </AppLayout>
    );
  }
}
