// ModernTotem.form.tsx — totem MODERNO e INTERATIVO num unico form. O visual vem de
// um fundo renderizado (canvas) e a interacao de controles TRANSPARENTES por cima
// (overlay absoluto): labels-hotspot clicaveis nos botoes [+]/[-]/[Pagar]/[Limpar] e
// labels transparentes para os numeros que mudam (quantidade/total/status).
// Fluxo: 1 Home -> 2 Cardapio (interativo) -> 3 Aprovado -> volta. Cada botao tem funcao.
import { Form, FoxForm, View, Image, Label, Shape, Timer } from "@vfp/core";


@Form({
  caption: "Totem",
  width: 612,
  height: 956,
  props: { BackColor: "RGB(250, 250, 250)", AutoCenter: true, WindowType: 1 },
})
export class ModernTotem extends FoxForm {
  step: number = 1; // 1 home, 2 cardapio, 3 aprovado
  qBurger: number = 0; qBatata: number = 0; qRefri: number = 0; qShake: number = 0;
  total: number = 0; paso: number = 0;

  Init(): void { this.mostrar(); }

  // clique no fundo: avanca home->cardapio e aprovado->home (no cardapio nao faz nada)
  telaClick(): void {
    if (this.step === 1) { this.step = 2; this.mostrar(); return; }
    if (this.step === 3) { this.step = 1; this.limpar(); this.mostrar(); }
  }

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
    this.lblStatus.caption = ""; this.shpBar.width = 4; this.refresh();
  }

  pagar(): void {
    if (this.total <= 0) { this.lblStatus.caption = "Adicione itens ao pedido"; return; }
    this.lblStatus.caption = "Processando pagamento...";
    this.paso = 0; this.shpBar.width = 4; this.tmr.enabled = true;
  }

  tick(): void {
    this.paso = this.paso + 1;
    this.shpBar.width = this.shpBar.width + 140;
    if (this.paso < 4) { return; }
    this.tmr.enabled = false;
    this.step = 3; this.mostrar();
    this.qBurger = 0; this.qBatata = 0; this.qRefri = 0; this.qShake = 0; this.refresh();
    this.shpBar.width = 4;
  }

  // mostra/oculta os controles do cardapio conforme o passo
  setCard(vis: boolean): void {
    this.hSubBurger.visible = vis; this.hAddBurger.visible = vis; this.lblQBurger.visible = vis;
    this.hSubBatata.visible = vis; this.hAddBatata.visible = vis; this.lblQBatata.visible = vis;
    this.hSubRefri.visible = vis; this.hAddRefri.visible = vis; this.lblQRefri.visible = vis;
    this.hSubShake.visible = vis; this.hAddShake.visible = vis; this.lblQShake.visible = vis;
    this.lblTotal.visible = vis; this.lblStatus.visible = vis; this.shpBar.visible = vis;
    this.hLimpar.visible = vis; this.hPagar.visible = vis;
  }

  mostrar(): void {
    switch (this.step) {
      case 1: this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totemapp/home_m.png"; this.setCard(false); break;
      case 2: this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totemapp/cardapio_bg.png"; this.setCard(true); break;
      case 3: this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totemapp/aprovado_m.png"; this.setCard(false); break;
    }
  }

  render() {
    return (
      <View absolute width={600} height={920}>
        <Image name="tela" src={"C:/projectos/testesvf/foxts/showcase/totemapp/home_m.png"} left={0} top={0} width={600} height={920} onClick="telaClick" />

        {/* linha 1 — X-Burger (y=120) */}
        <Label name="hSubBurger" caption="" transparent left={394} top={142} width={52} height={52} onClick="subBurger" />
        <Label name="lblQBurger" caption="0" transparent textAlign="center" bold fontSize={22} textColor="#111827" left={448} top={156} width={64} height={28} />
        <Label name="hAddBurger" caption="" transparent left={514} top={142} width={52} height={52} onClick="addBurger" />
        {/* linha 2 — Batata (y=230) */}
        <Label name="hSubBatata" caption="" transparent left={394} top={252} width={52} height={52} onClick="subBatata" />
        <Label name="lblQBatata" caption="0" transparent textAlign="center" bold fontSize={22} textColor="#111827" left={448} top={266} width={64} height={28} />
        <Label name="hAddBatata" caption="" transparent left={514} top={252} width={52} height={52} onClick="addBatata" />
        {/* linha 3 — Refri (y=340) */}
        <Label name="hSubRefri" caption="" transparent left={394} top={362} width={52} height={52} onClick="subRefri" />
        <Label name="lblQRefri" caption="0" transparent textAlign="center" bold fontSize={22} textColor="#111827" left={448} top={376} width={64} height={28} />
        <Label name="hAddRefri" caption="" transparent left={514} top={362} width={52} height={52} onClick="addRefri" />
        {/* linha 4 — Shake (y=450) */}
        <Label name="hSubShake" caption="" transparent left={394} top={472} width={52} height={52} onClick="subShake" />
        <Label name="lblQShake" caption="0" transparent textAlign="center" bold fontSize={22} textColor="#111827" left={448} top={486} width={64} height={28} />
        <Label name="hAddShake" caption="" transparent left={514} top={472} width={52} height={52} onClick="addShake" />

        {/* total */}
        <Label name="lblTotal" caption="R$ 0" transparent textAlign="right" bold fontSize={30} textColor="#ed1e26" left={320} top={584} width={236} height={40} />
        {/* barra de progresso do pagamento (cresce no tick) */}
        <Shape name="shpBar" left={24} top={650} width={4} height={14} color="#16a34a" rounded={7} />
        {/* status */}
        <Label name="lblStatus" caption="" transparent bold fontSize={15} textColor="#283593" left={28} top={672} width={544} height={24} />

        {/* botoes (hotspots sobre o desenho) */}
        <Label name="hLimpar" caption="" transparent left={24} top={720} width={250} height={66} onClick="limpar" />
        <Label name="hPagar" caption="" transparent left={300} top={720} width={276} height={66} onClick="pagar" />

        <Timer name="tmr" disabled left={0} top={0} width={0} height={0} interval={260} onTimer="tick" />
      </View>
    );
  }
}
