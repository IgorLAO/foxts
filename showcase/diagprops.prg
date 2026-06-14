* diagprops.prg — dump das PROPERTIES gravadas no SCX (acha bug de codegen de cor).
LPARAMETERS tcScx, tcLog
USE (tcScx) AGAIN SHARED ALIAS scx
LOCAL lcOut
lcOut = ""
SCAN FOR !EMPTY(objname)
	lcOut = lcOut + "=== " + ALLTRIM(objname) + " [" + ALLTRIM(baseclass) + "] ===" + CHR(13) + CHR(10)
	lcOut = lcOut + ALLTRIM(properties) + CHR(13) + CHR(10) + CHR(13) + CHR(10)
ENDSCAN
USE
STRTOFILE(lcOut, tcLog)
