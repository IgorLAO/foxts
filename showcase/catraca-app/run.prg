* run.prg — roda o showcase com a NAVEGACAO funcionando. A navegacao usa `DO FORM <Nome>`
* (bare name), entao o VFP precisa achar o .scx pela PATH. Deriva o dir do proprio run.prg
* (portavel). Fluxo: SplashPage -> LoginPage -> PrincipalPage -> ResultPage. Uso:  DO run.prg
LOCAL lcHome, lcDist
lcHome = ADDBS(JUSTPATH(SYS(16,1)))   && dir do run.prg (showcase/catraca-app)
lcDist = lcHome + "build\forms"       && SCX gerados por `vfp build`
SET DEFAULT TO (lcDist)
SET PATH TO (lcDist)
ON SHUTDOWN CLEAR EVENTS
DO FORM SplashPage.scx
READ EVENTS
