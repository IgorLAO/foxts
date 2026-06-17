#!/bin/sh
# build.sh — pipeline do showcase catraca-app. Roda a partir de showcase/catraca-app/.
# Gera (1) os SCX nativos via `vfp build` (build/forms), (2) os previews PNG headless
# (dist/) e (3) o report.html. Para o EXE veja "vfp pack" (ou rode: npm run pack equivalente).
set -e
node icons/build-icons.js                       # SVG (Lucide) -> PNG (inline + herois)
node ../../vfp.js build                          # src/forms/*.form.tsx -> build/forms/*.scx (+ app.prg, vfp.json)
mkdir -p build/forms/icons build/icons
cp icons/*.png build/forms/icons/ && cp icons/*.png build/icons/   # icons p/ runtime (Picture relativo)
for f in src/forms/*.form.tsx; do
  node ../preview.js "$f" >/dev/null            # render fiel (canvas + Yoga) -> dist/<Page>.png
done
node report.js                                   # dist/report.html
echo "catraca showcase build OK (SCX em build/, previews+report em dist/)"
