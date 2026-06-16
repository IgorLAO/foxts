#!/bin/sh
# build.sh — icones (SVG->PNG) + paginas (TSX->SCX) do app de apostas. Rode de apostas-app/.
set -e
node icons/build-icons.js
mkdir -p dist/icons
cp icons/*.png dist/icons/
for page in pages/*.form.tsx; do
  name=$(basename "$page" .form.tsx)
  node ../../foxc.js build "$page" -o "dist/$name.scx" 2>&1 | tail -1
done
echo "apostas-app build OK"
