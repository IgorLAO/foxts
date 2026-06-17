// pages/LoginPage.form.tsx — login por cracha (recria system_logininicio, modernizado).
// Card central: icone de cracha + instrucao + campo grande (password) + Entrar -> PrincipalPage.
import { Form, Column, Card, Label, TextBox, Button, Image, FormManager, FoxForm } from "@vfp/core";

declare class PrincipalPage { }

@Form({ caption: "Identificacao", width: 620, height: 480, props: { DataSession: 2 } })
export class LoginPage extends FoxForm {
  entrar(): void { FormManager.open(PrincipalPage); this.Release(); }
  render() {
    return (
      <Column gap={0} padding={28} align="center">
        <Card pad={32} gap={20} width={480}>
          <Column gap={18} padding={0} align="center">
            <Image src="icons/hero-badge.png" width={88} height={88} stretch={1} />
            <Label caption="Identificacao" bold fontSize={22} height={30} textColor="onSurface" transparent textAlign="center" width={420} />
            <Label caption="Aproxime ou digite o numero do seu cracha" fontSize={13} height={20} textColor="muted" transparent textAlign="center" width={420} />
            <TextBox bind="cracha" width={416} height={48} fontSize={20} bold textColor="onSurface" color="bg" textAlign="center" props={{ PasswordChar: '"*"' }} />
            <Label caption="Cracha invalido" bold fontSize={13} height={18} textColor="danger" transparent textAlign="center" width={416} props={{ Visible: false }} />
            <Button flat caption="Entrar" variant="primary" icon="arrow-right" onClick="entrar" width={416} />
          </Column>
        </Card>
      </Column>
    );
  }
}
