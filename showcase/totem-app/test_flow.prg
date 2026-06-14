* test_flow.prg — percorre o FLUXO INTEIRO no VFP (NOSHOW) e confere o estado.
LOCAL loF, r
r = ""
DO FORM ("C:\projectos\testesvf\foxts\showcase\totem-app\Totem.scx") NAME loF NOSHOW

r = r + "inicio step=" + TRANSFORM(loF.step) + " (esp 1)" + CHR(13)
loF.telaClick()                 && home -> modo
r = r + "telaClick -> step=" + TRANSFORM(loF.step) + " (esp 2)  hComer.vis=" + TRANSFORM(loF.hComer.Visible) + CHR(13)
loF.escolherComer()             && modo -> cardapio
r = r + "escolherComer -> step=" + TRANSFORM(loF.step) + " (esp 3)  viagem=" + TRANSFORM(loF.viagem) + "  hAddBurger.vis=" + TRANSFORM(loF.hAddBurger.Visible) + CHR(13)
loF.addBurger()
loF.addBurger()
loF.addRefri()                  && 2*25 + 9 = 59
r = r + "2 burger + 1 refri: total=" + TRANSFORM(loF.total) + " (esp 59)  lblTotal='" + loF.lblTotal.Caption + "'  qBurger='" + loF.lblQBurger.Caption + "'" + CHR(13)
loF.irPagamento()               && cardapio -> pagamento
r = r + "irPagamento -> step=" + TRANSFORM(loF.step) + " (esp 4)  lblTotalPag='" + loF.lblTotalPag.Caption + "'  hPix.vis=" + TRANSFORM(loF.hPix.Visible) + CHR(13)
loF.processar()                 && inicia animacao
r = r + "processar -> status='" + loF.lblStatusPag.Caption + "'" + CHR(13)
loF.tick()
loF.tick()
loF.tick()
loF.tick()                      && termina -> aprovado
r = r + "4 ticks -> step=" + TRANSFORM(loF.step) + " (esp 5)  total=" + TRANSFORM(loF.total) + " (esp 0)" + CHR(13)
loF.telaClick()                 && aprovado -> home
r = r + "telaClick -> step=" + TRANSFORM(loF.step) + " (esp 1)  hPagar.vis=" + TRANSFORM(loF.hPagar.Visible) + " (esp .F.)" + CHR(13)

? r
loF = .NULL.
RETURN
