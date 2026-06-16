// hover.form.tsx — fixture p/ o oráculo verifyhover.js: tem botão flat + itens de sidebar,
// cujos eventos de hover (MouseEnter/MouseLeave) recolorem um SHAPE irmão do container.
// Regressão coberta: (1) LPARAMETERS nos eventos disparados com parametros (senao VFP erra
// "No PARAMETER statement is found"); (2) caminho do shape (This.Parent vs This.Parent.Parent).
import { Form, Column, Row, Sidebar, SidebarItem, FlatButton } from "@vfp/core";

@Form({ caption: "Hover", width: 420, height: 300 })
export class HoverForm {
  salvar(): void { }
  render() {
    return (
      <Row gap={0} align="stretch">
        <Sidebar width={160}>
          <SidebarItem label="Inicio" icon="home" active />
          <SidebarItem label="Config" icon="settings" />
        </Sidebar>
        <Column gap={10} padding={12}>
          <FlatButton caption="Salvar" variant="primary" icon="save" onClick="salvar" />
        </Column>
      </Row>
    );
  }
}
