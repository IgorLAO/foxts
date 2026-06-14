#!/bin/sh
# shot.sh <nome-sem-.form.tsx> — build + captura print real do VFP -> dist/<nome>.png
node ../foxc.js build "$1.form.tsx" -o "dist/$1.scx" 2>&1 | tail -1
rm -f "dist/$1.png"
SC="$(pwd -W)/dist/$1.scx"; PNG="$(pwd -W)/dist/$1.png"; CAP="$(pwd -W)/capture.prg"
printf 'SCREEN=ON\nRESOURCE=OFF\nTALK=OFF\nCOMMAND=DO "%s" WITH "%s","%s",.T.\n' "$CAP" "$SC" "$PNG" > dist/cap.fpw
"/c/Program Files (x86)/Microsoft Visual FoxPro 9/vfp9.exe" -T -C"$(pwd -W)/dist/cap.fpw" >/dev/null 2>&1
ls -la "dist/$1.png" 2>/dev/null | awk '{print "png bytes:", $5}'
