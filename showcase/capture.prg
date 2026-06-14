* capture.prg — abre um SCX no VFP e captura a JANELA REAL via PrintWindow + GDI+ -> PNG.
* Uso (foxcli): foxcli run capture.prg <scx_abs> <png_abs> --timeout 60
LPARAMETERS tcScx, tcPng, tlQuit
* default dir = pasta do showcase (pai de dist\) p/ os ícones "icons/..." resolverem
SET DEFAULT TO (ADDBS(JUSTPATH(JUSTPATH(m.tcScx))))

DECLARE INTEGER GetWindowRect IN user32 INTEGER hWnd, STRING @lpRect
DECLARE INTEGER GetDC IN user32 INTEGER hWnd
DECLARE INTEGER CreateCompatibleDC IN gdi32 INTEGER hdc
DECLARE INTEGER CreateCompatibleBitmap IN gdi32 INTEGER hdc, INTEGER w, INTEGER h
DECLARE INTEGER SelectObject IN gdi32 INTEGER hdc, INTEGER hgdiobj
DECLARE INTEGER BitBlt IN gdi32 INTEGER hdcDest, INTEGER x, INTEGER y, INTEGER w, INTEGER h, INTEGER hdcSrc, INTEGER xs, INTEGER ys, INTEGER rop
DECLARE INTEGER DeleteDC IN gdi32 INTEGER hdc
DECLARE INTEGER ReleaseDC IN user32 INTEGER hWnd, INTEGER hdc
DECLARE INTEGER DeleteObject IN gdi32 INTEGER hObject
DECLARE INTEGER RedrawWindow IN user32 INTEGER hWnd, INTEGER lprc, INTEGER hrgn, INTEGER flags
DECLARE INTEGER UpdateWindow IN user32 INTEGER hWnd
DECLARE INTEGER GdiplusStartup IN gdiplus.dll INTEGER @token, STRING @input, INTEGER output
DECLARE INTEGER GdiplusShutdown IN gdiplus.dll INTEGER token
DECLARE INTEGER GdipCreateBitmapFromHBITMAP IN gdiplus.dll INTEGER hbm, INTEGER hpal, INTEGER @bitmap
DECLARE INTEGER GdipSaveImageToFile IN gdiplus.dll INTEGER image, STRING filename, STRING clsid, INTEGER params
DECLARE INTEGER GdipDisposeImage IN gdiplus.dll INTEGER image

LOCAL loForm, lhWnd, lcRect, lnL, lnT, lnR, lnB, lnW, lnH
_screen.WindowState = 2  && maximiza o desktop VFP p/ o form caber visível
DO FORM (tcScx) NAME loForm NOSHOW
loForm.WindowState = 0
loForm.Move(0, 0)        && canto do desktop -> posição conhecida na tela
loForm.Visible = .T.
loForm.ZOrder(0)         && traz p/ frente
lhWnd = loForm.HWnd
* força a pintura COMPLETA (form + todos os filhos) antes do BitBlt — senão só os
* controles "pesados" (grid) pintam e o resto sai em branco.
loForm.Refresh()
RedrawWindow(lhWnd, 0, 0, 389)  && RDW_INVALIDATE|ERASE|UPDATENOW|ALLCHILDREN
LOCAL lnK
FOR lnK = 1 TO 10
	DOEVENTS FORCE
	= INKEY(0.05)
ENDFOR
UpdateWindow(lhWnd)
LOCAL lcLog
lcLog = STRTRAN(m.tcPng, ".png", ".log")
STRTOFILE("DIAG BackColor=" + TRANSFORM(loForm.BackColor) + " (esperado branco " + TRANSFORM(RGB(248,250,252)) + ")" + CHR(13)+CHR(10), lcLog, 0)
LOCAL loC
FOR EACH loC IN loForm.Controls
	STRTOFILE("  ctrl " + loC.Name + " base=" + loC.BaseClass + " back=" + TRANSFORM(IIF(PEMSTATUS(loC,"BackColor",5), loC.BackColor, -1)) + " bs=" + TRANSFORM(IIF(PEMSTATUS(loC,"BackStyle",5), loC.BackStyle, -1)) + CHR(13)+CHR(10), lcLog, 1)
ENDFOR

* rect em coords de TELA (já posicionado) -> BitBlt dos PIXELS REAIS do desktop
* (WYSIWYG, fiel a fundo de form/containers, ao contrário do PrintWindow).
lcRect = REPLICATE(CHR(0), 16)
GetWindowRect(lhWnd, @lcRect)
lnL = buf2long(SUBSTR(lcRect, 1, 4))
lnT = buf2long(SUBSTR(lcRect, 5, 4))
lnR = buf2long(SUBSTR(lcRect, 9, 4))
lnB = buf2long(SUBSTR(lcRect, 13, 4))
lnW = lnR - lnL
lnH = lnB - lnT
IF lnW <= 0 OR lnH <= 0
	lnW = loForm.Width
	lnH = loForm.Height
ENDIF

LOCAL lhScr, lhdcMem, lhBmp
lhScr = GetDC(0)         && DC do desktop inteiro
lhdcMem = CreateCompatibleDC(lhScr)
lhBmp = CreateCompatibleBitmap(lhScr, lnW, lnH)
SelectObject(lhdcMem, lhBmp)
BitBlt(lhdcMem, 0, 0, lnW, lnH, lhScr, lnL, lnT, 0xCC0020)  && SRCCOPY
ReleaseDC(0, lhScr)

LOCAL lcInput, lnTok, lnImg
lcInput = long2buf(1) + REPLICATE(CHR(0), 12)
lnTok = 0
GdiplusStartup(@lnTok, @lcInput, 0)   && token: INTEGER por referencia
lnImg = 0
GdipCreateBitmapFromHBITMAP(lhBmp, 0, @lnImg)  && bitmap: INTEGER por referencia
GdipSaveImageToFile(lnImg, STRCONV(tcPng + CHR(0), 5), clsidpng(), 0)
GdipDisposeImage(lnImg)
GdiplusShutdown(lnTok)

DeleteObject(lhBmp)
DeleteDC(lhdcMem)
loForm.Release()
STRTOFILE("OK " + TRANSFORM(lnW) + "x" + TRANSFORM(lnH) + " rect=" + TRANSFORM(lnL) + "," + TRANSFORM(lnT) + " -> " + tcPng + CHR(13)+CHR(10), lcLog, 1)
IF m.tlQuit
	QUIT
ENDIF

FUNCTION buf2long(lc)
RETURN ASC(SUBSTR(lc, 1, 1)) + ASC(SUBSTR(lc, 2, 1)) * 256 + ASC(SUBSTR(lc, 3, 1)) * 65536 + ASC(SUBSTR(lc, 4, 1)) * 16777216

FUNCTION long2buf(ln)
RETURN CHR(BITAND(ln, 255)) + CHR(BITAND(BITRSHIFT(ln, 8), 255)) + CHR(BITAND(BITRSHIFT(ln, 16), 255)) + CHR(BITAND(BITRSHIFT(ln, 24), 255))

FUNCTION clsidpng
* {557CF406-1A04-11D3-9A73-0000F81EF32E} (encoder PNG do GDI+), bytes do GUID
RETURN CHR(0x06) + CHR(0xF4) + CHR(0x7C) + CHR(0x55) + CHR(0x04) + CHR(0x1A) + CHR(0xD3) + CHR(0x11) + ;
	CHR(0x9A) + CHR(0x73) + CHR(0x00) + CHR(0x00) + CHR(0xF8) + CHR(0x1E) + CHR(0xF3) + CHR(0x2E)
