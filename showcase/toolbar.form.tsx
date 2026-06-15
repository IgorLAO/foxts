// toolbar.form.tsx — demo do <Toolbar> do FoxTS UI Kit: barra de comandos horizontal
// (Win11/Fluent) no topo da tela, com botoes compactos (icone/texto), variantes e
// separadores entre grupos, sobre um conteudo (Card + Grid). O visual (surface/borda/
// hover/fontes) vem de vfp.theme.json — trocar mode: "dark" re-estiliza tudo no build.
import { Form, Column, Card, Toolbar, ToolbarButton, ToolbarSeparator, FormField, Grid, GridColumn } from "@vfp/core";
import { createCursor, Char, Numeric } from "../fox";

interface Cliente {
  nome: Char<30>;
  uf: Char<2>;
  limite: Numeric<10, 2>;
}

@Form({ caption: "Toolbar - Clientes", width: 560, height: 460 })
export class ToolbarForm {
  Load(): void {
    const cur = createCursor<Cliente>("curTb");
    cur.append({ nome: "Joao Silva", uf: "SP", limite: 1500 });
    cur.append({ nome: "Maria Souza", uf: "RJ", limite: 3200 });
    cur.append({ nome: "Pedro Lima", uf: "MG", limite: 800 });
    cur.append({ nome: "Ana Costa", uf: "PR", limite: 4100 });
  }
  novo(): void { /* TODO: APPEND BLANK no cursor */ }
  salvar(): void { /* TODO: TABLEUPDATE */ }
  editar(): void { /* TODO: abrir cadastro */ }
  excluir(): void { /* TODO: DELETE */ }
  config(): void { /* TODO: abrir preferencias */ }
  render() {
    return (
      <Column gap={0} padding={0}>
        <Toolbar>
          <ToolbarButton label="Novo" icon="edit" variant="primary" onClick="novo" />
          <ToolbarButton label="Salvar" icon="save" onClick="salvar" />
          <ToolbarSeparator />
          <ToolbarButton label="Editar" onClick="editar" />
          <ToolbarButton label="Excluir" variant="danger" onClick="excluir" />
          <ToolbarSeparator />
          <ToolbarButton icon="settings" onClick="config" />
        </Toolbar>
        <Column gap={14} padding={16}>
          <Card title="Cliente atual">
            <FormField label="Nome" field="nome" source="curTb" width={260} />
            <FormField label="UF" field="uf" source="curTb" width={60} />
          </Card>
          <Card title="Clientes">
            <Grid source="curTb" syncDetail width={500} height={170}>
              <GridColumn header="Nome" field="nome" width={280} />
              <GridColumn header="UF" field="uf" width={70} />
              <GridColumn header="Limite" field="limite" width={140} />
            </Grid>
          </Card>
        </Column>
      </Column>
    );
  }
}
