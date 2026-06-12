// grid.form.tsx — <Grid> com COLUNAS REAIS do VFP. Cada <GridColumn> vira uma
// coluna nativa (ColumnCount + ColumnN.ControlSource/Width), ligada ao cursor
// "curClientes" (RecordSource). O Load() cria e povoa o cursor com createCursor,
// de modo que a grade valide standalone (foxc build instancia NOSHOW LINKED, e o
// Load roda antes das colunas vincularem). Os captions de header são reaplicados
// no Init pelo transpilador, pois a vinculação em runtime reescreve o Header1.Caption
// pelo nome do campo. Prova: verifygrid.js (instancia no VFP e confere colunas/dados).
import { Form, Column, Grid, GridColumn } from "@vfp/core";
import { createCursor, Char, Numeric } from "../fox";

interface Cliente {
  nome: Char<30>;
  uf: Char<2>;
  limite: Numeric<10, 2>;
}

@Form({ caption: "Clientes", width: 480, height: 320 })
export class ClientesGridForm {
  // roda antes dos controles instanciarem: deixa o cursor aberto p/ a grade vincular.
  Load(): void {
    const cur = createCursor<Cliente>("curClientes");
    cur.append({ nome: "Joao Silva", uf: "SP", limite: 1500 });
    cur.append({ nome: "Maria Souza", uf: "RJ", limite: 3200 });
    cur.append({ nome: "Pedro Lima", uf: "MG", limite: 800 });
  }

  render() {
    return (
      <Column gap={10}>
        <Grid source="curClientes" width={440} height={240}>
          <GridColumn header="Nome" field="nome" width={220} />
          <GridColumn header="UF" field="uf" width={50} />
          <GridColumn header="Limite" field="limite" width={100} />
        </Grid>
      </Column>
    );
  }
}
