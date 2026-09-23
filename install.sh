#!/bin/bash
# OznLab Klipper UI installer / updater.
#
#   curl -fsSL https://raw.githubusercontent.com/ozancs/oznlab_klipperui/main/install.sh | bash
#
# Options (pass after "bash -s --" when piping, or directly when running the file):
#   --port 8000        port for the web UI (default 8000, Mainsail stays on 80)
#   --zip FILE         install from a local zip instead of downloading the latest release
#   --no-updater       do not add the [update_manager] section to moonraker.conf
#   --uninstall        remove the UI, its nginx site and the update_manager section
set -e

REPO="ozancs/oznlab_klipperui"
NAME="oznlab_klipperui"
WEB="$HOME/$NAME"
SITE="/etc/nginx/sites-available/$NAME"
CONF_DIR="$HOME/printer_data/config"
MR_CONF="$CONF_DIR/moonraker.conf"
PORT=8000
ZIP=""
UPDATER=1
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --zip) ZIP="$2"; shift 2 ;;
    --no-updater) UPDATER=0; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    [0-9]*) PORT="$1"; shift ;;          # old style: install.sh 8000 [zip]
    *.zip) ZIP="$1"; shift ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done
# a bare zip name is looked up next to this script, then in the config folder
if [ -n "$ZIP" ] && [ ! -f "$ZIP" ]; then
  for d in "$(dirname "${BASH_SOURCE[0]:-.}")" "$CONF_DIR"; do [ -f "$d/$ZIP" ] && { ZIP="$d/$ZIP"; break; }; done
fi

say() { echo -e "\e[1;33m>\e[0m $*"; }
restart_moonraker() { sudo systemctl restart moonraker 2>/dev/null || true; }

remove_old_carbon() {
  # earlier builds of this UI were called carbon-ui
  if [ -e /etc/nginx/sites-enabled/carbon-ui ] || [ -e /etc/nginx/sites-available/carbon-ui ]; then
    say "removing old carbon-ui nginx site"
    sudo rm -f /etc/nginx/sites-enabled/carbon-ui /etc/nginx/sites-available/carbon-ui
  fi
  [ -d "$HOME/carbon-ui" ] && { rm -rf "$HOME/carbon-ui"; say "removed ~/carbon-ui"; }
  [ -d "$CONF_DIR/carbon-ui" ] && rm -rf "$CONF_DIR/carbon-ui"
  return 0
}

remove_updater() {
  [ -f "$MR_CONF" ] || return 0
  python3 - "$MR_CONF" "$NAME" <<'EOF'
import sys, re
p, name = sys.argv[1], sys.argv[2]
s = open(p).read()
n = re.sub(r'\n?\[update_manager ' + re.escape(name) + r'\][^\[]*', '\n', s)
if n != s:
    open(p, 'w').write(n.rstrip('\n') + '\n')
    print('removed update_manager section')
EOF
}

if [ "$UNINSTALL" = 1 ]; then
  say "uninstalling"
  sudo rm -f "/etc/nginx/sites-enabled/$NAME" "$SITE"
  sudo nginx -t && sudo systemctl reload nginx
  rm -rf "$WEB"
  remove_updater
  restart_moonraker
  say "done. Settings stay in the Moonraker database (namespace $NAME)."
  exit 0
fi

command -v nginx >/dev/null || { echo "nginx not found. Install Mainsail or Fluidd with KIAUH first."; exit 1; }
command -v python3 >/dev/null || { echo "python3 not found"; exit 1; }

remove_old_carbon

if [ ! -f "$SITE" ] && ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$PORT\$"; then
  echo "Port $PORT is already in use. Try: --port 8001"; exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -z "$ZIP" ]; then
  say "downloading latest release"
  URL="https://github.com/$REPO/releases/latest/download/$NAME.zip"
  if command -v curl >/dev/null; then curl -fL --progress-bar -o "$TMP/ui.zip" "$URL"; else wget -q --show-progress -O "$TMP/ui.zip" "$URL"; fi
  ZIP="$TMP/ui.zip"
fi
[ -f "$ZIP" ] || { echo "$ZIP not found"; exit 1; }

say "extracting"
mkdir -p "$TMP/x"
python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$ZIP" "$TMP/x"
SRCDIR="$TMP/x"
[ -f "$TMP/x/www/index.html" ] && SRCDIR="$TMP/x/www"   # older zips kept the site in www/
[ -f "$SRCDIR/index.html" ] || { echo "zip does not contain index.html"; exit 1; }

say "installing to $WEB"
rm -rf "$WEB"
mkdir -p "$WEB"
cp -r "$SRCDIR/." "$WEB/"
chmod -R a+rX "$WEB"
chmod o+x "$HOME"

say "nginx site on port $PORT"
sudo tee "$SITE" >/dev/null <<EOF
# $NAME: served on its own port, Mainsail/Fluidd keep working on :80
server {
    listen $PORT;
    listen [::]:$PORT;
    root $WEB;
    index index.html;
    server_name _;
    client_max_body_size 0;
    proxy_request_buffering off;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/css application/javascript text/javascript application/json image/svg+xml font/woff2;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }
    location /websocket {
        proxy_pass http://127.0.0.1:7125/websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
    location ~ ^/(printer|api|access|machine|server)/ {
        proxy_pass http://127.0.0.1:7125\$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Scheme \$scheme;
    }
    location /webcam/ { postpone_output 0; proxy_buffering off; proxy_ignore_headers X-Accel-Buffering; proxy_pass http://127.0.0.1:8080/; }
    location /webcam2/ { postpone_output 0; proxy_buffering off; proxy_ignore_headers X-Accel-Buffering; proxy_pass http://127.0.0.1:8081/; }
    location /webcam3/ { postpone_output 0; proxy_buffering off; proxy_ignore_headers X-Accel-Buffering; proxy_pass http://127.0.0.1:8082/; }
    location /webcam4/ { postpone_output 0; proxy_buffering off; proxy_ignore_headers X-Accel-Buffering; proxy_pass http://127.0.0.1:8083/; }
}
EOF
sudo ln -sf "$SITE" "/etc/nginx/sites-enabled/$NAME"
sudo nginx -t
sudo systemctl reload nginx

if [ "$UPDATER" = 1 ] && [ -f "$MR_CONF" ]; then
  if grep -q "^\[update_manager $NAME\]" "$MR_CONF"; then
    say "update_manager entry already in moonraker.conf"
  else
    say "adding update_manager entry to moonraker.conf"
    cat >> "$MR_CONF" <<EOF

[update_manager $NAME]
type: web
channel: stable
repo: $REPO
path: ~/$NAME
EOF
    restart_moonraker
  fi
fi

echo ""
say "ready: http://$(hostname).local:$PORT"
