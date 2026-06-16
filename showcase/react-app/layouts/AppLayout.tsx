// layouts/AppLayout.tsx — shell do app (estilo Next.js layout): Sidebar de navegação +
// área de conteúdo com Navbar no topo e um <Slot/> para a página. Recebe `title` por
// prop. REUTILIZADO por todas as páginas — é o que dá a moldura consistente ao app,
// escondendo a montagem do VFP atrás de um único componente declarativo.
import { Component, Row, Column, Sidebar, SidebarItem, Slot } from "@vfp/core";
import { Navbar } from "../components/Navbar";

@Component()
export class AppLayout {
  title!: string;
  navDashboard?: boolean;
  navClientes?: boolean;
  render() {
    return (
      <Row gap={0} align="stretch" height={552} padding={0}>
        <Sidebar width={200}>
          <SidebarItem label="Dashboard" icon="home" active={this.navDashboard} onClick="irDashboard" />
          <SidebarItem label="Clientes" icon="users" active={this.navClientes} onClick="irClientes" />
          <SidebarItem label="Produtos" icon="bag" />
          <SidebarItem label="Financeiro" icon="credit-card" />
          <SidebarItem label="Configuracoes" icon="settings" />
        </Sidebar>
        <Column gap={14} padding={18} grow={1}>
          <Navbar title={this.title} />
          <Slot />
        </Column>
      </Row>
    );
  }
}
