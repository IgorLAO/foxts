// clientes.form.tsx — form de LISTA. Mostra de uma vez quase tudo que o FoxTS faz:
//   • <Grid> com COLUNAS REAIS do VFP (Frente B): header/largura/binding por coluna,
//     ligado ao cursor "curClientes" que o Load() cria e povoa (createCursor).
//   • Layout flex em build-time (<Column>/<Row>, gap/padding) (Frente A).
//   • Tema/estilo (variant, bold) (Frente E).
//   • Navegação: <OpenFormButton form={ClienteForm}> -> DO FORM ClienteForm (Frente C).
import {
  Form,
  Column,
  Row,
  Label,
  Grid,
  GridColumn,
  OpenFormButton,
} from "@vfp/core";
import { createCursor, Char, Numeric } from "../fox";
import { ClienteForm } from "./cliente.form";

interface Cliente {
  nome: Char<30>;
  uf: Char<2>;
  limite: Numeric<10, 2>;
}

@Form({ caption: "Clientes", width: 560, height: 400 })
export class ClientesForm {
  // roda antes dos controles instanciarem: deixa o cursor aberto p/ a grade vincular.
  Load(): void {
    const cur = createCursor<Cliente>("curClientes");
    cur.append({ nome: "Joao Silva", uf: "SP", limite: 1500 });
    cur.append({ nome: "Maria Souza", uf: "RJ", limite: 3200 });
    cur.append({ nome: "Pedro Lima", uf: "MG", limite: 800 });
    cur.append({ nome: "Ana Costa", uf: "SP", limite: 5000 });
  }

  render() {
    return (
      <Column gap={12} padding={12}>
        <Label caption="Clientes cadastrados" bold />
        <Grid source="curClientes" width={520} height={270}>
          <GridColumn header="Nome" field="nome" width={280} />
          <GridColumn header="UF" field="uf" width={60} />
          <GridColumn header="Limite" field="limite" width={140} />
        </Grid>
        <Row gap={8}>
          <OpenFormButton
            form={ClienteForm}
            caption="Novo cliente"
            variant="primary"
          />
        </Row>
      </Column>
    );
  }
}
