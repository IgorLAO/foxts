* run.prg — roda o showcase com a NAVEGACAO funcionando. O segredo: SET PATH p/ o dir dos
* SCX, pois a navegacao usa `DO FORM <Nome>` (bare name) e o VFP precisa achar o .scx na
* PATH. Deriva o dir do proprio run.prg (portavel). Uso:  DO run.prg   (ou via foxcli/EXE).
LOCAL lcHome, lcDist
lcHome = ADDBS(JUSTPATH(SYS(16,1)))   && dir do run.prg (showcase/react-app)
lcDist = lcHome + "dist"
SET DEFAULT TO (lcDist)
SET PATH TO (lcDist)
ON SHUTDOWN CLEAR EVENTS
DO FORM DashboardPage.scx
READ EVENTS
