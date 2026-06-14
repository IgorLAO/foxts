// Totem.form.tsx — o totem COMPLETO e moderno num form só. Fundo renderizado (canvas)
// + overlay absoluto de controles transparentes (hotspots clicáveis e labels dinâmicos).
// Fluxo: Home -> Modo de entrega -> Cardápio (interativo) -> Pagamento -> Aprovado -> Home.
// Cada botão tem função; total/quantidades/status são estado real do form.
import { Form, FoxForm, View, Image, Label, Shape, Timer } from "@vfp/core";

@Form({
  caption: "Totem Alimentacao",
  width: 612,
  height: 956,
  props: { BackColor: "RGB(250, 250, 250)", AutoCenter: true, WindowType: 1 },
})
export class Totem extends FoxForm {
  step: number = 1; // 1 home, 2 modo, 3 cardapio, 4 pagamento, 5 aprovado
  viagem: boolean = false;
  qBurger: number = 0; qBatata: number = 0; qRefri: number = 0; qShake: number = 0;
  total: number = 0; paso: number = 0;

  Init(): void { this.mostrar(); }

  // clique no fundo: home->modo, aprovado->home (nas outras telas, os hotspots cuidam)
  telaClick(): void {
    if (this.step === 1) { this.step = 2; this.mostrar(); return; }
    if (this.step === 5) { this.step = 1; this.limpar(); this.mostrar(); }
  }

  // --- modo de entrega ---
  escolherComer(): void { this.viagem = false; this.step = 3; this.mostrar(); }
  escolherLevar(): void { this.viagem = true; this.step = 3; this.mostrar(); }
  cancelarModo(): void { this.step = 1; this.mostrar(); }

  // --- cardapio: + / - por produto ---
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
    if (this.total <= 0) { this.lblStatusCard.caption = "Adicione itens ao pedido"; return; }
    this.step = 4;
    this.lblTotalPag.caption = "R$ " + this.total;
    this.lblStatusPag.caption = "";
    this.shpBarPag.width = 4;
    this.mostrar();
  }
  cancelarPag(): void { this.step = 3; this.mostrar(); }

  // --- pagamento: qualquer metodo processa (mock) ---
  processar(): void {
    this.lblStatusPag.caption = "Processando pagamento...";
    this.paso = 0; this.shpBarPag.width = 4; this.tmr.enabled = true;
  }
  tick(): void {
    this.paso = this.paso + 1;
    this.shpBarPag.width = this.shpBarPag.width + 120;
    if (this.paso < 4) { return; }
    this.tmr.enabled = false;
    this.step = 5; this.mostrar();
    this.limpar();
  }

  // --- visibilidade por tela ---
  ocultarTudo(): void {
    this.hComer.visible = false; this.hLevar.visible = false; this.hCancelModo.visible = false;
    this.hSubBurger.visible = false; this.hAddBurger.visible = false; this.lblQBurger.visible = false;
    this.hSubBatata.visible = false; this.hAddBatata.visible = false; this.lblQBatata.visible = false;
    this.hSubRefri.visible = false; this.hAddRefri.visible = false; this.lblQRefri.visible = false;
    this.hSubShake.visible = false; this.hAddShake.visible = false; this.lblQShake.visible = false;
    this.lblTotal.visible = false; this.lblStatusCard.visible = false; this.hLimpar.visible = false; this.hPagar.visible = false;
    this.lblTotalPag.visible = false; this.hCredito.visible = false; this.hDebito.visible = false; this.hPix.visible = false;
    this.lblStatusPag.visible = false; this.shpBarPag.visible = false; this.hCancelPag.visible = false;
  }
  verModo(): void { this.hComer.visible = true; this.hLevar.visible = true; this.hCancelModo.visible = true; }
  verCardapio(): void {
    this.hSubBurger.visible = true; this.hAddBurger.visible = true; this.lblQBurger.visible = true;
    this.hSubBatata.visible = true; this.hAddBatata.visible = true; this.lblQBatata.visible = true;
    this.hSubRefri.visible = true; this.hAddRefri.visible = true; this.lblQRefri.visible = true;
    this.hSubShake.visible = true; this.hAddShake.visible = true; this.lblQShake.visible = true;
    this.lblTotal.visible = true; this.lblStatusCard.visible = true; this.hLimpar.visible = true; this.hPagar.visible = true;
  }
  verPagamento(): void {
    this.lblTotalPag.visible = true; this.hCredito.visible = true; this.hDebito.visible = true; this.hPix.visible = true;
    this.lblStatusPag.visible = true; this.shpBarPag.visible = true; this.hCancelPag.visible = true;
  }

  mostrar(): void {
    this.ocultarTudo();
    switch (this.step) {
      case 1: this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem-app/screens/home.png"; break;
      case 2: this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem-app/screens/modo.png"; this.verModo(); break;
      case 3: this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem-app/screens/cardapio.png"; this.verCardapio(); break;
      case 4: this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem-app/screens/pagamento.png"; this.verPagamento(); break;
      case 5: this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem-app/screens/aprovado.png"; break;
    }
  }

  render() {
    return (
      <View absolute width={600} height={920}>
        <Image name="tela" src="C:/projectos/testesvf/foxts/showcase/totem-app/screens/home.png" left={0} top={0} width={600} height={920} onClick="telaClick" />

        {/* modo de entrega */}
        <Label name="hComer" caption="" transparent left={40} top={280} width={240} height={300} onClick="escolherComer" />
        <Label name="hLevar" caption="" transparent left={320} top={280} width={240} height={300} onClick="escolherLevar" />
        <Label name="hCancelModo" caption="" transparent left={180} top={660} width={240} height={72} onClick="cancelarModo" />

        {/* cardapio — linha 1..4 */}
        <Label name="hSubBurger" caption="" transparent left={394} top={142} width={52} height={52} onClick="subBurger" />
        <Label name="lblQBurger" caption="0" transparent textAlign="center" bold fontSize={22} textColor="#111827" left={448} top={154} width={64} height={28} />
        <Label name="hAddBurger" caption="" transparent left={514} top={142} width={52} height={52} onClick="addBurger" />
        <Label name="hSubBatata" caption="" transparent left={394} top={252} width={52} height={52} onClick="subBatata" />
        <Label name="lblQBatata" caption="0" transparent textAlign="center" bold fontSize={22} textColor="#111827" left={448} top={264} width={64} height={28} />
        <Label name="hAddBatata" caption="" transparent left={514} top={252} width={52} height={52} onClick="addBatata" />
        <Label name="hSubRefri" caption="" transparent left={394} top={362} width={52} height={52} onClick="subRefri" />
        <Label name="lblQRefri" caption="0" transparent textAlign="center" bold fontSize={22} textColor="#111827" left={448} top={374} width={64} height={28} />
        <Label name="hAddRefri" caption="" transparent left={514} top={362} width={52} height={52} onClick="addRefri" />
        <Label name="hSubShake" caption="" transparent left={394} top={472} width={52} height={52} onClick="subShake" />
        <Label name="lblQShake" caption="0" transparent textAlign="center" bold fontSize={22} textColor="#111827" left={448} top={484} width={64} height={28} />
        <Label name="hAddShake" caption="" transparent left={514} top={472} width={52} height={52} onClick="addShake" />
        <Label name="lblTotal" caption="R$ 0" transparent textAlign="right" bold fontSize={30} textColor="#ed1e26" left={320} top={584} width={236} height={40} />
        <Label name="lblStatusCard" caption="" transparent bold fontSize={16} textColor="#283593" left={28} top={668} width={544} height={26} />
        <Label name="hLimpar" caption="" transparent left={24} top={720} width={250} height={66} onClick="limpar" />
        <Label name="hPagar" caption="" transparent left={300} top={720} width={276} height={66} onClick="irPagamento" />

        {/* pagamento */}
        <Label name="lblTotalPag" caption="R$ 0" transparent textAlign="center" bold fontSize={46} textColor="#ed1e26" left={100} top={188} width={400} height={56} />
        <Label name="hCredito" caption="" transparent left={60} top={350} width={480} height={78} onClick="processar" />
        <Label name="hDebito" caption="" transparent left={60} top={448} width={480} height={78} onClick="processar" />
        <Label name="hPix" caption="" transparent left={60} top={546} width={480} height={78} onClick="processar" />
        <Label name="lblStatusPag" caption="" transparent textAlign="center" bold fontSize={18} textColor="#283593" left={60} top={668} width={480} height={26} />
        <Shape name="shpBarPag" left={60} top={700} width={4} height={14} color="#16a34a" rounded={7} />
        <Label name="hCancelPag" caption="" transparent left={180} top={740} width={240} height={68} onClick="cancelarPag" />

        <Timer name="tmr" disabled left={0} top={0} width={0} height={0} interval={260} onTimer="tick" />
      </View>
    );
  }
}
