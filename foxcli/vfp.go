package main

// vfp.go — localização do vfp9.exe, execução headless de bootstraps e
// parsing do protocolo de resultado (__result.txt, linhas "CAMPO|valor|...").

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const resultFileName = "__result.txt"

// toANSI converte UTF-8 para bytes ANSI (latin-1 best effort), pois o VFP
// lê PRGs como ANSI. Caracteres fora do intervalo viram '?'.
func toANSI(s string) []byte {
	b := make([]byte, 0, len(s))
	for _, r := range s {
		if r < 256 {
			b = append(b, byte(r))
		} else {
			b = append(b, '?')
		}
	}
	return b
}

func fromANSI(b []byte) string {
	rs := make([]rune, len(b))
	for i, c := range b {
		rs[i] = rune(c)
	}
	return string(rs)
}

// FindVFP localiza o vfp9.exe: env FOXCLI_VFP9 > registro > caminhos padrão.
func FindVFP() (string, error) {
	if p := os.Getenv("FOXCLI_VFP9"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
		return "", fmt.Errorf("FOXCLI_VFP9 aponta para arquivo inexistente: %s", p)
	}
	regKeys := []string{
		`HKLM\SOFTWARE\WOW6432Node\Microsoft\VisualFoxPro\9.0\Setup\VFP`,
		`HKLM\SOFTWARE\Microsoft\VisualFoxPro\9.0\Setup\VFP`,
	}
	for _, key := range regKeys {
		out, err := exec.Command("reg", "query", key, "/v", "ProductDir").Output()
		if err != nil {
			continue
		}
		for _, ln := range strings.Split(string(out), "\n") {
			if i := strings.Index(ln, "REG_SZ"); i >= 0 {
				dir := strings.TrimSpace(ln[i+len("REG_SZ"):])
				p := filepath.Join(dir, "vfp9.exe")
				if _, err := os.Stat(p); err == nil {
					return p, nil
				}
			}
		}
	}
	for _, p := range []string{
		`C:\Program Files (x86)\Microsoft Visual FoxPro 9\vfp9.exe`,
		`C:\Program Files\Microsoft Visual FoxPro 9\vfp9.exe`,
	} {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("vfp9.exe não encontrado — instale o VFP9 ou defina a variável FOXCLI_VFP9")
}

// Session representa uma execução isolada do VFP com diretório temporário próprio.
type Session struct {
	VFP     string
	WorkDir string
	Timeout time.Duration
}

func NewSession(timeout time.Duration) (*Session, error) {
	vfp, err := FindVFP()
	if err != nil {
		return nil, err
	}
	wd, err := os.MkdirTemp("", "foxcli-")
	if err != nil {
		return nil, err
	}
	return &Session{VFP: vfp, WorkDir: wd, Timeout: timeout}, nil
}

func (s *Session) Close() {
	if os.Getenv("FOXCLI_DEBUG") != "" {
		fmt.Fprintln(os.Stderr, "FOXCLI_DEBUG: workdir mantido em", s.WorkDir)
		return
	}
	os.RemoveAll(s.WorkDir)
}

func (s *Session) ResultPath() string {
	return filepath.Join(s.WorkDir, resultFileName)
}

// Run envolve o payload no bootstrap padrão, executa o VFP headless e
// devolve o resultado parseado.
func (s *Session) Run(payload string) (*Result, error) {
	cfgPath := filepath.Join(s.WorkDir, "config.fpw")
	cfg := "SCREEN=OFF\r\nRESOURCE=OFF\r\nSAFETY=OFF\r\n"
	if err := os.WriteFile(cfgPath, []byte(cfg), 0644); err != nil {
		return nil, err
	}
	boot := bootstrapPrologue() + payload + bootstrapEpilogue(s.ResultPath())
	bootPath := filepath.Join(s.WorkDir, "boot.prg")
	if err := os.WriteFile(bootPath, toANSI(boot), 0644); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), s.Timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, s.VFP, "-T", "-C"+cfgPath, bootPath)
	cmd.Dir = s.WorkDir
	// vfp9.exe é um processo GUI que nem sempre morre com TerminateProcess
	// direto do Go; taskkill /T /F derruba a árvore inteira de forma confiável.
	// Antes de matar, captura os títulos das janelas: um diálogo modal
	// invisível (ex.: "Locate File") é a causa típica de travamento.
	var dialogHint string
	cmd.Cancel = func() error {
		if cmd.Process != nil {
			dialogHint = describeDialogs(cmd.Process.Pid)
			exec.Command("taskkill", "/PID", fmt.Sprint(cmd.Process.Pid), "/T", "/F").Run()
		}
		return nil
	}
	cmd.WaitDelay = 10 * time.Second
	runErr := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		msg := fmt.Sprintf("timeout após %s — vfp9.exe foi finalizado", s.Timeout)
		if dialogHint != "" {
			msg += "; " + dialogHint
		} else {
			msg += " (possível loop infinito; use FOXCLI_DEBUG=1 para inspecionar)"
		}
		return nil, fmt.Errorf("%s", msg)
	}

	data, err := os.ReadFile(s.ResultPath())
	if err != nil {
		if runErr != nil {
			return nil, fmt.Errorf("vfp9.exe falhou (%v) e não produziu resultado — rode 'foxcli doctor'", runErr)
		}
		return nil, fmt.Errorf("vfp9.exe terminou sem produzir resultado — rode 'foxcli doctor'")
	}
	return parseResult(fromANSI(data)), nil
}

// Result é o conteúdo parseado do __result.txt.
type Result struct {
	Status string     // "OK", "FAIL" ou "" (sem status = abortou)
	Errors []string   // linhas ERROR| formatadas
	Lines  [][]string // todas as linhas, separadas por "|"
}

func parseResult(s string) *Result {
	r := &Result{}
	for _, ln := range strings.Split(s, "\n") {
		ln = strings.TrimRight(ln, "\r")
		if ln == "" {
			continue
		}
		parts := strings.Split(ln, "|")
		switch parts[0] {
		case "STATUS":
			if len(parts) > 1 {
				r.Status = parts[1]
			}
		case "ERROR":
			// ERROR|nro|mensagem|procedure|linha
			if len(parts) >= 5 {
				r.Errors = append(r.Errors, fmt.Sprintf("erro %s: %s (em %s, linha %s)", parts[1], parts[2], parts[3], parts[4]))
			} else {
				r.Errors = append(r.Errors, strings.Join(parts[1:], " | "))
			}
		}
		r.Lines = append(r.Lines, parts)
	}
	return r
}

// Field devolve os valores (a partir do campo 1) de todas as linhas cujo
// campo 0 é o prefixo dado.
func (r *Result) Field(prefix string) [][]string {
	var out [][]string
	for _, ln := range r.Lines {
		if ln[0] == prefix {
			out = append(out, ln[1:])
		}
	}
	return out
}

func bootstrapPrologue() string {
	return `* boot.prg gerado pelo foxcli — não editar
ON SHUTDOWN QUIT
ON ERROR
SET TALK OFF
SET SAFETY OFF
SET NOTIFY OFF
SET STATUS BAR OFF
SET HELP OFF
TRY
	SYS(2335, 0)
CATCH
ENDTRY
TRY
`
}

func bootstrapEpilogue(resultPath string) string {
	return `
	fox_status("OK")
CATCH TO loFoxErr
	fox_log("ERROR|" + TRANSFORM(loFoxErr.ErrorNo) + "|" + CHRTRAN(loFoxErr.Message, CHR(13) + CHR(10) + "|", "  ;") + "|" + loFoxErr.Procedure + "|" + TRANSFORM(loFoxErr.LineNo))
	fox_status("FAIL")
ENDTRY
QUIT

PROCEDURE fox_log
	LPARAMETERS tcLine
	STRTOFILE(tcLine + CHR(13) + CHR(10), "` + resultPath + `", 1)
ENDPROC

PROCEDURE fox_status
	LPARAMETERS tcStatus
	fox_log("STATUS|" + tcStatus)
ENDPROC
`
}

// vfpStr coloca um caminho/string entre aspas duplas para uso em código VFP.
// Aspas duplas são ilegais em caminhos Windows, então não há escape a fazer.
func vfpStr(s string) string {
	return `"` + strings.ReplaceAll(s, `"`, `'`) + `"`
}
