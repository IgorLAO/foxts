* cap_totem.prg — dirige o fluxo do totem e captura as 5 telas (pixels REAIS via BitBlt
* do desktop + GDI+ -> dist\NN-nome.png). Uso (foxcli): foxcli run cap_totem.prg --timeout 300
LOCAL lcDir
lcDir = "C:\projectos\testesvf\foxts\showcase\totem-app\"
SET DEFAULT TO (lcDir)

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
DECLARE INTEGER PrintWindow IN user32 INTEGER hWnd, INTEGER hdcBlt, INTEGER nFlags
DECLARE INTEGER GdiplusStartup IN gdiplus.dll INTEGER @token, STRING @input, INTEGER output
DECLARE INTEGER GdiplusShutdown IN gdiplus.dll INTEGER token
DECLARE INTEGER GdipCreateBitmapFromHBITMAP IN gdiplus.dll INTEGER hbm, INTEGER hpal, INTEGER @bitmap
DECLARE INTEGER GdipSaveImageToFile IN gdiplus.dll INTEGER image, STRING filename, STRING clsid, INTEGER params
DECLARE INTEGER GdipDisposeImage IN gdiplus.dll INTEGER image

PUBLIC gnTok
LOCAL lcInput
lcInput = long2buf(1) + REPLICATE(CHR(0), 12)
gnTok = 0
GdiplusStartup(@gnTok, @lcInput, 0)

LOCAL loForm
_screen.WindowState = 2
DO FORM (lcDir + "Totem.scx") NAME loForm NOSHOW
loForm.WindowState = 0
loForm.Move(0, 0)
loForm.Visible = .T.
loForm.ZOrder(0)

* 1) HOME (estado inicial)
= grab(loForm, lcDir + "dist\01-home.png")
* 2) MODO
loForm.irModo()
= grab(loForm, lcDir + "dist\02-modo.png")
* 3) CARDAPIO com itens (mostra qtd + total)
loForm.escolherComer()
loForm.addBurger()
loForm.addBurger()
loForm.addRefri()
loForm.addBatata()
= grab(loForm, lcDir + "dist\03-cardapio.png")
* 4) PAGAMENTO (total preenchido)
loForm.irPagamento()
= grab(loForm, lcDir + "dist\04-pagamento.png")
* 5) APROVADO
loForm.step = 5
loForm.mostrar()
= grab(loForm, lcDir + "dist\05-aprovado.png")

GdiplusShutdown(gnTok)
loForm.Release()
QUIT

PROCEDURE grab(toForm, tcPng)
LOCAL lhWnd, lcRect, lnL, lnT, lnR, lnB, lnW, lnH, i
toForm.Refresh()
lhWnd = toForm.HWnd
RedrawWindow(lhWnd, 0, 0, 389)  && INVALIDATE|ERASE|UPDATENOW|ALLCHILDREN
FOR i = 1 TO 8
  DOEVENTS FORCE
  = INKEY(0.05)
ENDFOR
UpdateWindow(lhWnd)
lcRect = REPLICATE(CHR(0), 16)
GetWindowRect(lhWnd, @lcRect)
lnL = buf2long(SUBSTR(lcRect, 1, 4))
lnT = buf2long(SUBSTR(lcRect, 5, 4))
lnR = buf2long(SUBSTR(lcRect, 9, 4))
lnB = buf2long(SUBSTR(lcRect, 13, 4))
lnW = lnR - lnL
lnH = lnB - lnT
LOCAL lhScr, lhdcMem, lhBmp, lnImg
lhScr = GetDC(0)
lhdcMem = CreateCompatibleDC(lhScr)
lhBmp = CreateCompatibleBitmap(lhScr, lnW, lnH)
SelectObject(lhdcMem, lhBmp)
* PrintWindow(...,2)=PW_RENDERFULLCONTENT: renderiza a janela (inclui conteudo DWM) no DC,
* robusto onde o BitBlt do desktop sai preto (janela composita/borderless).
PrintWindow(lhWnd, lhdcMem, 2)
ReleaseDC(0, lhScr)
lnImg = 0
GdipCreateBitmapFromHBITMAP(lhBmp, 0, @lnImg)
GdipSaveImageToFile(lnImg, STRCONV(tcPng + CHR(0), 5), clsidpng(), 0)
GdipDisposeImage(lnImg)
DeleteObject(lhBmp)
DeleteDC(lhdcMem)
RETURN

FUNCTION buf2long(lc)
RETURN ASC(SUBSTR(lc,1,1)) + ASC(SUBSTR(lc,2,1))*256 + ASC(SUBSTR(lc,3,1))*65536 + ASC(SUBSTR(lc,4,1))*16777216

FUNCTION long2buf(ln)
RETURN CHR(BITAND(ln,255)) + CHR(BITAND(BITRSHIFT(ln,8),255)) + CHR(BITAND(BITRSHIFT(ln,16),255)) + CHR(BITAND(BITRSHIFT(ln,24),255))

FUNCTION clsidpng
RETURN CHR(0x06)+CHR(0xF4)+CHR(0x7C)+CHR(0x55)+CHR(0x04)+CHR(0x1A)+CHR(0xD3)+CHR(0x11)+;
  CHR(0x9A)+CHR(0x73)+CHR(0x00)+CHR(0x00)+CHR(0xF8)+CHR(0x1E)+CHR(0xF3)+CHR(0x2E)
