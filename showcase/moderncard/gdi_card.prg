* gdi_card.prg - card "web moderno" desenhado em RUNTIME no VFP com GDIPlusX.
* Gradiente linear + cantos arredondados (GraphicsPath/AddArc) + sombra suave
* (rounds empilhados de baixa opacidade) + texto anti-aliased. Renderiza off-screen
* num Bitmap e salva PNG (sem GUI -> roda headless via foxcli run).
LPARAMETERS tcOut
LOCAL lcOut, loErr
lcOut = IIF(EMPTY(tcOut), "C:\projectos\testesvf\foxts\showcase\moderncard\out_gdi.png", tcOut)

TRY
    SET PATH TO C:\projectos\testesvf\zOUTROS\GDIPlusX\source ADDITIVE
    DO ("C:\projectos\testesvf\zOUTROS\GDIPlusX\source\System.prg")

    LOCAL loD, loBmp, loGfx, i
    loD = _SCREEN.System.Drawing
    loBmp = loD.Bitmap.New(380, 200)
    loGfx = loD.Graphics.FromImage(loBmp)
    loGfx.SmoothingMode = loD.Drawing2D.SmoothingMode.AntiAlias
    loGfx.TextRenderingHint = loD.Text.TextRenderingHint.ClearTypeGridFit

    * fundo slate-900 (como o dashboard)
    loGfx.Clear(loD.Color.FromArgb(255, 15, 23, 42))

    * sombra suave: varios rounds deslocados, alpha baixo
    FOR i = 8 TO 1 STEP -1
        loGfx.FillPath(loD.SolidBrush.New(loD.Color.FromArgb(12, 0, 0, 0)), ;
            RoundRect(loD, 24, 26 + i, 332, 140, 22))
    ENDFOR

    * card: gradiente linear roxo -> ciano, cantos arredondados
    LOCAL loRect, loBrush
    loRect  = loD.Rectangle.New(24, 24, 332, 140)
    loBrush = loD.Drawing2D.LinearGradientBrush.New(loRect, ;
        loD.Color.FromArgb(255, 124, 58, 237), loD.Color.FromArgb(255, 14, 165, 233), 50)
    loGfx.FillPath(loBrush, RoundRect(loD, 24, 24, 332, 140, 22))

    * textos anti-aliased
    loGfx.DrawString("Faturamento", loD.Font.New("Segoe UI", 11), ;
        loD.SolidBrush.New(loD.Color.FromArgb(225, 237, 233, 254)), 44, 44)
    loGfx.DrawString("R$ 18.4k", loD.Font.New("Segoe UI", 30, 1), ;
        loD.SolidBrush.New(loD.Color.FromArgb(255, 255, 255, 255)), 42, 70)
    loGfx.DrawString("+12% vs ontem", loD.Font.New("Segoe UI", 10), ;
        loD.SolidBrush.New(loD.Color.FromArgb(235, 209, 250, 229)), 44, 130)

    loBmp.Save(lcOut, loD.Imaging.ImageFormat.Png)
    ? "OK " + lcOut
CATCH TO loErr
    ? "ERRO " + loErr.Message + " (linha " + TRANSFORM(loErr.LineNo) + ")"
ENDTRY
RETURN

PROCEDURE RoundRect(loD, x, y, w, h, r)
    LOCAL loPath
    loPath = loD.Drawing2D.GraphicsPath.New()
    loPath.StartFigure()
    loPath.AddArc(x, y, 2 * r, 2 * r, 180, 90)
    loPath.AddArc(x + w - 2 * r, y, 2 * r, 2 * r, 270, 90)
    loPath.AddArc(x + w - 2 * r, y + h - 2 * r, 2 * r, 2 * r, 0, 90)
    loPath.AddArc(x, y + h - 2 * r, 2 * r, 2 * r, 90, 90)
    loPath.CloseFigure()
    RETURN loPath
ENDPROC
