// ui-kit-gallery.form.tsx — vitrine do FoxTS UI Kit: tudo numa tela só.
// Cards, FormField, botões flat (variantes + ícone), Grid moderna (zebra) e
// FormActions. O visual (cores/fontes/flat/cantos) vem 100% de vfp.theme.json —
// trocar "mode" para "dark" re-estiliza esta vitrine inteira no próximo build.
import { Form, Column, Row, Card, StatCard, FormField, FlatButton, FormActions, Grid, GridColumn } from "@vfp/core";
import { createCursor, Char, Numeric } from "../fox";

interface Cliente {
  nome: Char<30>;
  uf: Char<2>;
  limite: Numeric<10, 2>;
}

@Form({ caption: "FoxTS UI Kit", width: 600, height: 660 })
export class UiKitGalleryForm {
  Load(): void {
    const cur = createCursor<Cliente>("curGal");
    cur.append({ nome: "Joao Silva", uf: "SP", limite: 1500 });
    cur.append({ nome: "Maria Souza", uf: "RJ", limite: 3200 });
    cur.append({ nome: "Pedro Lima", uf: "MG", limite: 800 });
    cur.append({ nome: "Ana Costa", uf: "PR", limite: 4100 });
  }
  salvar(): void {
    // TODO: persistir
  }
  fechar(): void {
    // TODO: this.Release()
  }
  render() {
    return (
      <Column gap={14} padding={16}>
        <Row gap={14} align="stretch">
          <StatCard label="Vendas hoje" value="R$ 12.340" delta="+8%" grow={1} />
          <StatCard label="Clientes" value="1.284" delta="+24" grow={1} />
          <StatCard label="Cancelamentos" value="37" delta="-5%" grow={1} />
        </Row>
        <Row gap={14} align="stretch">
          <Card title="Cadastro">
            <FormField label="Nome" required bind="nome" width={220} />
            <FormField label="CPF" bind="cpf" width={160} />
          </Card>
          <Card title="Botoes">
            <Row gap={8}>
              <FlatButton caption="Primary" variant="primary" />
              <FlatButton caption="Outline" variant="secondary" />
            </Row>
            <Row gap={8}>
              <FlatButton caption="Excluir" variant="danger" />
              <FlatButton caption="Salvar" variant="primary" icon="save" />
            </Row>
          </Card>
        </Row>
        <Card title="Clientes">
          <Grid source="curGal" width={540} height={170}>
            <GridColumn header="Nome" field="nome" width={300} />
            <GridColumn header="UF" field="uf" width={70} />
            <GridColumn header="Limite" field="limite" width={140} />
          </Grid>
        </Card>
        <FormActions ok="Salvar" cancel="Cancelar" icon="save" onOk="salvar" onCancel="fechar" />
      </Column>
    );
  }
}
