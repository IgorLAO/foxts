* capture.prg — captura UMA tela real do VFP (PrintWindow+GDI+). Recebe o SCX e o PNG por
* parametro p/ rodar UM form por processo do vfp9 (evita travas de sequencia entre forms).
* Uso: vfp9 -C cap.fpw, com COMMAND=DO capture.prg WITH "dist\X.scx","dist\X.png".
LOCAL lcDir
lcDir = ADDBS(JUSTPATH(SYS(16,1)))   && diretório do próprio .prg em runtime
SET DEFAULT TO (lcDir)
SET STATUS BAR OFF

DECLARE INTEGER GetWindowRect IN user32 INTEGER hWnd, STRING @lpRect
DECLARE INTEGER GetDC IN user32 INTEGER hWnd
DECLARE INTEGER CreateCompatibleDC IN gdi32 INTEGER hdc
DECLARE INTEGER CreateCompatibleBitmap IN gdi32 INTEGER hdc, INTEGER w, INTEGER h
DECLARE INTEGER SelectObject IN gdi32 INTEGER hdc, INTEGER hgdiobj
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
gnTok = 0
GdiplusStartup(@gnTok, long2buf(1) + REPLICATE(CHR(0), 12), 0)
_screen.WindowState = 2

= shoot(lcDir + "dist\MinhasApostasPage.scx", lcDir + "dist\02-minhas.png")
= shoot(lcDir + "dist\ApostasPage.scx", lcDir + "dist\01-apostas.png")

GdiplusShutdown(gnTok)
QUIT

PROCEDURE shoot(tcScx, tcPng)
LOCAL loForm
DO FORM (tcScx) NAME loForm NOSHOW
loForm.WindowState = 0
loForm.Move(0, 0)
loForm.Visible = .T.
loForm.ZOrder(0)
= grab(loForm, tcPng)
loForm.Release()
RETURN

PROCEDURE grab(toForm, tcPng)
LOCAL lhWnd, lcRect, lnW, lnH, i, lhScr, lhdcMem, lhBmp, lnImg
toForm.Refresh()
lhWnd = toForm.HWnd
RedrawWindow(lhWnd, 0, 0, 389)
FOR i = 1 TO 8
  DOEVENTS FORCE
  = INKEY(0.05)
ENDFOR
UpdateWindow(lhWnd)
lcRect = REPLICATE(CHR(0), 16)
GetWindowRect(lhWnd, @lcRect)
lnW = buf2long(SUBSTR(lcRect, 9, 4)) - buf2long(SUBSTR(lcRect, 1, 4))
lnH = buf2long(SUBSTR(lcRect, 13, 4)) - buf2long(SUBSTR(lcRect, 5, 4))
lhScr = GetDC(0)
lhdcMem = CreateCompatibleDC(lhScr)
lhBmp = CreateCompatibleBitmap(lhScr, lnW, lnH)
SelectObject(lhdcMem, lhBmp)
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
