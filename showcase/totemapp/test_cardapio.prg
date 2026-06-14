* test_cardapio.prg — exercita as FUNCOES dos botoes no VFP (NOSHOW) e confere os
* resultados: add/sub mudam quantidade, total recalcula, pagar() processa e aprova.
LOCAL loF, lcR
lcR = ""
DO FORM ("C:\projectos\testesvf\foxts\showcase\totemapp\Cardapio.scx") NAME loF NOSHOW LINKED

loF.addBurger()   && 1
loF.addBurger()   && 2
loF.addBatata()   && 1
lcR = lcR + "apos 2 burger + 1 batata: total=" + TRANSFORM(loF.total) + " (esperado 65)" + CHR(13)
lcR = lcR + "  lblTotal='" + loF.lblTotal.Caption + "'  qBurger='" + loF.lblQBurger.Caption + "'" + CHR(13)

loF.subBurger()   && 1
lcR = lcR + "apos -1 burger: total=" + TRANSFORM(loF.total) + " (esperado 40)" + CHR(13)

loF.pagar()
lcR = lcR + "apos pagar: status='" + loF.lblStatus.Caption + "'" + CHR(13)
loF.tick()
loF.tick()
loF.tick()
loF.tick()
lcR = lcR + "apos 4 ticks: status='" + loF.lblStatus.Caption + "'  total=" + TRANSFORM(loF.total) + " (esperado 0)" + CHR(13)

? lcR
loF = .NULL.
RETURN
