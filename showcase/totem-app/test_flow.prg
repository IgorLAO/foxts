* test_flow.prg — dirige TODAS as funções do totem (NOSHOW) e confere o estado.
* Cobre: navegação (home->modo->cardapio->pagamento->aprovado->home), +/- por produto,
* total, sub que não fica negativo, bloqueio de pagamento com carrinho vazio, ticks do
* pagamento -> aprovado, e limpar. Uso (foxcli): foxcli run test_flow.prg --timeout 120
LPARAMETERS tcOut
LOCAL lcDir
lcDir = "C:\projectos\testesvf\foxts\showcase\totem-app\"
IF EMPTY(m.tcOut)
  tcOut = lcDir + "dist\flow.test.txt"
ENDIF
SET DEFAULT TO (lcDir)
LOCAL loF, lcR, i
lcR = "=== TESTE DE FLUXO / FUNCOES DO TOTEM ===" + CRLF()
DO FORM (lcDir + "Totem.scx") NAME loF NOSHOW

lcR = lcR + ai("step inicial (home)", loF.step, 1)

loF.irModo()
lcR = lcR + ai("irModo -> step modo", loF.step, 2)
lcR = lcR + al("  pModo visivel", loF.pModo.visible)
lcR = lcR + al("  pHome oculto", NOT loF.pHome.visible)

loF.escolherComer()
lcR = lcR + ai("escolherComer -> step cardapio", loF.step, 3)
lcR = lcR + al("  viagem = comer aqui (.F.)", NOT loF.viagem)

loF.addBurger()
loF.addBurger()
loF.addRefri()
lcR = lcR + ai("2x Burger + 1x Refri -> total", loF.total, 59)
lcR = lcR + as("  lblTotal", loF.pCardapio.lblTotal.caption, "R$ 59")
lcR = lcR + as("  lblQBurger", loF.pCardapio.cnt5.lblQBurger.caption, "2")
lcR = lcR + as("  lblQRefri", loF.pCardapio.cnt11.lblQRefri.caption, "1")

loF.subBurger()
lcR = lcR + ai("subBurger -> total", loF.total, 34)
loF.subBatata()
lcR = lcR + ai("subBatata nao fica negativo (qBatata)", loF.qBatata, 0)

loF.irPagamento()
lcR = lcR + ai("irPagamento -> step pagamento", loF.step, 4)
lcR = lcR + as("  lblTotalPag", loF.pPagamento.lblTotalPag.caption, "R$ 34")

loF.processar()
lcR = lcR + as("  status processando", loF.pPagamento.lblStatusPag.caption, "Processando pagamento...")
FOR i = 1 TO 4
  loF.tick()
ENDFOR
lcR = lcR + ai("4 ticks -> aprovado", loF.step, 5)
lcR = lcR + al("  pAprovado visivel", loF.pAprovado.visible)

loF.voltarHome()
lcR = lcR + ai("voltarHome -> step home", loF.step, 1)
lcR = lcR + ai("  carrinho zerado (total)", loF.total, 0)
lcR = lcR + as("  lblQBurger zerado", loF.pCardapio.cnt5.lblQBurger.caption, "0")

* bloqueio: pagar com carrinho vazio nao avanca
loF.irModo()
loF.escolherLevar()
lcR = lcR + al("escolherLevar viagem = levar (.T.)", loF.viagem)
loF.irPagamento()
lcR = lcR + ai("irPagamento c/ carrinho vazio NAO avanca (step)", loF.step, 3)
lcR = lcR + al("  mostra aviso", NOT EMPTY(loF.pCardapio.lblStatusCard.caption))

loF.Release()
lcR = lcR + CRLF() + IIF("FALHA" $ lcR, ">>> HOUVE FALHA", ">>> TODOS OS CHECKS PASSARAM")
STRTOFILE(lcR, m.tcOut, 0)
QUIT

FUNCTION ai(tcName, tnGot, tnExp)
RETURN IIF(tnGot = tnExp, "[OK]   ", "[FALHA] ") + tcName + " = " + TRANSFORM(tnGot) + ;
  IIF(tnGot = tnExp, "", " (esperado " + TRANSFORM(tnExp) + ")") + CRLF()

FUNCTION as(tcName, tcGot, tcExp)
LOCAL llOk
llOk = ALLTRIM(tcGot) == ALLTRIM(tcExp)
RETURN IIF(llOk, "[OK]   ", "[FALHA] ") + tcName + " = [" + ALLTRIM(tcGot) + "]" + ;
  IIF(llOk, "", " (esperado [" + ALLTRIM(tcExp) + "])") + CRLF()

FUNCTION al(tcName, tlGot)
RETURN IIF(tlGot, "[OK]   ", "[FALHA] ") + tcName + CRLF()

FUNCTION CRLF
RETURN CHR(13) + CHR(10)
