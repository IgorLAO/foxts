// forms/clientes.form.tsx — form de LISTA. <Grid> com colunas reais (Frente B)
// ligado ao cursor curClientes que o Load() cria/povoa (createCursor) antes da
// grade vincular. Botao abre o detalhe (Frente C).
import { Form, Column, Row, Label, Grid, GridColumn, OpenFormButton } from "@vfp/core";
import { createCursor, Char, Numeric } from "../../../../fox";
import { ClienteForm } from "./cliente.form";

interface ClienteRow {
  nome: Char<40>;
  uf: Char<2>;
  limite: Numeric<10, 2>;
}

@Form({ caption: "Clientes", width: 620, height: 460 })
export class ClientesForm {
  // roda antes dos controles instanciarem: deixa o cursor aberto p/ a grade vincular.
  Load(): void {
    const cur = createCursor<ClienteRow>("curClientes");
    cur.append({ nome: "Joao Silva", uf: "SP", limite: 1500 });
    cur.append({ nome: "Maria Souza", uf: "RJ", limite: 3200 });
    cur.append({ nome: "Pedro Lima", uf: "MG", limite: 800 });
    cur.append({ nome: "Ana Costa", uf: "SP", limite: 5000 });
  }

  render() {
    return (
      <Column gap={12} padding={12}>
        <Label caption="Clientes cadastrados" bold />
        <Grid source="curClientes" width={580} height={320}>
          <GridColumn header="Nome" field="nome" width={320} />
          <GridColumn header="UF" field="uf" width={60} />
          <GridColumn header="Limite" field="limite" width={160} />
        </Grid>
        <Row gap={8}>
          <OpenFormButton form={ClienteForm} caption="Novo cliente" variant="primary" />
        </Row>
      </Column>
    );
  }
}
