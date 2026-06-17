* run.prg — abre o Totem completo (modal). Clique para navegar; no cardapio use + / -,
* Pagar leva ao pagamento, escolha o metodo e veja aprovar. Feche a janela para sair.
* Rodar: foxcli run showcase/totem-app/run.prg --timeout 600
LOCAL lcDir
lcDir = ADDBS(JUSTPATH(SYS(16,1)))   && diretório do próprio .prg em runtime
DO FORM (lcDir + "Totem.scx")
