// pageframe.form.tsx — <PageFrame> nativo do VFP com páginas reais. Cada <Page>
// vira uma aba (PageCount + PageN.Caption) e seus filhos são controles aninhados
// de verdade (PARENT = pgf.PageN) — acessíveis via thisform.pgf1.Page1.txtNome.
import { Form, Column, PageFrame, Page, Label, TextBox, EditBox, Grid } from "@vfp/core";

@Form({ caption: "Cadastro com abas", width: 520, height: 380 })
export class PedidoForm {
  render() {
    return (
      <Column gap={10}>
        <PageFrame width={490} height={320}>
          <Page caption="Dados" gap={8}>
            <Label caption="Cliente" />
            <TextBox bind="cliente" width={260} />
            <Label caption="Observação" />
            <EditBox bind="obs" width={260} height={80} />
          </Page>
          <Page caption="Itens">
            <Grid name="grdItens" width={440} height={220} />
          </Page>
        </PageFrame>
      </Column>
    );
  }
}
