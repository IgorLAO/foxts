// Cardapio.form.tsx — totem INTERATIVO de verdade (sem imagens estaticas). Cada botao
// tem funcao real: [+]/[-] mudam a quantidade de cada produto, o Total recalcula na hora,
// [Limpar] zera o pedido e [Pagar] processa (anima a barra) e aprova com uma senha.
// Estado real (quantidades/total) em propriedades do form; tudo TS -> FoxPro nativo.
import { Form, FoxForm, Column, Row, Label, Button, Shape, Timer } from "@vfp/core";

@Form({
  caption: "Totem - Pedido",
  width: 660,
  height: 760,
  props: { BackColor: "RGB(250, 250, 250)", AutoCenter: true, WindowType: 1 }, // modal: roda com DO FORM
})
export class Cardapio extends FoxForm {
  // quantidades por produto (estado do form) + total + passo da animacao
  qBurger: number = 0;
  qBatata: number = 0;
  qRefri: number = 0;
  qShake: number = 0;
  total: number = 0;
  paso: number = 0;

  // --- funcoes dos botoes + / - (uma por produto) ---
  addBurger(): void { this.qBurger = this.qBurger + 1; this.refresh(); }
  subBurger(): void { if (this.qBurger > 0) { this.qBurger = this.qBurger - 1; } this.refresh(); }
  addBatata(): void { this.qBatata = this.qBatata + 1; this.refresh(); }
  subBatata(): void { if (this.qBatata > 0) { this.qBatata = this.qBatata - 1; } this.refresh(); }
  addRefri(): void { this.qRefri = this.qRefri + 1; this.refresh(); }
  subRefri(): void { if (this.qRefri > 0) { this.qRefri = this.qRefri - 1; } this.refresh(); }
  addShake(): void { this.qShake = this.qShake + 1; this.refresh(); }
  subShake(): void { if (this.qShake > 0) { this.qShake = this.qShake - 1; } this.refresh(); }

  // recalcula quantidades exibidas e o total
  refresh(): void {
    this.lblQBurger.caption = "" + this.qBurger;
    this.lblQBatata.caption = "" + this.qBatata;
    this.lblQRefri.caption = "" + this.qRefri;
    this.lblQShake.caption = "" + this.qShake;
    this.total = this.qBurger * 25 + this.qBatata * 15 + this.qRefri * 9 + this.qShake * 19;
    this.lblTotal.caption = "R$ " + this.total;
  }

  // zera o pedido
  limpar(): void {
    this.qBurger = 0; this.qBatata = 0; this.qRefri = 0; this.qShake = 0;
    this.lblStatus.caption = "";
    this.shpBar.width = 4;
    this.refresh();
  }

  // paga: valida, mostra "processando" e liga a animacao da barra
  pagar(): void {
    if (this.total <= 0) {
      this.lblStatus.caption = "Adicione itens ao pedido";
      return;
    }
    this.lblStatus.caption = "Processando pagamento...";
    this.paso = 0;
    this.shpBar.width = 4;
    this.tmr.enabled = true;
  }

  // timer: enche a barra e, no fim, aprova e zera o pedido
  tick(): void {
    this.paso = this.paso + 1;
    this.shpBar.width = this.shpBar.width + 150;
    if (this.paso < 4) {
      return;
    }
    this.tmr.enabled = false;
    this.lblStatus.caption = "Pagamento aprovado! Senha A123";
    this.qBurger = 0; this.qBatata = 0; this.qRefri = 0; this.qShake = 0;
    this.refresh();
    this.shpBar.width = 4;
  }

  render() {
    return (
      <Column gap={12} padding={22}>
        <Label caption="Cardapio" bold fontSize={28} fontName="Segoe UI" textColor="#111827" width={600} height={42} />

        <Row gap={12} width={600} height={48} align="center">
          <Label caption="X-Burger" fontSize={18} width={230} height={26} />
          <Label caption="R$ 25" bold fontSize={18} textColor="#ed1e26" width={90} height={26} />
          <Button caption="-" onClick="subBurger" width={48} height={40} />
          <Label name="lblQBurger" caption="0" textAlign="center" bold fontSize={20} width={48} height={26} />
          <Button caption="+" onClick="addBurger" width={48} height={40} />
        </Row>
        <Row gap={12} width={600} height={48} align="center">
          <Label caption="Batata Frita" fontSize={18} width={230} height={26} />
          <Label caption="R$ 15" bold fontSize={18} textColor="#ed1e26" width={90} height={26} />
          <Button caption="-" onClick="subBatata" width={48} height={40} />
          <Label name="lblQBatata" caption="0" textAlign="center" bold fontSize={20} width={48} height={26} />
          <Button caption="+" onClick="addBatata" width={48} height={40} />
        </Row>
        <Row gap={12} width={600} height={48} align="center">
          <Label caption="Refrigerante" fontSize={18} width={230} height={26} />
          <Label caption="R$ 9" bold fontSize={18} textColor="#ed1e26" width={90} height={26} />
          <Button caption="-" onClick="subRefri" width={48} height={40} />
          <Label name="lblQRefri" caption="0" textAlign="center" bold fontSize={20} width={48} height={26} />
          <Button caption="+" onClick="addRefri" width={48} height={40} />
        </Row>
        <Row gap={12} width={600} height={48} align="center">
          <Label caption="Milk Shake" fontSize={18} width={230} height={26} />
          <Label caption="R$ 19" bold fontSize={18} textColor="#ed1e26" width={90} height={26} />
          <Button caption="-" onClick="subShake" width={48} height={40} />
          <Label name="lblQShake" caption="0" textAlign="center" bold fontSize={20} width={48} height={26} />
          <Button caption="+" onClick="addShake" width={48} height={40} />
        </Row>

        <Row gap={12} width={600} height={52} align="center">
          <Label caption="Total" bold fontSize={24} width={300} height={36} />
          <Label name="lblTotal" caption="R$ 0" bold fontSize={32} textColor="#ed1e26" textAlign="right" width={288} height={42} />
        </Row>

        <Shape name="shpBar" width={4} height={12} color="#16a34a" rounded={6} />
        <Label name="lblStatus" caption="" bold fontSize={18} textColor="#283593" width={600} height={28} />

        <Row gap={16} width={600} height={62} align="center">
          <Button caption="Limpar" onClick="limpar" width={180} height={54} />
          <Button caption="Pagar" onClick="pagar" width={300} height={54} />
        </Row>

        <Timer name="tmr" disabled width={0} height={0} interval={320} onTimer="tick" />
      </Column>
    );
  }
}
