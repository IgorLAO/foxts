// layouts/AppLayout.tsx — shell do app de apostas: Sidebar (Esportes/Apostas/Minhas/
// Carteira/Config) + Navbar + <Slot/> da pagina. Navegacao real: os itens chamam
// irApostas/irMinhas (DO FORM + Release). Reutilizado por todas as paginas.
import { Component, Row, Column, Sidebar, SidebarItem, Slot } from "@vfp/core";
import { Navbar } from "../components/Navbar";

@Component()
export class AppLayout {
  title!: string;
  saldo!: string;
  navApostas?: boolean;
  navMinhas?: boolean;
  render() {
    return (
      <Row gap={0} align="stretch" height={864} padding={0}>
        <Sidebar width={200}>
          <SidebarItem label="Esportes" icon="trophy" />
          <SidebarItem label="Apostas" icon="target" active={this.navApostas} onClick="irApostas" />
          <SidebarItem label="Minhas Apostas" icon="star" active={this.navMinhas} onClick="irMinhas" />
          <SidebarItem label="Carteira" icon="wallet" />
          <SidebarItem label="Configuracoes" icon="settings" />
        </Sidebar>
        <Column gap={14} padding={18} grow={1}>
          <Navbar title={this.title} saldo={this.saldo} />
          <Slot />
        </Column>
      </Row>
    );
  }
}
