// Totem.form.tsx — totem de autoatendimento de alimentação, REFEITO com o FoxTS UI Kit
// (componentes REAIS: Card / FlatButton / Label / Shape), não mais imagem de fundo +
// hotspots transparentes. 5 telas = 5 <Container> sobrepostos (View absolute) alternados
// por visibilidade. Fluxo: Home → Modo de entrega → Cardápio → Pagamento → Aprovado.
// Cada botão tem função real; quantidades/total/status são estado do form. Visual 100%
// do tema (totem-app/vfp.theme.json) — identidade de food (vermelho), janela fechável.
import { Form, FoxForm, View, Container, Row, Column, Card, FlatButton, Label, Shape, Timer } from "@vfp/core";

@Form({
  caption: "FoxFood - Totem",
  width: 600,
  height: 860,
  props: { AutoCenter: true, WindowType: 1 },
})
export class Totem extends FoxForm {
  step: number = 1; // 1 home · 2 modo · 3 cardapio · 4 pagamento · 5 aprovado
  viagem: boolean = false;
  qBurger: number = 0; qBatata: number = 0; qRefri: number = 0; qShake: number = 0;
  total: number = 0; paso: number = 0;

  Init(): void { this.mostrar(); }

  // --- navegação ---
  irModo(): void { this.step = 2; this.mostrar(); }
  escolherComer(): void { this.viagem = false; this.step = 3; this.refresh(); this.mostrar(); }
  escolherLevar(): void { this.viagem = true; this.step = 3; this.refresh(); this.mostrar(); }
  cancelarModo(): void { this.step = 1; this.mostrar(); }
  voltarHome(): void { this.step = 1; this.limpar(); this.mostrar(); }

  // --- cardápio: + / - por produto ---
  addBurger(): void { this.qBurger = this.qBurger + 1; this.refresh(); }
  subBurger(): void { if (this.qBurger > 0) { this.qBurger = this.qBurger - 1; } this.refresh(); }
  addBatata(): void { this.qBatata = this.qBatata + 1; this.refresh(); }
  subBatata(): void { if (this.qBatata > 0) { this.qBatata = this.qBatata - 1; } this.refresh(); }
  addRefri(): void { this.qRefri = this.qRefri + 1; this.refresh(); }
  subRefri(): void { if (this.qRefri > 0) { this.qRefri = this.qRefri - 1; } this.refresh(); }
  addShake(): void { this.qShake = this.qShake + 1; this.refresh(); }
  subShake(): void { if (this.qShake > 0) { this.qShake = this.qShake - 1; } this.refresh(); }

  refresh(): void {
    this.lblQBurger.caption = "" + this.qBurger;
    this.lblQBatata.caption = "" + this.qBatata;
    this.lblQRefri.caption = "" + this.qRefri;
    this.lblQShake.caption = "" + this.qShake;
    this.total = this.qBurger * 25 + this.qBatata * 15 + this.qRefri * 9 + this.qShake * 19;
    this.lblTotal.caption = "R$ " + this.total;
  }

  limpar(): void {
    this.qBurger = 0; this.qBatata = 0; this.qRefri = 0; this.qShake = 0;
    this.lblStatusCard.caption = ""; this.refresh();
  }

  irPagamento(): void {
    if (this.total <= 0) { this.lblStatusCard.caption = "Adicione itens ao pedido para continuar."; return; }
    this.step = 4;
    this.lblTotalPag.caption = "R$ " + this.total;
    this.lblStatusPag.caption = "Escolha a forma de pagamento";
    this.shpBarPag.width = 2;
    this.mostrar();
  }
  cancelarPag(): void { this.step = 3; this.mostrar(); }

  // --- pagamento (mock): qualquer método processa com barra de progresso ---
  processar(): void {
    this.lblStatusPag.caption = "Processando pagamento...";
    this.paso = 0; this.shpBarPag.width = 2; this.tmr.enabled = true;
  }
  tick(): void {
    this.paso = this.paso + 1;
    this.shpBarPag.width = this.shpBarPag.width + 115;
    if (this.paso < 4) { return; }
    this.tmr.enabled = false;
    this.step = 5; this.mostrar();
  }

  // --- visibilidade por tela ---
  ocultarTudo(): void {
    this.pHome.visible = false; this.pModo.visible = false; this.pCardapio.visible = false;
    this.pPagamento.visible = false; this.pAprovado.visible = false;
  }
  mostrar(): void {
    this.ocultarTudo();
    switch (this.step) {
      case 1: this.pHome.visible = true; break;
      case 2: this.pModo.visible = true; break;
      case 3: this.pCardapio.visible = true; break;
      case 4: this.pPagamento.visible = true; break;
      case 5: this.pAprovado.visible = true; break;
    }
  }

  render() {
    return (
      <View absolute width={600} height={860} padding={0}>
        {/* ───────────────── HOME ───────────────── */}
        <Container name="pHome" color="bg" borderColor="bg" left={0} top={0} width={600} height={860}
          align="center" justify="center" gap={18} padding={48}>
          <Label caption="FoxFood" transparent bold fontSize={46} textColor="primary" textAlign="center" width={460} height={64} />
          <Label caption="Autoatendimento" transparent fontSize={18} textColor="muted" textAlign="center" width={460} height={28} />
          <Label caption="Peca em segundos, sem fila." transparent fontSize={14} textColor="muted" textAlign="center" width={460} height={24} />
          <FlatButton caption="Toque para comecar" variant="primary" onClick="irModo" width={320} height={60} />
        </Container>

        {/* ───────────────── MODO DE ENTREGA ───────────────── */}
        <Container name="pModo" color="bg" borderColor="bg" left={0} top={0} width={600} height={860}
          align="center" justify="center" gap={22} padding={40}>
          <Label caption="Como prefere?" transparent bold fontSize={28} textColor="onSurface" textAlign="center" width={500} height={40} />
          <Row gap={20} align="center">
            <FlatButton caption="Comer aqui" variant="primary" onClick="escolherComer" width={210} height={120} />
            <FlatButton caption="Para levar" variant="secondary" onClick="escolherLevar" width={210} height={120} />
          </Row>
          <FlatButton caption="Voltar" variant="ghost" onClick="cancelarModo" width={160} height={42} />
        </Container>

        {/* ───────────────── CARDAPIO ───────────────── */}
        <Container name="pCardapio" color="bg" borderColor="bg" left={0} top={0} width={600} height={860}
          align="stretch" gap={12} padding={24}>
          <Label caption="Monte seu pedido" transparent bold fontSize={24} textColor="onSurface" width={540} height={36} />

          <Card title="Burger Classico - R$ 25">
            <Row gap={14} align="center" justify="end">
              <FlatButton caption="-" variant="secondary" onClick="subBurger" width={48} height={40} />
              <Label name="lblQBurger" caption="0" transparent bold fontSize={22} textColor="onSurface" textAlign="center" width={48} height={30} />
              <FlatButton caption="+" variant="primary" onClick="addBurger" width={48} height={40} />
            </Row>
          </Card>
          <Card title="Batata Frita - R$ 15">
            <Row gap={14} align="center" justify="end">
              <FlatButton caption="-" variant="secondary" onClick="subBatata" width={48} height={40} />
              <Label name="lblQBatata" caption="0" transparent bold fontSize={22} textColor="onSurface" textAlign="center" width={48} height={30} />
              <FlatButton caption="+" variant="primary" onClick="addBatata" width={48} height={40} />
            </Row>
          </Card>
          <Card title="Refrigerante - R$ 9">
            <Row gap={14} align="center" justify="end">
              <FlatButton caption="-" variant="secondary" onClick="subRefri" width={48} height={40} />
              <Label name="lblQRefri" caption="0" transparent bold fontSize={22} textColor="onSurface" textAlign="center" width={48} height={30} />
              <FlatButton caption="+" variant="primary" onClick="addRefri" width={48} height={40} />
            </Row>
          </Card>
          <Card title="Milkshake - R$ 19">
            <Row gap={14} align="center" justify="end">
              <FlatButton caption="-" variant="secondary" onClick="subShake" width={48} height={40} />
              <Label name="lblQShake" caption="0" transparent bold fontSize={22} textColor="onSurface" textAlign="center" width={48} height={30} />
              <FlatButton caption="+" variant="primary" onClick="addShake" width={48} height={40} />
            </Row>
          </Card>

          <Row gap={10} align="center" justify="between">
            <Label caption="Total" transparent fontSize={18} textColor="muted" width={120} height={36} />
            <Label name="lblTotal" caption="R$ 0" transparent bold fontSize={30} textColor="primary" textAlign="right" width={300} height={40} />
          </Row>
          <Label name="lblStatusCard" caption="" transparent bold fontSize={13} textColor="primary" width={540} height={22} />
          <Row gap={12} align="center">
            <FlatButton caption="Limpar" variant="secondary" onClick="limpar" width={150} height={50} />
            <FlatButton caption="Pagar" variant="primary" onClick="irPagamento" grow={1} height={50} />
          </Row>
        </Container>

        {/* ───────────────── PAGAMENTO ───────────────── */}
        <Container name="pPagamento" color="bg" borderColor="bg" left={0} top={0} width={600} height={860}
          align="center" gap={16} padding={36}>
          <Label caption="Pagamento" transparent bold fontSize={26} textColor="onSurface" textAlign="center" width={500} height={38} />
          <Label caption="Total a pagar" transparent fontSize={15} textColor="muted" textAlign="center" width={500} height={24} />
          <Label name="lblTotalPag" caption="R$ 0" transparent bold fontSize={48} textColor="primary" textAlign="center" width={500} height={64} />
          <FlatButton caption="Cartao de credito" variant="primary" onClick="processar" width={420} height={56} />
          <FlatButton caption="Cartao de debito" variant="primary" onClick="processar" width={420} height={56} />
          <FlatButton caption="Pix" variant="primary" onClick="processar" width={420} height={56} />
          <Label name="lblStatusPag" caption="" transparent bold fontSize={15} textColor="onSurface" textAlign="center" width={460} height={24} />
          <Shape name="shpBarPag" color="success" rounded={6} width={2} height={12} left={90} top={612} />
          <FlatButton caption="Cancelar" variant="ghost" onClick="cancelarPag" width={180} height={44} />
        </Container>

        {/* ───────────────── APROVADO ───────────────── */}
        <Container name="pAprovado" color="bg" borderColor="bg" left={0} top={0} width={600} height={860}
          align="center" justify="center" gap={18} padding={48}>
          <Shape color="success" rounded={99} width={96} height={96} />
          <Label caption="Pedido aprovado!" transparent bold fontSize={32} textColor="success" textAlign="center" width={500} height={46} />
          <Label caption="Retire seu pedido na esteira." transparent fontSize={15} textColor="muted" textAlign="center" width={500} height={24} />
          <FlatButton caption="Novo pedido" variant="primary" onClick="voltarHome" width={300} height={56} />
        </Container>

        <Timer name="tmr" disabled interval={240} onTimer="tick" left={0} top={0} width={0} height={0} />
      </View>
    );
  }
}
