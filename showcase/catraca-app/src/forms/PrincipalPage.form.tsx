// pages/PrincipalPage.form.tsx — tela principal de validacao (recria system_principal,
// modernizada). Header (titulo + config) + card do visitante + StatCards de ingressos +
// prompt "aproxime o cracha" + acoes. Validar -> ResultPage; Sair -> LoginPage.
import { Form, Column, Row, Grid, Card, StatCard, Label, Button, Image, FlatButton, FormManager, FoxForm } from "@vfp/core";

declare class ResultPage { }
declare class LoginPage { }

@Form({ caption: "Validacao de ingresso", width: 660, height: 628, props: { DataSession: 2 } })
export class PrincipalPage extends FoxForm {
  validar(): void { FormManager.open(ResultPage); this.Release(); }
  sair(): void { FormManager.open(LoginPage); this.Release(); }
  config(): void { }
  render() {
    return (
      <Column gap={14} padding={18}>
        <Row align="center" justify="between" gap={12} padding={0} width={624}>
          <Column gap={2} padding={0}>
            <Label caption="Validacao de ingresso" bold fontSize={20} height={28} textColor="onSurface" transparent width={440} />
            <Label caption="Terminal 01    Entrada principal" fontSize={12} height={16} textColor="muted" transparent width={440} />
          </Column>
          <FlatButton caption="Config" variant="ghost" icon="settings" onClick="config" width={96} />
        </Row>

        <Card title="Visitante" gap={10}>
          <Row gap={16} align="center" padding={0}>
            <Image src="icons/hero-badge.png" width={88} height={88} stretch={1} />
            <Column gap={6} padding={0}>
              <Label caption="Joao da Silva" bold fontSize={18} height={24} textColor="onSurface" transparent width={420} />
              <Label caption="Excursao: Termas de Volpe" fontSize={13} height={18} textColor="muted" transparent width={420} />
              <Label caption="Documento: 123.456.789-00" fontSize={13} height={18} textColor="muted" transparent width={420} />
            </Column>
          </Row>
        </Card>

        <Grid columns={3} gap={12}>
          <StatCard label="Disponiveis" value="2" delta="+2" />
          <StatCard label="Utilizados" value="1" />
          <StatCard label="Total" value="3" />
        </Grid>

        <Card gap={10}>
          <Column gap={8} padding={6} align="center">
            <Image src="icons/hero-scan.png" width={72} height={72} stretch={1} />
            <Label caption="Aproxime o cracha do leitor" bold fontSize={16} height={22} textColor="primary" transparent textAlign="center" width={560} />
            <Label caption="Aguardando leitura..." fontSize={12} height={16} textColor="muted" transparent textAlign="center" width={560} />
          </Column>
        </Card>

        <Row gap={12} justify="between" padding={0} width={624}>
          <Button flat caption="Sair" variant="secondary" icon="log-out" onClick="sair" width={180} />
          <Button flat caption="Validar acesso" variant="primary" icon="check" onClick="validar" width={300} />
        </Row>
      </Column>
    );
  }
}
