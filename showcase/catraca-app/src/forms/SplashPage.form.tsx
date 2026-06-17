// pages/SplashPage.form.tsx — tela de abertura do kiosk (recria pci_inicio, modernizada).
// Card central com a marca, status de inicializacao e botao Continuar -> LoginPage.
import { Form, Column, Card, Label, Button, FormManager, FoxForm } from "@vfp/core";
import { Brand } from "../components/Brand";

declare class LoginPage { }

@Form({ caption: "Catraca PCI", width: 560, height: 476, props: { DataSession: 2 } })
export class SplashPage extends FoxForm {
  continuar(): void { FormManager.open(LoginPage); this.Release(); }
  render() {
    return (
      <Column gap={0} padding={28} align="center">
        <Card pad={34} gap={22} width={430}>
          <Column gap={22} padding={0} align="center">
            <Brand subtitle="Gerenciador de Catraca" />
            <Column gap={4} padding={0} align="center">
              <Label caption="Sistema iniciado com sucesso" fontSize={12} height={18} textColor="success" transparent textAlign="center" width={360} />
              <Label caption="Versao 3.0    (c) 2025 PWI" fontSize={11} height={16} textColor="muted" transparent textAlign="center" width={360} />
            </Column>
            <Button flat caption="Continuar" variant="primary" icon="arrow-right" onClick="continuar" width={240} />
          </Column>
        </Card>
      </Column>
    );
  }
}
