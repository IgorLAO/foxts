* readback.prg — instancia o SCX (NOSHOW) e dumpa as cores REAIS aplicadas.
LPARAMETERS tcScx, tcLog
LOCAL lcS, loC, lcCrlf, lnI
lcCrlf = CHR(13) + CHR(10)
DO FORM (tcScx) NAME loForm NOSHOW
lcS = "screen.BackColor=" + TRANSFORM(_screen.BackColor) + lcCrlf
lcS = lcS + "form.BackColor=" + TRANSFORM(loForm.BackColor) + " (esperado 16579320)" + lcCrlf
FOR lnI = 1 TO loForm.ControlCount
	loC = loForm.Controls(lnI)
	lcS = lcS + PADR(loC.Name, 14) + " " + PADR(loC.BaseClass, 10)
	lcS = lcS + " back=" + TRANSFORM(IIF(PEMSTATUS(loC, "BackColor", 5), loC.BackColor, -9))
	lcS = lcS + " bs=" + TRANSFORM(IIF(PEMSTATUS(loC, "BackStyle", 5), loC.BackStyle, -9)) + lcCrlf
ENDFOR
* PROBE: setar a cor em RUNTIME funciona? (se sim, emito cores no Init)
LOCAL loT
loT = loForm.Controls(1)
loT.BackColor = 8454143  && RGB(255,255,128) distinto
lcS = lcS + "--- runtime set em " + loT.Name + ": back=" + TRANSFORM(loT.BackColor) + " (esperado 8454143)" + lcCrlf
loForm.Release()
STRTOFILE(lcS, tcLog)
