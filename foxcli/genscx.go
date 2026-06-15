package main

// genscx.go — compila uma IR declarativa (form.json) em SCX/SCT, sem designer.
//
// A IR é a fronteira do pipeline "React → VFP": o layout (controles/props) é
// dado declarativo; a lógica (memos METHODS) são strings FoxPro — exatamente o
// que o transpilador foxts (TypeScript → FoxPro) produz. Aqui o Go monta o
// programa VFP que cria a tabela do SCX (um registro por objeto), e deixa o
// próprio vfp9.exe gravar o DBF/SCT — zero risco de errar o formato binário.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ---- IR (form.json) --------------------------------------------------------

type specMember struct {
	Name    string `json:"name"`
	Kind    string `json:"kind"`    // "method" | "property"
	Desc    string `json:"desc"`    // descrição (vai para o memo RESERVED3)
	Default string `json:"default"` // RHS do default da propriedade custom (modo "property")
}

type specControl struct {
	Type       string            `json:"type"` // baseclass VFP: label, textbox, grid, ...
	Name       string            `json:"name"`
	Parent     string            `json:"parent"` // nome do container pai (vazio = o form); habilita aninhamento
	Top        *int              `json:"top"`
	Left       *int              `json:"left"`
	Width      *int              `json:"width"`
	Height     *int              `json:"height"`
	Caption    *string           `json:"caption"`
	Properties map[string]any    `json:"properties"` // RHS emitido verbatim (".T.", 2, "RGB(...)")
	Methods    map[string]string `json:"methods"`    // nome -> corpo FoxPro
}

type formSpec struct {
	Name       string            `json:"name"`
	Caption    string            `json:"caption"`
	Width      int               `json:"width"`
	Height     int               `json:"height"`
	Properties map[string]any    `json:"properties"`
	Members    []specMember      `json:"members"`
	Methods    map[string]string `json:"methods"`
	Controls   []specControl     `json:"controls"`
}

// ---- formatação de valores e memos -----------------------------------------

const scxColumns = `PLATFORM C(8), UNIQUEID C(10), TIMESTAMP N(10), CLASS M, ` +
	`CLASSLOC M, BASECLASS M, OBJNAME M, PARENT M, PROPERTIES M, PROTECTED M, ` +
	`METHODS M, OBJCODE M, OLE M, OLE2 M, RESERVED1 M, RESERVED2 M, RESERVED3 M, ` +
	`RESERVED4 M, RESERVED5 M, RESERVED6 M, RESERVED7 M, RESERVED8 M, USER M`

const crlf = "\r\n"

func sortedKeys[V any](m map[string]V) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

// fmtVal emite o RHS de uma linha de PROPERTIES. Números viram literal; strings
// são repassadas como o autor escreveu (para permitir ".T.", "RGB(0,0,0)", "{}").
func fmtVal(v any) string {
	switch x := v.(type) {
	case float64:
		if x == float64(int64(x)) {
			return strconv.FormatInt(int64(x), 10)
		}
		return strconv.FormatFloat(x, 'f', -1, 64)
	case bool:
		if x {
			return ".T."
		}
		return ".F."
	case string:
		return x
	default:
		return fmt.Sprint(v)
	}
}

// foxLit delimita um valor de texto (caption, Name) como string VFP.
func foxLit(s string) string {
	if !strings.Contains(s, `"`) {
		return `"` + s + `"`
	}
	if !strings.Contains(s, "]") {
		return "[" + s + "]"
	}
	return `"` + strings.ReplaceAll(s, `"`, `'`) + `"`
}

func formPropsMemo(s *formSpec) string {
	var b strings.Builder
	w := func(line string) { b.WriteString(line + crlf) }
	w("Top = 0")
	w("Left = 0")
	w(fmt.Sprintf("Height = %d", s.Height))
	w(fmt.Sprintf("Width = %d", s.Width))
	w("DoCreate = .T.")
	if s.Caption != "" {
		w("Caption = " + foxLit(s.Caption))
	}
	for _, k := range sortedKeys(s.Properties) {
		w(k + " = " + fmtVal(s.Properties[k]))
	}
	for _, m := range s.Members { // defaults de propriedades custom antes de Name
		if m.Kind == "property" {
			def := m.Default
			if def == "" {
				def = ".F."
			}
			w(m.Name + " = " + def)
		}
	}
	w("Name = " + foxLit(s.Name))
	return b.String()
}

func membersMemo(s *formSpec) string {
	var b strings.Builder
	for _, m := range s.Members {
		prefix := ""
		if m.Kind == "method" { // métodos custom levam "*"; propriedades não
			prefix = "*"
		}
		b.WriteString(prefix + m.Name + " " + m.Desc + crlf)
	}
	return b.String()
}

func methodsMemo(methods map[string]string) string {
	var b strings.Builder
	for _, name := range sortedKeys(methods) {
		body := strings.ReplaceAll(methods[name], "\r\n", "\n")
		b.WriteString("PROCEDURE " + name + crlf)
		for _, ln := range strings.Split(body, "\n") {
			b.WriteString(ln + crlf)
		}
		b.WriteString("ENDPROC" + crlf)
	}
	return b.String()
}

func controlPropsMemo(c *specControl) string {
	var b strings.Builder
	w := func(line string) { b.WriteString(line + crlf) }
	if c.Top != nil {
		w(fmt.Sprintf("Top = %d", *c.Top))
	}
	if c.Left != nil {
		w(fmt.Sprintf("Left = %d", *c.Left))
	}
	if c.Width != nil {
		w(fmt.Sprintf("Width = %d", *c.Width))
	}
	if c.Height != nil {
		w(fmt.Sprintf("Height = %d", *c.Height))
	}
	if c.Caption != nil {
		w("Caption = " + foxLit(*c.Caption))
	}
	// Propriedades não-pontilhadas vêm antes do Name; as pontilhadas (membros de
	// container: PageN.Caption de um pageframe, ColumnN.* de um grid) vão DEPOIS
	// do Name. Motivo: o VFP só materializa esses membros ao processar o contador
	// (PageCount/ColumnCount, que são não-pontilhados) — configurá-los antes faria
	// o contador recriá-los e descartar o ajuste (ex.: caption da página perdido).
	var dotted []string
	for _, k := range sortedKeys(c.Properties) {
		if strings.Contains(k, ".") {
			dotted = append(dotted, k)
			continue
		}
		w(k + " = " + fmtVal(c.Properties[k]))
	}
	w("Name = " + foxLit(c.Name))
	for _, k := range dotted { // já em ordem (sortedKeys) — Page1.* antes de Page2.*
		w(k + " = " + fmtVal(c.Properties[k]))
	}
	return b.String()
}

// qualifyParent resolve o caminho de contenção que o VFP exige na coluna PARENT
// do SCX: o caminho pontilhado a partir da raiz do form (ex.: "Form.Cont.Sub" ou
// "Form.Pageframe1.Page1"). Sem a qualificação completa, os controles ficam todos
// flat no form (container.ControlCount = 0). `parentExpr` é a referência ao pai
// imediato como o transpilador a emite: o OBJNAME de um container (registro) ou um
// caminho relativo ao form para membros implícitos (páginas/colunas). A função
// sobe a cadeia de containers (mapa nome→pai) até a raiz.
func qualifyParent(formName, parentExpr string, parentOf map[string]string) string {
	if parentExpr == "" {
		return formName
	}
	low := strings.ToLower(parentExpr)
	if low == strings.ToLower(formName) || strings.HasPrefix(low, strings.ToLower(formName)+".") {
		return parentExpr // já qualificado (tolerante a specs escritos à mão)
	}
	head := parentExpr
	if i := strings.IndexByte(parentExpr, '.'); i >= 0 {
		head = parentExpr[:i] // membro implícito (página): qualifica pelo container-cabeça
	}
	if pp, ok := parentOf[strings.ToLower(head)]; ok && !strings.EqualFold(pp, parentExpr) {
		return qualifyParent(formName, pp, parentOf) + "." + parentExpr
	}
	return formName + "." + parentExpr
}

// ---- geração ---------------------------------------------------------------

func buildSCX(specPath, outPath string, timeoutSec int, jsonMode bool) int {
	raw, err := os.ReadFile(specPath)
	if err != nil {
		return fail(jsonMode, "form", fmt.Errorf("spec não encontrado: %s", specPath))
	}
	raw = []byte(strings.TrimPrefix(string(raw), "\ufeff")) // tolera BOM UTF-8
	var spec formSpec
	if err := json.Unmarshal(raw, &spec); err != nil {
		return fail(jsonMode, "form", fmt.Errorf("form.json inválido: %v", err))
	}
	if spec.Name == "" {
		return fail(jsonMode, "form", fmt.Errorf("form.json precisa de 'name'"))
	}
	if spec.Width == 0 {
		spec.Width = 400
	}
	if spec.Height == 0 {
		spec.Height = 300
	}
	if outPath == "" {
		outPath = filepath.Join(filepath.Dir(specPath), strings.ToLower(spec.Name)+".scx")
	}
	outAbs, err := filepath.Abs(outPath)
	if err != nil {
		return fail(jsonMode, "form", err)
	}
	base := strings.TrimSuffix(outAbs, filepath.Ext(outAbs))
	errFile := base + ".err"
	if err := os.MkdirAll(filepath.Dir(outAbs), 0755); err != nil {
		return fail(jsonMode, "form", err)
	}
	os.Remove(outAbs)
	os.Remove(base + ".sct")
	os.Remove(errFile)

	s, err := NewSession(time.Duration(timeoutSec) * time.Second)
	if err != nil {
		return fail(jsonMode, "form", err)
	}
	defer s.Close()

	// Memos longos (PROPERTIES/METHODS/RESERVED3) vão para arquivos no workdir e
	// são lidos com FILETOSTR — evita qualquer escape de aspas/CRLF no código VFP.
	memoIdx := 0
	var memoErr error
	filetostr := func(content string) string {
		memoIdx++
		fp := filepath.Join(s.WorkDir, fmt.Sprintf("memo%d.txt", memoIdx))
		if err := os.WriteFile(fp, toANSI(content), 0644); err != nil && memoErr == nil {
			memoErr = err
		}
		return "FILETOSTR(" + vfpStr(fp) + ")"
	}
	insert := func(cols, vals []string) string {
		return fmt.Sprintf("\tINSERT INTO (lcAlias) (%s) VALUES (%s)\n",
			strings.Join(cols, ", "), strings.Join(vals, ", "))
	}

	var p strings.Builder
	p.WriteString("\tLOCAL lcAlias, loF\n")
	fmt.Fprintf(&p, "\tCREATE TABLE (%s) FREE (%s)\n", vfpStr(outAbs), scxColumns)
	p.WriteString("\tlcAlias = ALIAS()\n")
	p.WriteString("\tfox_log(\"STEP|table\")\n")

	// 1. cabeçalho de versão
	p.WriteString("\tINSERT INTO (lcAlias) (PLATFORM, UNIQUEID, RESERVED1) " +
		"VALUES (\"COMMENT\", \"Screen\", \"VERSION =   3.00\")\n")
	// 2. dataenvironment
	p.WriteString("\tINSERT INTO (lcAlias) (PLATFORM, UNIQUEID, CLASS, BASECLASS, OBJNAME, RESERVED2, PROPERTIES) " +
		"VALUES (\"WINDOWS\", SYS(2015), \"dataenvironment\", \"dataenvironment\", \"Dataenvironment\", \"1\", " +
		"\"Top = 0\" + CHR(13) + CHR(10) + \"Left = 0\" + CHR(13) + CHR(10) + \"Name = \" + [\"Dataenvironment\"] + CHR(13) + CHR(10))\n")

	// 3. registro do form
	formCols := []string{"PLATFORM", "UNIQUEID", "CLASS", "BASECLASS", "OBJNAME", "PROPERTIES"}
	formVals := []string{`"WINDOWS"`, "SYS(2015)", `"form"`, `"form"`, vfpStr(spec.Name), filetostr(formPropsMemo(&spec))}
	if mem := membersMemo(&spec); strings.TrimSpace(mem) != "" {
		formCols = append(formCols, "RESERVED3")
		formVals = append(formVals, filetostr(mem))
	}
	if mm := methodsMemo(spec.Methods); strings.TrimSpace(mm) != "" {
		formCols = append(formCols, "METHODS")
		formVals = append(formVals, filetostr(mm))
	}
	p.WriteString(insert(formCols, formVals))

	// mapa nome(lower)→pai imediato, para qualificar a coluna PARENT como caminho
	// pontilhado a partir da raiz do form (exigido pelo VFP p/ contenção real).
	parentOf := make(map[string]string, len(spec.Controls))
	for i := range spec.Controls {
		parentOf[strings.ToLower(spec.Controls[i].Name)] = spec.Controls[i].Parent
	}

	// 4. um registro por controle (ordem = z-order)
	for i := range spec.Controls {
		c := &spec.Controls[i]
		if c.Type == "" || c.Name == "" {
			return fail(jsonMode, "form", fmt.Errorf("controle %d precisa de 'type' e 'name'", i))
		}
		bc := strings.ToLower(c.Type)
		parent := qualifyParent(spec.Name, c.Parent, parentOf) // "" → form; senão FQ pontilhado
		cols := []string{"PLATFORM", "UNIQUEID", "CLASS", "BASECLASS", "OBJNAME", "PARENT", "PROPERTIES"}
		vals := []string{`"WINDOWS"`, "SYS(2015)", vfpStr(bc), vfpStr(bc), vfpStr(c.Name), vfpStr(parent), filetostr(controlPropsMemo(c))}
		if mm := methodsMemo(c.Methods); strings.TrimSpace(mm) != "" {
			cols = append(cols, "METHODS")
			vals = append(vals, filetostr(mm))
		}
		p.WriteString(insert(cols, vals))
	}

	// 5. rodapé reservado
	p.WriteString("\tINSERT INTO (lcAlias) (PLATFORM, UNIQUEID, PROPERTIES) " +
		"VALUES (\"COMMENT\", \"RESERVED\", \"Arial, 0, 9, 5, 15, 12, 32, 3, 0\" + CHR(13))\n")
	p.WriteString("\tUSE IN (lcAlias)\n")
	p.WriteString("\tfox_log(\"STEP|inserted\")\n")

	if memoErr != nil {
		return fail(jsonMode, "form", memoErr)
	}

	// compila o SCX (erros vão para o .err) e valida instanciando NOSHOW
	fmt.Fprintf(&p, "\tCOMPILE FORM (%s)\n", vfpStr(outAbs))
	p.WriteString("\tfox_log(\"STEP|compiled\")\n")
	p.WriteString(payloadRelayErrFile(errFile))
	p.WriteString(payloadCheckOutput(outAbs))
	fmt.Fprintf(&p, "\tDO FORM (%s) NAME loF NOSHOW LINKED\n", vfpStr(outAbs))
	p.WriteString("\tfox_log(\"CAPTION|\" + loF.Caption)\n")
	p.WriteString("\tfox_log(\"CONTROLS|\" + TRANSFORM(loF.ControlCount))\n")
	p.WriteString("\tIF USED(\"curdias\")\n\t\tfox_log(\"ROWS|\" + TRANSFORM(RECCOUNT(\"curdias\")))\n\tENDIF\n")
	p.WriteString("\tloF.Release()\n")

	res, err := s.Run(p.String())
	if err != nil {
		return fail(jsonMode, "form", err)
	}
	o := JSONOut{Command: "form", OK: res.Status == "OK", Errors: res.Errors}
	for _, e := range res.Field("BUILDERR") {
		o.Errors = append(o.Errors, strings.Join(e, "|"))
		o.OK = false
	}
	if res.Status == "" {
		o.Errors = append(o.Errors, "o VFP abortou sem reportar status (use FOXCLI_DEBUG=1 para investigar)")
	}
	if o.OK {
		caption, controls, rows := "", "", ""
		if v := res.Field("CAPTION"); len(v) > 0 {
			caption = strings.Join(v[0], "|")
		}
		if v := res.Field("CONTROLS"); len(v) > 0 {
			controls = v[0][0]
		}
		if v := res.Field("ROWS"); len(v) > 0 {
			rows = " linhas=" + v[0][0]
		}
		o.Output = fmt.Sprintf("%s — caption=%q controles=%s%s", outAbs, caption, controls, rows)
	}
	return emit(jsonMode, o)
}
