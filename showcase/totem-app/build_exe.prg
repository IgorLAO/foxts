* build_exe.prg — compila o totem num EXE standalone (dist\FoxFood.exe). Cria um projeto
* com main.prg (entrada) + Totem.scx (a tela, com tema baked no SCX) e roda Project.Build
* com nBuildAction=3 (BUILDEXE). Uso (foxcli): foxcli run build_exe.prg --timeout 300
LOCAL lcDir, lcExe, loP
lcDir = "C:\projectos\testesvf\foxts\showcase\totem-app\"
lcExe = lcDir + "dist\FoxFood.exe"
SET DEFAULT TO (lcDir)
SET SAFETY OFF
IF FILE(lcExe)
  ERASE (lcExe)
ENDIF
* projeto novo (limpo)
IF FILE(lcDir + "FoxFood.pjx")
  DELETE FILE (lcDir + "FoxFood.pjx")
  DELETE FILE (lcDir + "FoxFood.pjt")
ENDIF
CREATE PROJECT (lcDir + "FoxFood") NOWAIT NOSHOW
loP = _VFP.Projects(_VFP.Projects.Count)
loP.Files.Add("main.prg")
loP.SetMain("main.prg")
loP.Files.Add("Totem.scx")
* nBuildAction 3 = BUILDACTION_BUILDEXE; lRebuildAll=.T.
loP.Build(lcExe, 3, .T., .F., .F.)
loP.Close()
STRTOFILE("EXE existe: " + IIF(FILE(lcExe), "SIM (" + TRANSFORM(FSIZE(lcExe)) + " bytes)", "NAO") + CHR(13)+CHR(10), lcDir + "dist\build.log", 0)
QUIT
