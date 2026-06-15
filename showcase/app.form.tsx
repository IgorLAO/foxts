// app.form.tsx — SCREEN PATTERN: app shell (Sidebar) + master-detail de Clientes.
// Prova o "salto de componente para padrão de tela": navegação lateral + busca ao vivo
// (SET FILTER por tecla) + lista (Grid) sincronizada com um formulário de detalhe que
// segue o registro corrente (FormField field=.. source=.. + Grid syncDetail). Todo o
// visual (flat/cores/dark) vem de vfp.theme.json. As peças (Sidebar/SearchBox/EmptyState/
// FormField/Grid) são reutilizáveis soltas; aqui elas compõem o pattern.
import { Form, Column, Row, Card, FormField, SearchBox, Sidebar, SidebarItem, Grid, GridColumn } from "@vfp/core";
import { createCursor, Char, Numeric } from "../fox";

interface Cliente {
  nome: Char<30>;
  cidade: Char<20>;
  uf: Char<2>;
  limite: Numeric<10, 2>;
}

@Form({ caption: "FoxTS - Clientes", width: 840, height: 560 })
export class AppForm {
  Load(): void {
    const cur = createCursor<Cliente>("curCli");
    cur.append({ nome: "Joao Silva", cidade: "Sao Paulo", uf: "SP", limite: 1500 });
    cur.append({ nome: "Maria Souza", cidade: "Rio de Janeiro", uf: "RJ", limite: 3200 });
    cur.append({ nome: "Pedro Lima", cidade: "Belo Horizonte", uf: "MG", limite: 800 });
    cur.append({ nome: "Ana Costa", cidade: "Curitiba", uf: "PR", limite: 4100 });
    cur.append({ nome: "Carlos Dias", cidade: "Porto Alegre", uf: "RS", limite: 2750 });
    cur.append({ nome: "Bruna Alves", cidade: "Salvador", uf: "BA", limite: 980 });
  }
  novo(): void {
    // TODO: append + edit
  }
  salvar(): void {
    // TODO: persistir
  }
  render() {
    return (
      <Row gap={0} align="stretch" height={512} padding={0}>
        <Sidebar width={184}>
          <SidebarItem label="Dashboard" />
          <SidebarItem label="Clientes" active />
          <SidebarItem label="Produtos" />
          <SidebarItem label="Financeiro" />
          <SidebarItem label="Configuracoes" icon="settings" />
        </Sidebar>
        <Column gap={12} padding={16} grow={1}>
          <SearchBox placeholder="Buscar cliente..." source="curCli" field="nome" />
          <Row gap={12} align="stretch">
            <Grid source="curCli" width={360} height={392} syncDetail>
              <GridColumn header="Nome" field="nome" width={190} />
              <GridColumn header="UF" field="uf" width={50} />
              <GridColumn header="Limite" field="limite" width={110} />
            </Grid>
            <Card title="Detalhe do cliente" grow={1}>
              <FormField label="Nome" field="nome" source="curCli" width={230} />
              <FormField label="Cidade" field="cidade" source="curCli" width={230} />
              <FormField label="UF" field="uf" source="curCli" width={70} />
              <FormField label="Limite" field="limite" source="curCli" width={130} />
            </Card>
          </Row>
        </Column>
      </Row>
    );
  }
}
