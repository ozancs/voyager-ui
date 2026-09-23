#!/bin/bash
# build dist/ and pack it as oznlab_klipperui.zip (site files at the zip root, like mainsail.zip)
set -e
cd "$(dirname "$0")/.."
VER="${1:-v$(node -p "require('./package.json').version")}"
npm run build
find dist -name '*.woff' -delete   # browsers here all use woff2
printf '{"project_name":"oznlab_klipperui","project_owner":"ozancs","version":"%s"}\n' "$VER" > dist/release_info.json
rm -f oznlab_klipperui.zip
(cd dist && zip -qr ../oznlab_klipperui.zip .)
echo "oznlab_klipperui.zip ($VER)"
