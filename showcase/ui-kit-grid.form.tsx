// ui-kit-grid.form.tsx — Grid moderna do FoxTS UI Kit: zebra + chrome limpo
// (sem record/delete mark, linhas horizontais, scrollbar vertical, headers bold).
// Tudo prop de design nativa; as cores das listras vêm dos tokens (altRow/surface),
// então trocar o tema (ou mode: "dark") re-estiliza a grade no próximo build.
import { Form, Column, Card, Grid, GridColumn } from "@vfp/core";
import { createCursor, Char, Numeric } from "../fox";

interface Cliente {
  nome: Char<30>;
  uf: Char<2>;
  limite: Numeric<10, 2>;
}

@Form({ caption: "UI Kit - Clientes", width: 520, height: 360 })
export class UiKitGridForm {
  Load(): void {
    const cur = createCursor<Cliente>("curClientes");
    cur.append({ nome: "Joao Silva", uf: "SP", limite: 1500 });
    cur.append({ nome: "Maria Souza", uf: "RJ", limite: 3200 });
    cur.append({ nome: "Pedro Lima", uf: "MG", limite: 800 });
    cur.append({ nome: "Ana Costa", uf: "PR", limite: 4100 });
  }

  render() {
    return (
      <Column gap={14} padding={16}>
        <Card title="Clientes">
          <Grid source="curClientes" width={456} height={220}>
            <GridColumn header="Nome" field="nome" width={240} />
            <GridColumn header="UF" field="uf" width={60} />
            <GridColumn header="Limite" field="limite" width={120} />
          </Grid>
        </Card>
      </Column>
    );
  }
}
