// forms/dashboard.form.tsx — PAINEL (entry do app). Design rico levando a
// customizacao ao limite: fundo escuro (@Form props BackColor), header colorido,
// KPI cards (<Container> coloridos com borda), tipografia (fontSize/fontName/bold/
// italic/textColor hex), e ANIMACAO: um <Timer> pulsa o ponto "online" (<Shape>).
import { Form, FoxForm, Column, Row, Container, Label, Shape, Timer, OpenFormButton } from "@vfp/core";
import { ClientesForm } from "./clientes.form";
import { PedidosForm } from "./pedidos.form";
import { SplashForm } from "./splash.form";

@Form({
  caption: "CRM",
  width: 680,
  height: 470,
  props: { BackColor: "RGB(15, 23, 42)" }, // slate-900
})
export class DashboardForm extends FoxForm {
  phase: number = 0;

  // pulsa o ponto de status "online" (efeito respiracao) via Timer.
  pulse(): void {
    this.phase = this.phase + 1;
    this.live.width = this.live.width + 4;
    this.live.height = this.live.height + 4;
    if (this.live.width > 26) {
      this.live.width = 12;
      this.live.height = 12;
    }
  }

  render() {
    return (
      <Column gap={16} padding={20}>
        {/* faixa de cabecalho roxa */}
        <Container name="hdr" width={636} height={74} color="#7c3aed" borderWidth={0}>
          <Column gap={2} padding={14}>
            <Label caption="Painel CRM" transparent bold fontSize={22} fontName="Segoe UI" height={34} textColor="#ffffff" />
            <Label caption="visao geral do dia" transparent italic fontSize={11} height={16} textColor="#ede9fe" />
          </Column>
        </Container>

        {/* KPI cards coloridos */}
        <Row gap={14}>
          <Container name="cardCli" width={200} height={112} color="#1e293b" borderColor="#7c3aed" borderWidth={1}>
            <Column gap={2} padding={14}>
              <Label caption="128" transparent bold fontSize={30} height={40} textColor="#a78bfa" />
              <Label caption="Clientes ativos" transparent fontSize={11} height={16} textColor="#94a3b8" />
            </Column>
          </Container>
          <Container name="cardPed" width={200} height={112} color="#1e293b" borderColor="#059669" borderWidth={1}>
            <Column gap={2} padding={14}>
              <Label caption="42" transparent bold fontSize={30} height={40} textColor="#34d399" />
              <Label caption="Pedidos hoje" transparent fontSize={11} height={16} textColor="#94a3b8" />
            </Column>
          </Container>
          <Container name="cardFat" width={200} height={112} color="#1e293b" borderColor="#d97706" borderWidth={1}>
            <Column gap={2} padding={14}>
              <Label caption="R$ 18.4k" transparent bold fontSize={30} height={40} textColor="#fbbf24" />
              <Label caption="Faturamento" transparent fontSize={11} height={16} textColor="#94a3b8" />
            </Column>
          </Container>
        </Row>

        {/* status animado */}
        <Row gap={10} height={28}>
          <Shape name="live" width={12} height={12} color="#22d3ee" rounded={90} />
          <Label caption="sistema online" transparent bold fontSize={12} height={18} textColor="#22d3ee" />
        </Row>

        {/* navegacao */}
        <Row gap={12}>
          <OpenFormButton form={ClientesForm} caption="Clientes" variant="primary" width={150} height={34} />
          <OpenFormButton form={PedidosForm} caption="Pedidos" variant="success" width={150} height={34} />
          <OpenFormButton form={SplashForm} caption="Animacao" color="#0ea5e9" width={150} height={34} />
        </Row>

        <Timer name="tmrPulse" width={0} height={0} interval={400} onTimer="pulse" />
      </Column>
    );
  }
}
