package main

// commands.go — implementação dos subcomandos do foxcli.

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Manifest é o vfp.json de um projeto gerenciado pelo foxcli.
type Manifest struct {
	Name   string   `json:"name"`
	Main   string   `json:"main"`
	Type   string   `json:"type"` // exe | app | dll
	Output string   `json:"output"`
	Files  []string `json:"files,omitempty"`
}

// JSONOut é a saída estruturada (--json) consumível por agentes.
type JSONOut struct {
	OK       bool          `json:"ok"`
	Command  string        `json:"command"`
	Output   string        `json:"output,omitempty"`
	Errors   []string      `json:"errors,omitempty"`
	Warnings []string      `json:"warnings,omitempty"`
	Stdout   string        `json:"stdout,omitempty"`
	Files    []InspectFile `json:"files,omitempty"`
	VFP      string        `json:"vfp,omitempty"`
	Version  string        `json:"version,omitempty"`
}

type InspectFile struct {
	Type    string `json:"type"`
	Name    string `json:"name"`
	Main    bool   `json:"main"`
	Exclude bool   `json:"exclude"`
}

// reorderArgs move flags para antes dos posicionais, pois o pacote flag
// para de parsear no primeiro argumento que não é flag (agentes costumam
// passar "build dir --json").
func reorderArgs(args []string, boolFlags ...string) []string {
	isBool := map[string]bool{}
	for _, b := range boolFlags {
		isBool[b] = true
	}
	var flags, pos []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		if strings.HasPrefix(a, "-") && a != "-" && a != "--" {
			flags = append(flags, a)
			name := strings.TrimLeft(a, "-")
			if !strings.Contains(name, "=") && !isBool[name] && i+1 < len(args) {
				i++
				flags = append(flags, args[i])
			}
		} else {
			pos = append(pos, a)
		}
	}
	return append(flags, pos...)
}

const boolFlagNames = "json,keep-project"

func parseFlags(fs *flag.FlagSet, args []string) {
	fs.Parse(reorderArgs(args, strings.Split(boolFlagNames, ",")...))
}

func emit(jsonMode bool, out JSONOut) int {
	if jsonMode {
		b, _ := json.MarshalIndent(out, "", "  ")
		fmt.Println(string(b))
	} else {
		for _, w := range out.Warnings {
			fmt.Println("[aviso]", w)
		}
		for _, e := range out.Errors {
			fmt.Println("[erro]", e)
		}
		if out.Stdout != "" {
			fmt.Print(out.Stdout)
			if !strings.HasSuffix(out.Stdout, "\n") {
				fmt.Println()
			}
		}
		for _, f := range out.Files {
			flags := ""
			if f.Main {
				flags += " (main)"
			}
			if f.Exclude {
				flags += " (excluded)"
			}
			fmt.Printf("%-10s %s%s\n", f.Type, f.Name, flags)
		}
		if out.OK {
			if out.Output != "" {
				fmt.Println("[OK]", out.Output)
			} else {
				fmt.Println("[OK]")
			}
		} else {
			fmt.Println("[FALHOU]")
		}
	}
	if out.OK {
		return 0
	}
	return 1
}

func fail(jsonMode bool, command string, err error) int {
	return emit(jsonMode, JSONOut{OK: false, Command: command, Errors: []string{err.Error()}})
}

// ---------------------------------------------------------------- doctor

func cmdDoctor(args []string) int {
	fs := flag.NewFlagSet("doctor", flag.ExitOnError)
	jsonMode := fs.Bool("json", false, "saída em JSON")
	parseFlags(fs, args)

	vfp, err := FindVFP()
	if err != nil {
		return fail(*jsonMode, "doctor", err)
	}
	s, err := NewSession(60 * time.Second)
	if err != nil {
		return fail(*jsonMode, "doctor", err)
	}
	defer s.Close()
	res, err := s.Run("\tfox_log(\"VFPVER|\" + VERSION())\n")
	if err != nil {
		return fail(*jsonMode, "doctor", fmt.Errorf("vfp9.exe encontrado em %s mas falhou ao executar: %v", vfp, err))
	}
	ver := ""
	if v := res.Field("VFPVER"); len(v) > 0 {
		ver = strings.Join(v[0], "|")
	}
	return emit(*jsonMode, JSONOut{
		OK:      res.Status == "OK" && ver != "",
		Command: "doctor",
		VFP:     vfp,
		Version: ver,
		Output:  "ambiente funcional: " + ver,
		Errors:  res.Errors,
	})
}

// ---------------------------------------------------------------- init / form

func cmdInit(args []string) int {
	fs := flag.NewFlagSet("init", flag.ExitOnError)
	jsonMode := fs.Bool("json", false, "saída em JSON")
	parseFlags(fs, args)
	if fs.NArg() < 1 {
		return fail(*jsonMode, "init", fmt.Errorf("uso: foxcli init <nome-do-projeto>"))
	}
	name := fs.Arg(0)
	dir, err := filepath.Abs(name)
	if err != nil {
		return fail(*jsonMode, "init", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "vfp.json")); err == nil {
		return fail(*jsonMode, "init", fmt.Errorf("já existe um vfp.json em %s", dir))
	}
	if err := scaffoldProject(dir, filepath.Base(dir)); err != nil {
		return fail(*jsonMode, "init", err)
	}
	return emit(*jsonMode, JSONOut{OK: true, Command: "init",
		Output: fmt.Sprintf("projeto criado em %s — edite source\\main.prg e rode: foxcli build %s", dir, name)})
}

func cmdForm(args []string) int {
	fs := flag.NewFlagSet("form", flag.ExitOnError)
	jsonMode := fs.Bool("json", false, "saída em JSON")
	dir := fs.String("dir", ".", "diretório do projeto (com vfp.json)")
	spec := fs.String("spec", "", "gera SCX/SCT a partir de uma IR form.json (em vez de classe PRG)")
	out := fs.String("out", "", "caminho do .scx de saída (modo --spec)")
	timeout := fs.Int("timeout", 120, "timeout em segundos (modo --spec)")
	parseFlags(fs, args)

	if *spec != "" {
		return buildSCX(*spec, *out, *timeout, *jsonMode)
	}

	if fs.NArg() < 1 {
		return fail(*jsonMode, "form", fmt.Errorf("uso: foxcli form <NomeDoForm> [--dir projeto]  |  foxcli form --spec form.json [--out x.scx]"))
	}
	name := fs.Arg(0)
	path, err := scaffoldForm(*dir, name)
	if err != nil {
		return fail(*jsonMode, "form", err)
	}
	return emit(*jsonMode, JSONOut{OK: true, Command: "form",
		Output: fmt.Sprintf("form criado em %s — referencie com SET PROCEDURE ... ADDITIVE e CREATEOBJECT(\"frm%s\")", path, name)})
}

// ---------------------------------------------------------------- build

var buildActions = map[string]string{"exe": "3", "app": "2", "dll": "4"}

func cmdBuild(args []string) int {
	fs := flag.NewFlagSet("build", flag.ExitOnError)
	jsonMode := fs.Bool("json", false, "saída em JSON")
	timeout := fs.Int("timeout", 300, "timeout em segundos")
	outFlag := fs.String("out", "", "arquivo de saída (modo .pjx)")
	typeFlag := fs.String("type", "", "exe | app | dll (sobrepõe o manifesto)")
	keepPjx := fs.Bool("keep-project", false, "não recriar o .pjx a partir do main (modo manifesto)")
	parseFlags(fs, args)

	target := "."
	if fs.NArg() > 0 {
		target = fs.Arg(0)
	}
	abs, err := filepath.Abs(target)
	if err != nil {
		return fail(*jsonMode, "build", err)
	}

	if strings.EqualFold(filepath.Ext(abs), ".pjx") {
		return buildPjx(abs, *outFlag, *typeFlag, *timeout, *jsonMode)
	}
	return buildManifest(abs, *typeFlag, *timeout, *keepPjx, *jsonMode)
}

func buildManifest(dir, typeOverride string, timeoutSec int, keepPjx, jsonMode bool) int {
	mPath := filepath.Join(dir, "vfp.json")
	data, err := os.ReadFile(mPath)
	if err != nil {
		return fail(jsonMode, "build", fmt.Errorf("vfp.json não encontrado em %s (use 'foxcli init' ou aponte para um .pjx)", dir))
	}
	data = []byte(strings.TrimPrefix(string(data), "\ufeff")) // tolera BOM UTF-8
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return fail(jsonMode, "build", fmt.Errorf("vfp.json inválido: %v", err))
	}
	if m.Name == "" || m.Main == "" {
		return fail(jsonMode, "build", fmt.Errorf("vfp.json precisa de 'name' e 'main'"))
	}
	if typeOverride != "" {
		m.Type = typeOverride
	}
	if m.Type == "" {
		m.Type = "exe"
	}
	action, ok := buildActions[strings.ToLower(m.Type)]
	if !ok {
		return fail(jsonMode, "build", fmt.Errorf("type inválido %q (use exe, app ou dll)", m.Type))
	}
	if m.Output == "" {
		m.Output = filepath.Join(buildDir, m.Name+"."+strings.ToLower(m.Type))
	}

	mainAbs := filepath.Join(dir, filepath.FromSlash(m.Main))
	if _, err := os.Stat(mainAbs); err != nil {
		return fail(jsonMode, "build", fmt.Errorf("main não encontrado: %s", mainAbs))
	}
	outAbs := filepath.Join(dir, filepath.FromSlash(m.Output))
	if err := os.MkdirAll(filepath.Dir(outAbs), 0755); err != nil {
		return fail(jsonMode, "build", err)
	}
	pjx := filepath.Join(dir, m.Name+".pjx")
	errFile := strings.TrimSuffix(pjx, filepath.Ext(pjx)) + ".err"

	if !keepPjx {
		os.Remove(pjx)
		os.Remove(strings.TrimSuffix(pjx, filepath.Ext(pjx)) + ".pjt")
	}
	os.Remove(errFile)
	os.Remove(outAbs)

	var p strings.Builder
	fmt.Fprintf(&p, "\tCD %s\n", vfpStr(dir))
	p.WriteString("\tfox_log(\"STEP|cd\")\n")
	fmt.Fprintf(&p, "\tIF !FILE(%s)\n\t\tBUILD PROJECT %s FROM %s\n\tENDIF\n", vfpStr(pjx), vfpStr(pjx), vfpStr(mainAbs))
	p.WriteString("\tfox_log(\"STEP|build project\")\n")
	fmt.Fprintf(&p, "\tMODIFY PROJECT %s NOWAIT NOSHOW\n", vfpStr(pjx))
	p.WriteString("\tfox_log(\"STEP|modify project\")\n")
	p.WriteString("\tLOCAL loProj\n\tloProj = _VFP.ActiveProject\n")
	for _, f := range m.Files {
		fAbs := filepath.Join(dir, filepath.FromSlash(f))
		fmt.Fprintf(&p, "\tTRY\n\t\tloProj.Files.Add(%s)\n\tCATCH\n\tENDTRY\n", vfpStr(fAbs))
	}
	fmt.Fprintf(&p, "\tTRY\n\t\tloProj.SetMain(%s)\n\tCATCH\n\tENDTRY\n", vfpStr(mainAbs))
	p.WriteString("\tfox_log(\"STEP|files added\")\n")
	fmt.Fprintf(&p, "\tloProj.Build(%s, %s, .T., .F., .F.)\n", vfpStr(outAbs), action)
	p.WriteString("\tfox_log(\"STEP|built\")\n")
	p.WriteString("\tloProj.Close()\n")
	p.WriteString(payloadRelayErrFile(errFile))
	p.WriteString(payloadCheckOutput(outAbs))

	return runBuildPayload(p.String(), outAbs, timeoutSec, jsonMode)
}

func buildPjx(pjx, out, typeFlag string, timeoutSec int, jsonMode bool) int {
	if _, err := os.Stat(pjx); err != nil {
		return fail(jsonMode, "build", fmt.Errorf("projeto não encontrado: %s", pjx))
	}
	if typeFlag == "" {
		typeFlag = "exe"
	}
	action, ok := buildActions[strings.ToLower(typeFlag)]
	if !ok {
		return fail(jsonMode, "build", fmt.Errorf("type inválido %q (use exe, app ou dll)", typeFlag))
	}
	if out == "" {
		out = strings.TrimSuffix(pjx, filepath.Ext(pjx)) + "." + strings.ToLower(typeFlag)
	}
	outAbs, err := filepath.Abs(out)
	if err != nil {
		return fail(jsonMode, "build", err)
	}
	errFile := strings.TrimSuffix(pjx, filepath.Ext(pjx)) + ".err"
	os.Remove(errFile)

	var p strings.Builder
	fmt.Fprintf(&p, "\tCD %s\n", vfpStr(filepath.Dir(pjx)))
	p.WriteString("\tfox_log(\"STEP|cd\")\n")
	fmt.Fprintf(&p, "\tMODIFY PROJECT %s NOWAIT NOSHOW\n", vfpStr(pjx))
	p.WriteString("\tfox_log(\"STEP|modify project\")\n")
	p.WriteString("\tLOCAL loProj\n\tloProj = _VFP.ActiveProject\n")
	fmt.Fprintf(&p, "\tloProj.Build(%s, %s, .T., .F., .F.)\n", vfpStr(outAbs), action)
	p.WriteString("\tfox_log(\"STEP|built\")\n")
	p.WriteString("\tloProj.Close()\n")
	p.WriteString(payloadRelayErrFile(errFile))
	p.WriteString(payloadCheckOutput(outAbs))

	return runBuildPayload(p.String(), outAbs, timeoutSec, jsonMode)
}

// payloadRelayErrFile gera código VFP que copia as linhas do .err para o resultado.
func payloadRelayErrFile(errFile string) string {
	var p strings.Builder
	fmt.Fprintf(&p, "\tIF FILE(%s)\n", vfpStr(errFile))
	p.WriteString("\t\tLOCAL laFoxErr[1], lnFoxErrN, lnFoxErrI\n")
	fmt.Fprintf(&p, "\t\tlnFoxErrN = ALINES(laFoxErr, FILETOSTR(%s))\n", vfpStr(errFile))
	p.WriteString("\t\tFOR lnFoxErrI = 1 TO lnFoxErrN\n")
	p.WriteString("\t\t\tIF !EMPTY(laFoxErr(lnFoxErrI))\n")
	p.WriteString("\t\t\t\tfox_log(\"BUILDERR|\" + laFoxErr(lnFoxErrI))\n")
	p.WriteString("\t\t\tENDIF\n")
	p.WriteString("\t\tENDFOR\n\tENDIF\n")
	return p.String()
}

func payloadCheckOutput(outAbs string) string {
	var p strings.Builder
	fmt.Fprintf(&p, "\tIF FILE(%s)\n", vfpStr(outAbs))
	fmt.Fprintf(&p, "\t\tfox_log(\"OUTPUT|\" + %s)\n", vfpStr(outAbs))
	p.WriteString("\tELSE\n")
	p.WriteString("\t\tfox_log(\"ERROR|0|build terminou sem gerar o arquivo de saída (veja linhas BUILDERR)||0\")\n")
	p.WriteString("\t\tfox_status(\"FAIL\")\n\t\tQUIT\n")
	p.WriteString("\tENDIF\n")
	return p.String()
}

func runBuildPayload(payload, outAbs string, timeoutSec int, jsonMode bool) int {
	s, err := NewSession(time.Duration(timeoutSec) * time.Second)
	if err != nil {
		return fail(jsonMode, "build", err)
	}
	defer s.Close()
	res, err := s.Run(payload)
	if err != nil {
		return fail(jsonMode, "build", err)
	}
	out := JSONOut{Command: "build", OK: res.Status == "OK", Errors: res.Errors}
	for _, e := range res.Field("BUILDERR") {
		line := strings.Join(e, "|")
		if out.OK {
			out.Warnings = append(out.Warnings, line)
		} else {
			out.Errors = append(out.Errors, line)
		}
	}
	if out.OK {
		out.Output = outAbs
	}
	if res.Status == "" {
		out.Errors = append(out.Errors, "o VFP abortou sem reportar status (use FOXCLI_DEBUG=1 para investigar)")
	}
	return emit(jsonMode, out)
}

// ---------------------------------------------------------------- compile

func cmdCompile(args []string) int {
	fs := flag.NewFlagSet("compile", flag.ExitOnError)
	jsonMode := fs.Bool("json", false, "saída em JSON")
	timeout := fs.Int("timeout", 120, "timeout em segundos")
	parseFlags(fs, args)
	if fs.NArg() < 1 {
		return fail(*jsonMode, "compile", fmt.Errorf("uso: foxcli compile <arquivo.prg> [...]"))
	}

	var p strings.Builder
	for _, f := range fs.Args() {
		abs, err := filepath.Abs(f)
		if err != nil {
			return fail(*jsonMode, "compile", err)
		}
		if _, err := os.Stat(abs); err != nil {
			return fail(*jsonMode, "compile", fmt.Errorf("arquivo não encontrado: %s", abs))
		}
		errFile := strings.TrimSuffix(abs, filepath.Ext(abs)) + ".err"
		os.Remove(errFile)
		fmt.Fprintf(&p, "\tTRY\n\t\tCOMPILE %s\n\tCATCH TO loCErr\n", vfpStr(abs))
		fmt.Fprintf(&p, "\t\tfox_log(\"CERR|%s|\" + CHRTRAN(loCErr.Message, CHR(13)+CHR(10), \"  \"))\n", abs)
		p.WriteString("\tENDTRY\n")
		fmt.Fprintf(&p, "\tIF FILE(%s)\n", vfpStr(errFile))
		p.WriteString("\t\tLOCAL laCE[1], lnCEN, lnCEI\n")
		fmt.Fprintf(&p, "\t\tlnCEN = ALINES(laCE, FILETOSTR(%s))\n", vfpStr(errFile))
		p.WriteString("\t\tFOR lnCEI = 1 TO lnCEN\n")
		p.WriteString("\t\t\tIF !EMPTY(laCE(lnCEI))\n")
		fmt.Fprintf(&p, "\t\t\t\tfox_log(\"CERR|%s|\" + laCE(lnCEI))\n", abs)
		p.WriteString("\t\t\tENDIF\n\t\tENDFOR\n\tENDIF\n")
	}

	s, err := NewSession(time.Duration(*timeout) * time.Second)
	if err != nil {
		return fail(*jsonMode, "compile", err)
	}
	defer s.Close()
	res, err := s.Run(p.String())
	if err != nil {
		return fail(*jsonMode, "compile", err)
	}
	out := JSONOut{Command: "compile", Errors: res.Errors}
	for _, e := range res.Field("CERR") {
		out.Errors = append(out.Errors, strings.Join(e, ": "))
	}
	out.OK = res.Status == "OK" && len(out.Errors) == 0
	if out.OK {
		out.Output = fmt.Sprintf("%d arquivo(s) compilado(s) sem erros", fs.NArg())
	}
	return emit(*jsonMode, out)
}

// ---------------------------------------------------------------- run

func cmdRun(args []string) int {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	jsonMode := fs.Bool("json", false, "saída em JSON")
	timeout := fs.Int("timeout", 120, "timeout em segundos")
	parseFlags(fs, args)
	if fs.NArg() < 1 {
		return fail(*jsonMode, "run", fmt.Errorf("uso: foxcli run <programa.prg> [param1 param2 ...]"))
	}
	abs, err := filepath.Abs(fs.Arg(0))
	if err != nil {
		return fail(*jsonMode, "run", err)
	}
	if _, err := os.Stat(abs); err != nil {
		return fail(*jsonMode, "run", fmt.Errorf("arquivo não encontrado: %s", abs))
	}

	s, err := NewSession(time.Duration(*timeout) * time.Second)
	if err != nil {
		return fail(*jsonMode, "run", err)
	}
	defer s.Close()

	stdout := filepath.Join(s.WorkDir, "__stdout.txt")
	var p strings.Builder
	fmt.Fprintf(&p, "\tCD %s\n", vfpStr(filepath.Dir(abs)))
	fmt.Fprintf(&p, "\tSET ALTERNATE TO %s\n\tSET ALTERNATE ON\n", vfpStr(stdout))
	fmt.Fprintf(&p, "\tDO %s", vfpStr(abs))
	if fs.NArg() > 1 {
		params := make([]string, 0, fs.NArg()-1)
		for _, a := range fs.Args()[1:] {
			params = append(params, vfpStr(a))
		}
		fmt.Fprintf(&p, " WITH %s", strings.Join(params, ", "))
	}
	p.WriteString("\n\tSET ALTERNATE TO\n")

	res, err := s.Run(p.String())
	if err != nil {
		return fail(*jsonMode, "run", err)
	}
	out := JSONOut{Command: "run", OK: res.Status == "OK", Errors: res.Errors}
	if data, err := os.ReadFile(stdout); err == nil {
		out.Stdout = strings.TrimRight(fromANSI(data), "\r\n \t")
	}
	if out.OK {
		out.Output = "execução concluída"
	}
	return emit(*jsonMode, out)
}

// ---------------------------------------------------------------- inspect

var pjxTypes = map[string]string{
	"P": "program", "K": "form", "V": "classlib", "R": "report", "B": "label",
	"M": "menu", "d": "database", "D": "table", "Q": "query", "T": "text",
	"L": "library", "Z": "app", "x": "other", "X": "other", "F": "file",
	"i": "icon", "I": "icon", "H": "header",
}

func cmdInspect(args []string) int {
	fs := flag.NewFlagSet("inspect", flag.ExitOnError)
	jsonMode := fs.Bool("json", false, "saída em JSON")
	timeout := fs.Int("timeout", 90, "timeout em segundos")
	parseFlags(fs, args)
	if fs.NArg() < 1 {
		return fail(*jsonMode, "inspect", fmt.Errorf("uso: foxcli inspect <projeto.pjx>"))
	}
	abs, err := filepath.Abs(fs.Arg(0))
	if err != nil {
		return fail(*jsonMode, "inspect", err)
	}
	if _, err := os.Stat(abs); err != nil {
		return fail(*jsonMode, "inspect", fmt.Errorf("projeto não encontrado: %s", abs))
	}

	var p strings.Builder
	fmt.Fprintf(&p, "\tUSE %s AGAIN SHARED ALIAS __pjx IN 0\n", vfpStr(abs))
	p.WriteString(`	SELECT __pjx
	SCAN
		LOCAL lcN, lcMain, lcExcl
		lcN = CHRTRAN(ALLTRIM(__pjx.name), CHR(0), "")
		lcMain = IIF(TYPE("__pjx.mainprog") = "L" AND __pjx.mainprog, "1", "0")
		lcExcl = IIF(TYPE("__pjx.exclude") = "L" AND __pjx.exclude, "1", "0")
		fox_log("FILE|" + __pjx.type + "|" + lcMain + "|" + lcExcl + "|" + lcN)
	ENDSCAN
	USE IN __pjx
`)

	s, err := NewSession(time.Duration(*timeout) * time.Second)
	if err != nil {
		return fail(*jsonMode, "inspect", err)
	}
	defer s.Close()
	res, err := s.Run(p.String())
	if err != nil {
		return fail(*jsonMode, "inspect", err)
	}
	out := JSONOut{Command: "inspect", OK: res.Status == "OK", Errors: res.Errors}
	for _, f := range res.Field("FILE") {
		if len(f) < 4 {
			continue
		}
		t := strings.TrimSpace(f[0])
		if t == "H" { // registro de cabeçalho do projeto
			continue
		}
		tName, ok := pjxTypes[t]
		if !ok {
			tName = t
		}
		out.Files = append(out.Files, InspectFile{
			Type:    tName,
			Name:    strings.Join(f[3:], "|"),
			Main:    f[1] == "1",
			Exclude: f[2] == "1",
		})
	}
	if out.OK {
		out.Output = fmt.Sprintf("%d arquivo(s) no projeto", len(out.Files))
	}
	return emit(*jsonMode, out)
}
