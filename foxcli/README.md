# foxcli

Toolchain de linha de comando para **Visual FoxPro 9**, escrito em Go.
Compila código VFP, gera executáveis, forms e classes — sem abrir o IDE —
e foi desenhado para ser usado por **agentes de IA** (saída `--json`,
erros estruturados com arquivo/linha, builds determinísticos a partir de
um manifesto texto).

## Como funciona

O VFP9 não tem compilador standalone: quem compila é o próprio `vfp9.exe`.
O foxcli gera um programa de bootstrap (`boot.prg`), lança o `vfp9.exe`
**invisível** (`SCREEN=OFF`, sem splash, sem resource), executa o build/
compile/run dentro dele, captura os erros (arquivos `.err` + TRY/CATCH)
num protocolo de resultado e encerra o processo. Se o VFP travar num
diálogo modal invisível (ex.: "Locate File"), o foxcli detecta a janela,
reporta a causa e mata o processo no timeout.

```
vfp.json (manifesto)  ─┐
source\*.prg (código) ─┼─> foxcli build ─> boot.prg ─> vfp9.exe (oculto) ─> __BUILD__\app.exe
                       │                                    │
                       └──── erros com linha <──── .err ────┘
```

## Comandos

| Comando | Função |
|---|---|
| `foxcli doctor` | verifica a instalação do VFP9 e o pipeline headless |
| `foxcli init <nome>` | cria projeto novo (`vfp.json`, `source\`, `__BUILD__\`) |
| `foxcli form <Nome> [--dir proj]` | gera um form como classe em PRG |
| `foxcli build [dir]` | compila projeto do manifesto e gera EXE/APP/DLL |
| `foxcli build <proj.pjx> [--out x.exe] [--type exe\|app\|dll]` | compila projeto legado existente |
| `foxcli compile <a.prg ...>` | só checa sintaxe; erros com número de linha |
| `foxcli run <a.prg> [params...]` | executa um PRG e captura a saída de `?` |
| `foxcli inspect <proj.pjx>` | lista o conteúdo de um `.pjx` (tipo, main, excluded) |

Flags comuns: `--json` (saída estruturada), `--timeout <segundos>`.
Variáveis de ambiente: `FOXCLI_VFP9` (caminho do vfp9.exe),
`FOXCLI_DEBUG=1` (preserva o diretório temporário do bootstrap).

## Compilar o foxcli

```
cd foxcli
go build -o foxcli.exe .
```

Sem dependências externas (somente stdlib). Requer VFP9 instalado na máquina.

Veja o **MANUAL.md** para o guia completo de uso, incluindo as regras de
código VFP que evitam travamento de build.
