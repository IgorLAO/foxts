package main

// templates.go — scaffold de projetos e forms (tudo em PRG texto puro,
// formato ideal para geração por agentes/LLMs).
//
// Layout padrão de projeto:
//   vfp.json                  manifesto
//   source\                   PRGs, forms e classes (texto)
//   source\forms\             forms como classes em PRG
//   __BUILD__\                saída do build (exe/app/dll)

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	srcDir   = "source"
	buildDir = "__BUILD__"
)

func scaffoldProject(dir, name string) error {
	if err := os.MkdirAll(filepath.Join(dir, srcDir, "forms"), 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(dir, buildDir), 0755); err != nil {
		return err
	}

	manifest := fmt.Sprintf(`{
  "name": %q,
  "main": "%s/main.prg",
  "type": "exe",
  "output": "%s/%s.exe",
  "files": [
    "%s/forms/frmmain.prg",
    "config.fpw"
  ]
}
`, name, srcDir, buildDir, name, srcDir)

	// SCREEN=OFF embutido no EXE esconde a janela principal do VFP;
	// só os forms top-level (ShowWindow=2) aparecem.
	configFpw := "SCREEN=OFF\r\nRESOURCE=OFF\r\n"

	mainPrg := `* main.prg — ponto de entrada
* Parâmetros de linha de comando do EXE chegam aqui como LPARAMETERS.
LPARAMETERS tcModo

* IMPORTANTE: sempre use a forma com expressão ("caminho") em
* SET PROCEDURE/SET CLASSLIB/DO. A forma literal (sem parênteses) faz o
* build travar num diálogo "Locate File" se a análise de dependências
* não resolver o caminho. Liste cada PRG referenciado assim no campo
* "files" do vfp.json para que ele entre no executável.
SET PROCEDURE TO ("source\forms\frmmain.prg") ADDITIVE

IF VARTYPE(tcModo) = "C" AND LOWER(ALLTRIM(tcModo)) == "check"
	* Verificação headless (testes automatizados): instancia o form
	* sem mostrar e grava uma prova de vida.
	LOCAL loCheck
	loCheck = CREATEOBJECT("frmMain")
	STRTOFILE("OK " + VERSION() + " form=" + loCheck.Caption + CHR(13) + CHR(10), "check_output.txt")
	loCheck = NULL
	QUIT
ENDIF

* Form top-level (ShowWindow=2) não segura o programa com Show(1) num EXE:
* mostre o form e entre no loop de eventos. O form executa CLEAR EVENTS
* no Destroy (veja frmmain.prg), o que libera o READ EVENTS ao fechar.
LOCAL loForm
loForm = CREATEOBJECT("frmMain")
loForm.Show()
READ EVENTS

QUIT
`

	formPrg := formTemplate("Main", name)

	gitignore := buildDir + "/\n*.pjx\n*.pjt\n*.err\n*.fxp\ncheck_output.txt\n"

	readme := fmt.Sprintf(`# %s

Projeto Visual FoxPro 9 gerenciado pelo foxcli.

- `+"`vfp.json`"+` — manifesto (main, tipo de saída, arquivos extras)
- `+"`source/main.prg`"+` — ponto de entrada
- `+"`source/forms/*.prg`"+` — forms definidos como classes (DEFINE CLASS ... AS Form)
- `+"`__BUILD__/`"+` — saída do build (não versionar)

## Comandos

    foxcli build                     # gera __BUILD__\%s.exe
    foxcli compile source\main.prg   # só checa sintaxe
    foxcli form Cadastro             # cria source\forms\frmcadastro.prg
`, name, name)

	files := map[string]string{
		"vfp.json":                    manifest,
		"config.fpw":                  configFpw,
		srcDir + "/main.prg":          mainPrg,
		srcDir + "/forms/frmmain.prg": formPrg,
		".gitignore":                  gitignore,
		"README.md":                   readme,
	}
	for rel, content := range files {
		if err := os.WriteFile(filepath.Join(dir, filepath.FromSlash(rel)), []byte(content), 0644); err != nil {
			return err
		}
	}
	return nil
}

func scaffoldForm(projDir, name string) (string, error) {
	dir, err := filepath.Abs(projDir)
	if err != nil {
		return "", err
	}
	formsDir := filepath.Join(dir, srcDir, "forms")
	if _, err := os.Stat(filepath.Join(dir, "vfp.json")); err != nil {
		return "", fmt.Errorf("não achei vfp.json em %s — rode dentro de um projeto foxcli ou use --dir", dir)
	}
	if err := os.MkdirAll(formsDir, 0755); err != nil {
		return "", err
	}
	fileName := "frm" + strings.ToLower(name) + ".prg"
	path := filepath.Join(formsDir, fileName)
	if _, err := os.Stat(path); err == nil {
		return "", fmt.Errorf("já existe: %s", path)
	}
	if err := os.WriteFile(path, []byte(formTemplate(name, name)), 0644); err != nil {
		return "", err
	}
	return path, nil
}

func formTemplate(name, caption string) string {
	lower := strings.ToLower(name)
	return fmt.Sprintf(`* frm%s.prg — form definido em código (classe)
* Uso: SET PROCEDURE TO ("source\forms\frm%s.prg") ADDITIVE
*      loForm = CREATEOBJECT("frm%s")
*      loForm.Show(1)
* (e adicione "source/forms/frm%s.prg" ao campo "files" do vfp.json)

DEFINE CLASS frm%s AS Form
	Caption = %q
	Height = 220
	Width = 360
	AutoCenter = .T.
	ShowWindow = 2	&& janela top-level (independente da tela principal)

	ADD OBJECT lblMensagem AS Label WITH ;
		Caption = "Olá, mundo!", ;
		Top = 60, Left = 30, AutoSize = .T., FontSize = 12

	ADD OBJECT cmdFechar AS CommandButton WITH ;
		Caption = "Fechar", ;
		Top = 150, Left = 140, Width = 80, Height = 27

	PROCEDURE cmdFechar.Click
		ThisForm.Release()
	ENDPROC

	PROCEDURE Destroy
		CLEAR EVENTS	&& libera o READ EVENTS do main.prg
	ENDPROC

ENDDEFINE
`, name, lower, name, lower, name, caption)
}
