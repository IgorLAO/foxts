// TotemApp.form.tsx — o TOTEM rodavel: junta o fluxo inteiro do app React numa unica
// janela VFP. Uma <Image> mostra a tela atual; clicar avanca o passo (troca o Picture).
// O passo "processando" e ANIMADO por um <Timer> que troca os frames de progresso e,
// ao chegar em 100%, avanca sozinho para "aprovado". Tudo mocado, sem backend.
// Fluxo: 1 home > 2 modo > 3 cardapio > 4 item > 5 carrinho > 6 pagamento >
//        7 processando (anima) > 8 aprovado > (clique volta ao 1).
import { Form, FoxForm, Column, Image, Timer } from "@vfp/core";

@Form({
  caption: "Totem Alimentacao",
  width: 640,
  height: 1000,
  props: { BackColor: "RGB(250, 250, 250)", WindowType: 1, AutoCenter: true }, // modal + centrado
})
export class TotemApp extends FoxForm {
  step: number = 1;  // tela atual (1..8)
  frame: number = 0; // frame do progresso no passo "processando"

  // clique na tela: avanca o fluxo (no processando, ignora — o timer controla)
  avancar(): void {
    if (this.step === 7) {
      return;
    }
    this.step = this.step + 1;
    if (this.step > 8) {
      this.step = 1;
    }
    this.mostrar();
    if (this.step === 7) {
      this.frame = 0;
      this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/07_proc0.png";
      this.tmr.enabled = true; // liga a animacao do pagamento
    }
  }

  // timer: anima o "processando" e auto-avanca para "aprovado" no fim
  tick(): void {
    if (this.step !== 7) {
      this.tmr.enabled = false;
      return;
    }
    this.frame = this.frame + 1;
    switch (this.frame) {
      case 1:
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/07_proc1.png";
        break;
      case 2:
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/07_proc2.png";
        break;
      case 3:
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/07_proc3.png";
        break;
      default:
        this.tmr.enabled = false;
        this.step = 8;
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/08_aprovado.png";
    }
  }

  // troca o Picture conforme o passo atual
  mostrar(): void {
    switch (this.step) {
      case 1:
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/01_home.png";
        break;
      case 2:
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/02_modo.png";
        break;
      case 3:
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/03_produtos.png";
        break;
      case 4:
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/04_item.png";
        break;
      case 5:
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/05_carrinho.png";
        break;
      case 6:
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/06_pagamento.png";
        break;
      case 8:
        this.tela.picture = "C:/projectos/testesvf/foxts/showcase/totem/08_aprovado.png";
        break;
    }
  }

  render() {
    return (
      <Column padding={0}>
        <Image name="tela" src="C:/projectos/testesvf/foxts/showcase/totem/01_home.png" width={620} height={956} stretch={1} onClick="avancar" />
        <Timer name="tmr" width={0} height={0} interval={450} onTimer="tick" />
      </Column>
    );
  }
}
