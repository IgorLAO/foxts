// forms/pedidos.form.tsx — form com ABAS. <PageFrame>/<Page> sao nativos do VFP
// (PageCount + PageN.Caption, filhos com PARENT=pgf.PageN) — Frente B (contencao real).
// A aba "Itens" tem um <Grid> com colunas reais ligado ao cursor curItens (Load()).
import { Form, Column, PageFrame, Page, Label, TextBox, EditBox, Grid, GridColumn } from "@vfp/core";
import { createCursor, Char, Numeric } from "../../../../fox";

interface ItemRow {
  produto: Char<30>;
  qtd: Numeric<5, 0>;
  preco: Numeric<10, 2>;
}

@Form({ caption: "Pedidos", width: 620, height: 480 })
export class PedidosForm {
  Load(): void {
    const cur = createCursor<ItemRow>("curItens");
    cur.append({ produto: "Teclado", qtd: 2, preco: 120 });
    cur.append({ produto: "Monitor", qtd: 1, preco: 980 });
    cur.append({ produto: "Mouse", qtd: 3, preco: 60 });
  }

  render() {
    return (
      <Column gap={10} padding={10}>
        <PageFrame width={590} height={420}>
          <Page caption="Dados" gap={8}>
            <Label caption="Cliente" />
            <TextBox bind="cliente" width={320} />
            <Label caption="Observacao" />
            <EditBox bind="obs" width={320} height={90} />
          </Page>
          <Page caption="Itens">
            <Grid source="curItens" width={540} height={320}>
              <GridColumn header="Produto" field="produto" width={260} />
              <GridColumn header="Qtd" field="qtd" width={80} />
              <GridColumn header="Preco" field="preco" width={160} />
            </Grid>
          </Page>
        </PageFrame>
      </Column>
    );
  }
}
