// ui-kit.form.tsx — demo do FoxTS UI Kit (slice 1): tokens + <Card> + <FormField>.
// O visual (surface/borda/tipografia/fundo) vem de vfp.theme.json — trocar os tokens
// (ou mode: "dark") re-estiliza este form inteiro no próximo build, sem tocar no JSX.
import { Form, Column, Card, FormField, FormActions } from "@vfp/core";

@Form({ caption: "UI Kit - Cadastro", width: 420, height: 380 })
export class UiKitForm {
  salvar(): void {
    // TODO: persistir (vira PROCEDURE salvar do form)
  }
  fechar(): void {
    // TODO: this.Release()
  }
  render() {
    return (
      <Column gap={14} padding={16}>
        <Card title="Dados do Cliente">
          <FormField label="Nome" required bind="nome" width={260} />
          <FormField label="CPF" bind="cpf" width={160} />
        </Card>
        <Card title="Endereço">
          <FormField label="Cidade" bind="cidade" width={200} />
          <FormField label="UF" bind="uf" width={60} />
        </Card>
        <FormActions ok="Salvar" cancel="Cancelar" icon="save" onOk="salvar" onCancel="fechar" />
      </Column>
    );
  }
}
