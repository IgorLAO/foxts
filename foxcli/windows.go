package main

// windows.go — utilidades Win32: enumerar janelas de um processo para
// diagnosticar diálogos modais invisíveis (SCREEN=OFF esconde a tela
// principal, mas diálogos como "Locate File" ficam abertos e travam o build).

import (
	"strings"
	"syscall"
	"unsafe"
)

var (
	user32                   = syscall.NewLazyDLL("user32.dll")
	procEnumWindows          = user32.NewProc("EnumWindows")
	procGetWindowTextW       = user32.NewProc("GetWindowTextW")
	procGetWindowThreadProcd = user32.NewProc("GetWindowThreadProcessId")
)

// windowTitles devolve os títulos não vazios das janelas top-level do PID.
func windowTitles(pid int) []string {
	var titles []string
	cb := syscall.NewCallback(func(hwnd uintptr, lparam uintptr) uintptr {
		var wpid uint32
		procGetWindowThreadProcd.Call(hwnd, uintptr(unsafe.Pointer(&wpid)))
		if int(wpid) == pid {
			buf := make([]uint16, 512)
			n, _, _ := procGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), 512)
			if n > 0 {
				t := syscall.UTF16ToString(buf[:n])
				if t != "" && t != "Microsoft Visual FoxPro" && t != "Default IME" && t != "MSCTFIME UI" && t != "DDE Server Window" {
					titles = append(titles, t)
				}
			}
		}
		return 1 // continua a enumeração
	})
	procEnumWindows.Call(cb, 0)
	return titles
}

// describeDialogs monta uma dica humana a partir dos títulos de janelas
// encontrados num processo VFP travado.
func describeDialogs(pid int) string {
	titles := windowTitles(pid)
	if len(titles) == 0 {
		return ""
	}
	hint := "diálogo(s) detectado(s): " + strings.Join(titles, "; ")
	for _, t := range titles {
		if strings.Contains(strings.ToLower(t), "locate") {
			hint += " — o VFP não encontrou um arquivo referenciado pelo código (verifique SET PROCEDURE/DO/SET CLASSLIB e os caminhos no vfp.json)"
			break
		}
	}
	return hint
}
