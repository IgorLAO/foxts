* capture_modern.prg — exercita a logica do ModernTotem e salva um screenshot real
* (PrintWindow -> GDI+ -> PNG) da tela do cardapio com itens adicionados.
LOCAL loErr, lcR
lcR = ""
TRY
    SET PATH TO C:\projectos\testesvf\zOUTROS\GDIPlusX\source ADDITIVE
    DO ("C:\projectos\testesvf\zOUTROS\GDIPlusX\source\System.prg")

    PUBLIC goF
    DO FORM ("C:\projectos\testesvf\foxts\showcase\totemapp\ModernTotem.scx") NAME goF NOSHOW
    goF.WindowType = 0  && modeless p/ poder capturar sem bloquear

    * vai para o cardapio e adiciona itens (funcoes dos botoes)
    goF.step = 2
    goF.mostrar()
    goF.addBurger()
    goF.addBurger()
    goF.addBatata()
    lcR = lcR + "total=" + TRANSFORM(goF.total) + " (esp 65)  lblTotal='" + goF.lblTotal.Caption + "'" + CHR(13)
    lcR = lcR + "qBurger lbl='" + goF.lblQBurger.Caption + "'  visivel=" + TRANSFORM(goF.lblQBurger.Visible) + CHR(13)

    * mostra a janela de verdade (modeless) e captura da tela com BitBlt
    goF.Show()
    goF.Refresh()
    DOEVENTS
    DOEVENTS

    LOCAL hwnd, hdcWin, hdcMem, hBmp, lcRect, l, t, r, b, w, h
    hwnd = goF.HWnd
    DECLARE INTEGER GetWindowRect IN user32 INTEGER hwnd, STRING @lpRect
    DECLARE INTEGER GetWindowDC IN user32 INTEGER hwnd
    DECLARE INTEGER CreateCompatibleDC IN gdi32 INTEGER hdc
    DECLARE INTEGER CreateCompatibleBitmap IN gdi32 INTEGER hdc, INTEGER w, INTEGER h
    DECLARE INTEGER SelectObject IN gdi32 INTEGER hdc, INTEGER obj
    DECLARE INTEGER BitBlt IN gdi32 INTEGER hdcD, INTEGER x, INTEGER y, INTEGER w, INTEGER h, INTEGER hdcS, INTEGER xs, INTEGER ys, INTEGER rop
    DECLARE INTEGER ReleaseDC IN user32 INTEGER hwnd, INTEGER hdc
    DECLARE INTEGER DeleteDC IN gdi32 INTEGER hdc

    lcRect = REPLICATE(CHR(0), 16)
    GetWindowRect(hwnd, @lcRect)
    l = dword(lcRect, 0)
    t = dword(lcRect, 1)
    r = dword(lcRect, 2)
    b = dword(lcRect, 3)
    w = r - l
    h = b - t
    lcR = lcR + "janela " + TRANSFORM(w) + "x" + TRANSFORM(h) + CHR(13)

    hdcWin = GetWindowDC(hwnd)
    hdcMem = CreateCompatibleDC(hdcWin)
    hBmp = CreateCompatibleBitmap(hdcWin, w, h)
    SelectObject(hdcMem, hBmp)
    BitBlt(hdcMem, 0, 0, w, h, hdcWin, 0, 0, 13369376)   && SRCCOPY

    LOCAL loBmp
    loBmp = _screen.System.Drawing.Bitmap.FromHbitmap(hBmp)
    loBmp.Save("C:\projectos\testesvf\foxts\showcase\totemapp\modern_shot.png", _screen.System.Drawing.Imaging.ImageFormat.Png)
    ReleaseDC(hwnd, hdcWin)
    DeleteDC(hdcMem)
    lcR = lcR + "screenshot salvo: modern_shot.png" + CHR(13)

    goF.Release()
CATCH TO loErr
    lcR = lcR + "ERRO: " + loErr.Message + " (linha " + TRANSFORM(loErr.LineNo) + ")" + CHR(13)
ENDTRY
? lcR
RETURN

FUNCTION dword(s, i)
    RETURN ASC(SUBSTR(s, i * 4 + 1, 1)) + ASC(SUBSTR(s, i * 4 + 2, 1)) * 256 ;
        + ASC(SUBSTR(s, i * 4 + 3, 1)) * 65536 + ASC(SUBSTR(s, i * 4 + 4, 1)) * 16777216
ENDFUNC
