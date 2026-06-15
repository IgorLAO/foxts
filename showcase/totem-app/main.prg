* main.prg — ponto de entrada do EXE FoxFood. Abre o totem (form modal); ao fechar
* (botão X do header flat -> Release), DO FORM retorna e o EXE encerra.
SET TALK OFF
SET SAFETY OFF
* captura de erros: qualquer erro de runtime (inclusive Init/Load do form) cai em
* foxts-errors.log ao lado do EXE, com numero/mensagem/linha/programa, em vez de um
* dialogo travando o totem. A PROCEDURE fica no fim (o VFP encerra o fluxo principal ao
* achar PROCEDURE) e le o caminho de uma PUBLIC (o LOCAL nao vive no escopo dela).
PUBLIC gcFoxtsErrLog
gcFoxtsErrLog = ADDBS(JUSTPATH(SYS(16,1))) + "foxts-errors.log"
ON ERROR DO FoxtsOnError WITH ERROR(), MESSAGE(), MESSAGE(1), LINENO(), PROGRAM()
* maximiza o shell do VFP como "fundo" da janela do totem (kiosk simples e confiável)
_SCREEN.Caption = "FoxFood"
_SCREEN.WindowState = 2
DO FORM Totem.scx

* --- ON ERROR: grava cada erro de runtime no foxts-errors.log ---------------
PROCEDURE FoxtsOnError
LPARAMETERS tnError, tcMessage, tcCode, tnLine, tcProgram
LOCAL lcEntry, lnH
lcEntry = TTOC(DATETIME()) + "  erro " + TRANSFORM(tnError) + ": " + tcMessage + CHR(13) + CHR(10) ;
  + "    em " + tcProgram + " (linha " + TRANSFORM(tnLine) + ")" + CHR(13) + CHR(10) ;
  + "    codigo: " + tcCode + CHR(13) + CHR(10) ;
  + REPLICATE("-", 60) + CHR(13) + CHR(10)
IF FILE(gcFoxtsErrLog)
  lnH = FOPEN(gcFoxtsErrLog, 2)  && 2 = leitura/escrita
ELSE
  lnH = FCREATE(gcFoxtsErrLog)
ENDIF
IF lnH >= 0
  =FSEEK(lnH, 0, 2)  && vai para o fim do arquivo (append)
  =FWRITE(lnH, lcEntry)
  =FCLOSE(lnH)
ENDIF
RETURN
