package main

import (
	"fmt"
	"os"
)

const version = "0.1.0"

const usage = `foxcli %s — toolchain de linha de comando para Visual FoxPro 9

Uso: foxcli <comando> [argumentos] [flags]

Comandos:
  doctor                       verifica a instalação do VFP9
  init <nome>                  cria um novo projeto (vfp.json + src/)
  form <Nome> [--dir proj]     adiciona um form (classe em PRG) ao projeto
  form --spec form.json [--out x.scx]  gera SCX/SCT a partir de uma IR declarativa
  build [dir | projeto.pjx]    compila e gera EXE/APP/DLL
  compile <arq.prg ...>        só checa sintaxe (reporta erros com linha)
  run <arq.prg> [params...]    executa um PRG e captura a saída (?/texto)
  inspect <projeto.pjx>        lista o conteúdo de um projeto existente

Flags comuns: --json (saída estruturada p/ agentes), --timeout <seg>
Variáveis:    FOXCLI_VFP9 (caminho do vfp9.exe), FOXCLI_DEBUG=1 (mantém temporários)

Exemplos:
  foxcli init meuapp
  foxcli build meuapp --json
  foxcli build C:\proj\sistema.pjx --type exe --out bin\sistema.exe
  foxcli run script.prg
`

func main() {
	if len(os.Args) < 2 {
		fmt.Printf(usage, version)
		os.Exit(2)
	}
	cmd := os.Args[1]
	args := os.Args[2:]
	var code int
	switch cmd {
	case "doctor":
		code = cmdDoctor(args)
	case "init":
		code = cmdInit(args)
	case "form":
		code = cmdForm(args)
	case "build":
		code = cmdBuild(args)
	case "compile":
		code = cmdCompile(args)
	case "run":
		code = cmdRun(args)
	case "inspect":
		code = cmdInspect(args)
	case "version", "--version", "-v":
		fmt.Println("foxcli", version)
	case "help", "--help", "-h":
		fmt.Printf(usage, version)
	default:
		fmt.Fprintf(os.Stderr, "comando desconhecido: %s\n\n", cmd)
		fmt.Printf(usage, version)
		code = 2
	}
	os.Exit(code)
}
