// pages/ResultPage.form.tsx — resultado do acesso (recria system_autorizou, modernizado).
// Card central com check verde grande, "ACESSO LIBERADO", nome e instrucao. Concluir -> PrincipalPage.
import { Form, Column, Card, Label, Button, Image, FormManager, FoxForm } from "@vfp/core";

declare class PrincipalPage { }

@Form({ caption: "Acesso liberado", width: 560, height: 430, props: { DataSession: 2 } })
export class ResultPage extends FoxForm {
  voltar(): void { FormManager.open(PrincipalPage); this.Release(); }
  render() {
    return (
      <Column gap={0} padding={28} align="center">
        <Card pad={36} gap={20} width={440}>
          <Column gap={14} padding={0} align="center">
            <Image src="icons/hero-ok.png" width={104} height={104} stretch={1} />
            <Label caption="ACESSO LIBERADO" bold fontSize={26} height={34} textColor="success" transparent textAlign="center" width={380} />
            <Label caption="Joao da Silva" fontSize={17} height={24} textColor="onSurface" transparent textAlign="center" width={380} />
            <Label caption="Pode passar pela catraca" fontSize={13} height={18} textColor="muted" transparent textAlign="center" width={380} />
            <Button flat caption="Concluir" variant="primary" icon="check" onClick="voltar" width={260} />
          </Column>
        </Card>
      </Column>
    );
  }
}
