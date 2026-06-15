* main.prg — ponto de entrada do EXE FoxFood. Abre o totem (form modal); ao fechar
* (botão X do header flat -> Release), DO FORM retorna e o EXE encerra.
SET TALK OFF
SET SAFETY OFF
* maximiza o shell do VFP como "fundo" da janela do totem (kiosk simples e confiável)
_SCREEN.Caption = "FoxFood"
_SCREEN.WindowState = 2
DO FORM Totem.scx
