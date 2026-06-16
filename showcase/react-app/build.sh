#!/bin/sh
# build.sh — pipeline do showcase react-app: ícones (SVG->PNG) + páginas (TSX->SCX).
# Rode a partir de showcase/react-app/ (foxc lê vfp.theme.json do cwd).
set -e
node icons/build-icons.js
mkdir -p dist/icons
cp icons/*.png dist/icons/   # icons ao lado do SCX (VFP resolve Picture relativo ao dir do form)
for page in pages/*.form.tsx; do
  name=$(basename "$page" .form.tsx)
  node ../../foxc.js build "$page" -o "dist/$name.scx" 2>&1 | tail -1
done
echo "showcase build OK"
