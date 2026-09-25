#!/bin/bash
# build dist/ and pack it as voyager-ui.zip (site files at the zip root, like mainsail.zip)
set -e
cd "$(dirname "$0")/.."
VER="${1:-v$(node -p "require('./package.json').version")}"
npm run build
find dist -name '*.woff' -delete   # browsers here all use woff2
printf '{"project_name":"voyager-ui","project_owner":"ozancs","version":"%s"}\n' "$VER" > dist/release_info.json
rm -f voyager-ui.zip
cp LICENSE dist/ 2>/dev/null; (cd dist && zip -qr ../voyager-ui.zip .)
echo "voyager-ui.zip ($VER)"
