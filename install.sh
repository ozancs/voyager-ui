#!/bin/bash
# Voyager UI installer / updater.
#
#   curl -fsSL https://raw.githubusercontent.com/ozancs/voyager-ui/main/install.sh | bash
#
# It checks the system first, finds every Klipper/Moonraker instance on this host, asks which ones
# to install for, picks free ports, checks that Moonraker will accept the UI and then installs.
#
# Options (pass after "bash -s --" when piping, or directly when running the file):
#   --port 8000          first port to try for the web UI (Mainsail stays on 80)
#   --zip FILE           install from a local zip instead of downloading the latest release
#   --printer NAME[,..]  install only for these instances (folder names like printer_data), or "all"
#   --moonraker-port N   Moonraker port, when it cannot be found automatically (single instance)
#   --yes                do not ask, take the suggested answer everywhere
#   --no-updater         do not add the [update_manager] section to moonraker.conf
#   --check              only run the system check, change nothing
#   --uninstall          remove the UI from every instance
set -e

REPO="ozancs/voyager-ui"
NAME="voyager-ui"
PORT=8000
PORT_SET=0
ZIP=""
UPDATER=1
UNINSTALL=0
CHECK_ONLY=0
YES=0
PICK=""
MR_PORT_ARG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; PORT_SET=1; shift 2 ;;
    --zip) ZIP="$2"; shift 2 ;;
    --printer|--printers) PICK="$2"; shift 2 ;;
    --moonraker-port) MR_PORT_ARG="$2"; shift 2 ;;
    --yes|-y) YES=1; shift ;;
    --no-updater) UPDATER=0; shift ;;
    --check) CHECK_ONLY=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    [0-9]*) PORT="$1"; PORT_SET=1; shift ;;          # old style: install.sh 8000 [zip]
    *.zip) ZIP="$1"; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done
if [ -n "$ZIP" ] && [ ! -f "$ZIP" ]; then
  for d in "$(dirname "${BASH_SOURCE[0]:-.}")" "$HOME/printer_data/config"; do [ -f "$d/$ZIP" ] && { ZIP="$d/$ZIP"; break; }; done
fi

# ---------------------------------------------------------------- output and questions
if [ -t 1 ]; then B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'; else B= D= G= Y= R= C= N=; fi
say()  { echo "${C}>${N} $*"; }
ok()   { printf "  ${G}✔${N} %-22s %s\n" "$1" "$2"; }
warn() { printf "  ${Y}!${N} %-22s %s\n" "$1" "$2"; WARNS=$((WARNS+1)); }
bad()  { printf "  ${R}✘${N} %-22s %s\n" "$1" "$2"; FAILS=$((FAILS+1)); }
WARNS=0; FAILS=0
TTY=0; (: < /dev/tty > /dev/tty) 2>/dev/null && TTY=1   # works through "curl | bash" too
# ask "question" default  -> REPLY
ask() {
  REPLY="$2"
  [ "$YES" = 1 ] || [ "$TTY" = 0 ] && { [ -n "$2" ] && echo "$1 $2"; return 0; }
  printf "%s ${D}[%s]${N} " "$1" "$2" > /dev/tty
  read -r REPLY < /dev/tty || REPLY=""
  [ -z "$REPLY" ] && REPLY="$2"
  return 0
}
yesno() { ask "$1 (y/n)" "${2:-y}"; [[ "$REPLY" =~ ^[YyEe] ]]; }

SUDO=sudo; [ "$(id -u)" = 0 ] && SUDO=""
restart_moonraker() {  # $1 = instance folder name, restarts only that Moonraker
  local unit="moonraker"; [ -n "$1" ] && [ "$1" != "printer_data" ] && systemctl list-unit-files 2>/dev/null | grep -q "^moonraker-${1%_data}\.service" && unit="moonraker-${1%_data}"
  $SUDO systemctl restart "$unit" 2>/dev/null || $SUDO systemctl restart moonraker 2>/dev/null || true
}

# ---------------------------------------------------------------- instances
# Every folder in $HOME with config/moonraker.conf is one printer (printer_data, printer_data_2, voron_data ...)
INST=(); INST_PORT=(); INST_HOW=()
conf_port() { python3 - "$1" <<'EOF'
import sys, re
try: s = open(sys.argv[1]).read()
except Exception: sys.exit()
m = re.search(r'^\[server\][^\[]*?^\s*port\s*[:=]\s*(\d+)', s, re.M | re.S)
print(m.group(1) if m else '')
EOF
}
# ask a running Moonraker where its config lives: GET /server/files/roots
mr_config_path() { curl -s -m 2 "http://127.0.0.1:$1/server/files/roots" 2>/dev/null | python3 -c "import sys,json
try:
  r=json.load(sys.stdin)['result']; print(next(x['path'] for x in r if x['name']=='config'))
except Exception: pass" 2>/dev/null; }
mr_alive() { local c; c=$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$1/server/info" 2>/dev/null); [ "$c" = 200 ] || [ "$c" = 401 ] || [ "$c" = 403 ]; }

find_instances() {
  local d name
  declare -A seen=()
  for d in "$HOME"/printer_data "$HOME"/printer_data_* "$HOME"/*_data; do
    [ -f "$d/config/moonraker.conf" ] || continue
    name=$(basename "$d"); [ -n "${seen[$name]}" ] && continue; seen[$name]=1
    INST+=("$name")
  done
  # ports: moonraker.conf first, then ask the running Moonrakers which config folder is theirs
  declare -A byPath=()
  if command -v curl >/dev/null; then
    for p in $(seq 7125 7140); do
      mr_alive "$p" || continue
      local cp; cp=$(mr_config_path "$p")
      if [ -n "$cp" ]; then byPath["$(readlink -f "$(dirname "$cp")" 2>/dev/null || dirname "$cp")"]=$p; else byPath["?$p"]=$p; fi
    done
  fi
  local i
  for i in "${!INST[@]}"; do
    local d="$HOME/${INST[$i]}" p how
    p="${byPath[$(readlink -f "$d" 2>/dev/null || echo "$d")]}"; how="asked Moonraker"
    [ -z "$p" ] && { p=$(conf_port "$d/config/moonraker.conf"); how="moonraker.conf"; }
    if [ -z "$p" ] && [ "${#INST[@]}" = 1 ]; then
      local alive=(); for q in "${!byPath[@]}"; do alive+=("${byPath[$q]}"); done
      if [ "${#alive[@]}" = 1 ]; then p="${alive[0]}"; how="only Moonraker running"
      elif [ "${#alive[@]}" -gt 1 ]; then p=""; MR_CANDIDATES="${alive[*]}"
      else p=7125; how="default"; fi
    fi
    INST_PORT[$i]="$p"; INST_HOW[$i]="$how"
  done
}

# ---------------------------------------------------------------- uninstall
remove_updater() {
  [ -f "$1" ] || return 0
  python3 - "$1" "$2" <<'EOF'
import sys, re
p, name = sys.argv[1], sys.argv[2]
s = open(p).read()
n = re.sub(r'\n?\[update_manager ' + re.escape(name) + r'\][^\[]*', '\n', s)
if n != s: open(p, 'w').write(n.rstrip('\n') + '\n'); print('  removed update_manager from', p)
EOF
}
if [ "$UNINSTALL" = 1 ]; then
  say "uninstalling"
  for s in /etc/nginx/sites-available/$NAME /etc/nginx/sites-available/$NAME-*; do
    [ -e "$s" ] || continue; $SUDO rm -f "$s" "/etc/nginx/sites-enabled/$(basename "$s")"; echo "  removed nginx site $(basename "$s")"
  done
  $SUDO nginx -t >/dev/null 2>&1 && $SUDO systemctl reload nginx
  for d in "$HOME/$NAME" "$HOME/$NAME"-*; do [ -d "$d" ] && rm -rf "$d" && echo "  removed $d"; done
  find_instances
  for i in "${!INST[@]}"; do
    n="$NAME"; [ "${INST[$i]}" != printer_data ] && n="$NAME-${INST[$i]}"
    remove_updater "$HOME/${INST[$i]}/config/moonraker.conf" "$n" && restart_moonraker "${INST[$i]}"
  done
  say "done. Settings stay in the Moonraker database (namespace $NAME)."
  exit 0
fi

# ---------------------------------------------------------------- system check
echo
echo "${B}Voyager UI${N} ${D}system check${N}"
OS="unknown"; [ -f /etc/os-release ] && OS=$(. /etc/os-release; echo "${PRETTY_NAME:-$NAME}")
if [ -d /usr/data/printer_data ] || grep -qi "creality\|buildroot" /etc/os-release 2>/dev/null; then
  bad "system" "$OS looks like a Creality K1/K1 Max. Its web server is different, not supported yet."
elif [ -f /etc/openwrt_release ]; then
  bad "system" "OpenWrt (Sonic Pad and similar) is not supported yet."
else
  ok "system" "$OS, $(uname -m)"
fi
if [ "$(id -u)" = 0 ]; then warn "user" "running as root. Run it as the user Klipper runs as (usually pi)."; else ok "user" "$(whoami)"; fi
if [ -n "$SUDO" ]; then
  if command -v sudo >/dev/null; then ok "sudo" "available (may ask for your password)"; else bad "sudo" "not found"; fi
fi
if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then ok "systemd" "yes"; else warn "systemd" "not found, services will not be reloaded automatically"; fi
command -v python3 >/dev/null && ok "python3" "$(python3 -V 2>&1 | cut -d' ' -f2)" || bad "python3" "not found (sudo apt install python3)"
command -v curl >/dev/null && ok "curl" "yes" || { if [ -z "$ZIP" ]; then bad "curl" "needed to download (sudo apt install curl)"; else warn "curl" "not found, some checks are skipped"; fi; }
NGINX_MISSING=0
NGX="$(command -v nginx || echo /usr/sbin/nginx)"
if [ -x "$NGX" ]; then ok "nginx" "$("$NGX" -v 2>&1 | sed 's/.*\///')"
else warn "nginx" "not installed"; NGINX_MISSING=1; fi
[ -d /etc/nginx/sites-available ] || [ "$NGINX_MISSING" = 1 ] || warn "nginx layout" "/etc/nginx/sites-available missing, a sites folder will be created"
FREE_KB=$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2{print $4}')
[ -n "$FREE_KB" ] && { [ "$FREE_KB" -gt 20480 ] && ok "disk" "$((FREE_KB/1024)) MB free" || bad "disk" "less than 20 MB free in $HOME"; }

command -v python3 >/dev/null && find_instances
if [ "${#INST[@]}" = 0 ]; then
  bad "printers" "no printer_data folder with moonraker.conf found in $HOME"
else
  for i in "${!INST[@]}"; do
    p="${INST_PORT[$i]}"
    if [ -z "$p" ]; then warn "${INST[$i]}" "Moonraker port unknown"
    elif mr_alive "$p"; then ok "${INST[$i]}" "Moonraker on :$p (${INST_HOW[$i]})"
    else warn "${INST[$i]}" "Moonraker :$p is not answering (${INST_HOW[$i]}), is it running?"; fi
  done
fi
echo
if [ "$FAILS" -gt 0 ]; then echo "${R}${B}Not compatible:${N} fix the ✘ items above and run the installer again."; exit 1; fi
[ "$CHECK_ONLY" = 1 ] && { echo "${G}${B}Looks compatible.${N} ${D}(--check: nothing was changed)${N}"; exit 0; }

# ---------------------------------------------------------------- fix what we can
if [ "$NGINX_MISSING" = 1 ]; then
  if command -v apt-get >/dev/null && yesno "nginx is needed. Install it now?" y; then
    $SUDO apt-get update -qq && $SUDO apt-get install -y -qq nginx
    $SUDO systemctl enable --now nginx 2>/dev/null || true
  else echo "Install nginx (or Mainsail/Fluidd with KIAUH) and run the installer again."; exit 1; fi
fi
$SUDO mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
if ! grep -rqs "sites-enabled" /etc/nginx/nginx.conf; then
  warn "nginx" "nginx.conf does not include sites-enabled, adding an include"
  $SUDO sed -i 's#^\(\s*\)include /etc/nginx/conf.d/\*\.conf;#&\n\1include /etc/nginx/sites-enabled/*;#' /etc/nginx/nginx.conf
fi

# ---------------------------------------------------------------- choose printers
CHOSEN=()
if [ "${#INST[@]}" = 1 ]; then CHOSEN=(0)
else
  echo "${B}Printers on this host${N}"
  for i in "${!INST[@]}"; do echo "  $((i+1))) ${INST[$i]}  ${D}Moonraker :${INST_PORT[$i]:-?}${N}"; done
  sel="$PICK"
  [ -z "$sel" ] && { ask "Install for which? (numbers like 1,3 or all)" "all"; sel="$REPLY"; }
  if [ "$sel" = all ]; then CHOSEN=("${!INST[@]}")
  else
    for tok in ${sel//,/ }; do
      if [[ "$tok" =~ ^[0-9]+$ ]] && [ "$tok" -ge 1 ] && [ "$tok" -le "${#INST[@]}" ]; then CHOSEN+=($((tok-1)))
      else for i in "${!INST[@]}"; do [ "${INST[$i]}" = "$tok" ] && CHOSEN+=("$i"); done; fi
    done
  fi
  [ "${#CHOSEN[@]}" = 0 ] && { echo "nothing selected"; exit 1; }
fi
# unknown Moonraker ports: ask
for i in "${CHOSEN[@]}"; do
  [ -n "$MR_PORT_ARG" ] && [ "${#CHOSEN[@]}" = 1 ] && INST_PORT[$i]="$MR_PORT_ARG"
  while [ -z "${INST_PORT[$i]}" ] || ! mr_alive "${INST_PORT[$i]}"; do
    [ "$YES" = 1 ] || [ "$TTY" = 0 ] && { [ -n "${INST_PORT[$i]}" ] && break; echo "Moonraker port for ${INST[$i]} is unknown, use --moonraker-port"; exit 1; }
    [ -n "$MR_CANDIDATES" ] && echo "  Moonrakers running on: $MR_CANDIDATES"
    ask "Moonraker port for ${INST[$i]}?" "${INST_PORT[$i]:-${MR_CANDIDATES%% *}}"; INST_PORT[$i]="$REPLY"
    if ! mr_alive "$REPLY"; then
      if yesno "Nothing answers on :$REPLY. Use it anyway?" n; then break; fi
    fi
  done
done

# ---------------------------------------------------------------- download once
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ -z "$ZIP" ]; then
  say "downloading latest release"
  URL="https://github.com/$REPO/releases/latest/download/$NAME.zip"
  if command -v curl >/dev/null; then curl -fL --progress-bar -o "$TMP/ui.zip" "$URL"; else wget -q --show-progress -O "$TMP/ui.zip" "$URL"; fi
  ZIP="$TMP/ui.zip"
fi
[ -f "$ZIP" ] || { echo "$ZIP not found"; exit 1; }
mkdir -p "$TMP/x"
python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$ZIP" "$TMP/x"
SRCDIR="$TMP/x"; [ -f "$TMP/x/www/index.html" ] && SRCDIR="$TMP/x/www"
[ -f "$SRCDIR/index.html" ] || { echo "zip does not contain index.html"; exit 1; }

# earlier builds were called carbon-ui and oznlab_klipperui: their nginx sites go, their port is reused
for OLD in carbon-ui oznlab_klipperui; do
  for f in /etc/nginx/sites-available/"$OLD"*; do
    [ -e "$f" ] || continue
    [ "$(basename "$f")" = "$OLD" ] && CARBON_PORT="$(grep -m1 -oE 'listen [0-9]+' "$f" | grep -oE '[0-9]+')"
    $SUDO rm -f "/etc/nginx/sites-enabled/$(basename "$f")" "$f"; say "removed old $(basename "$f") site"
  done
  rm -rf "$HOME/$OLD" "$HOME/printer_data/config/$OLD" 2>/dev/null || true
done

# ---------------------------------------------------------------- ports
TAKEN=" "
port_used() {
  case "$TAKEN" in *" $1 "*) return 0 ;; esac
  if command -v ss >/dev/null; then ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
  else ! python3 -c "import socket,sys; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('', int(sys.argv[1])))" "$1" 2>/dev/null; fi
}
port_owner() { $SUDO -n ss -ltnpH 2>/dev/null | awk -v p="$1" '$4 ~ "[:.]"p"$"' | grep -oE '"[^"]+"' | head -1 | tr -d '"'; }
free_port_from() { local p=$1; while [ "$p" -lt 65535 ] && port_used "$p"; do p=$((p+1)); done; echo "$p"; }

# ---------------------------------------------------------------- webcams from crowsnest
cam_ports() {  # ports of [cam ...] sections, in file order, 8080.. when unknown
  local f="$1/config/crowsnest.conf" ps=""
  [ -f "$f" ] && ps=$(python3 - "$f" <<'EOF'
import sys, re
s = open(sys.argv[1]).read()
out = []
for sec in re.split(r'^\[', s, flags=re.M):
    if sec.lower().startswith('cam'):
        m = re.search(r'^\s*port\s*[:=]\s*(\d+)', sec, re.M)
        if m: out.append(m.group(1))
print(' '.join(out))
EOF
)
  [ -z "$ps" ] && ps="8080 8081 8082 8083"
  echo "$ps"
}

# ---------------------------------------------------------------- Moonraker authorization
# The browser reaches Moonraker through our nginx, so Moonraker sees the browser's LAN address.
# That address must be in trusted_clients (or the user has to log in, which this UI does not do yet).
auth_check() {  # $1 conf file -> prints: ok | missing <subnet> | force_logins
  python3 - "$1" "$(hostname -I 2>/dev/null | awk '{print $1}')" <<'EOF'
import sys, re, ipaddress
conf, ip = sys.argv[1], sys.argv[2]
try: s = open(conf).read()
except Exception: print('ok'); sys.exit()
m = re.search(r'^\[authorization\]([^\[]*)', s, re.M)
if not m: print('ok'); sys.exit()          # no [authorization]: Moonraker trusts everyone
sec = m.group(1)
if re.search(r'^\s*force_logins\s*[:=]\s*(true|yes|1)', sec, re.M | re.I): print('force_logins'); sys.exit()
try: net = ipaddress.ip_network(ip + '/24', strict=False)
except Exception: print('ok'); sys.exit()
tm = re.search(r'^\s*trusted_clients\s*[:=]((?:.*\n?)(?:[ \t]+.*\n?)*)', sec, re.M)
entries = re.findall(r'[0-9a-fA-F:.]+/\d+|\d+\.\d+\.\d+\.\d+|[\w.-]+', tm.group(1)) if tm else []
for e in entries:
    try:
        n = ipaddress.ip_network(e if '/' in e else e + '/32', strict=False)
        if net.subnet_of(n) if n.version == net.version else False: print('ok'); sys.exit()
    except Exception: pass
print('missing', net)
EOF
}
add_trusted() {  # $1 conf, $2 subnet
  cp "$1" "$1.bak-oznlab"
  python3 - "$1" "$2" <<'EOF'
import sys, re
p, net = sys.argv[1], sys.argv[2]
s = open(p).read()
m = re.search(r'^\[authorization\][^\[]*', s, re.M)
sec = m.group(0)
t = re.search(r'^(\s*trusted_clients\s*[:=].*\n(?:[ \t]+\S.*\n)*)', sec, re.M)
if t: new = sec.replace(t.group(1), t.group(1).rstrip('\n') + '\n    ' + net + '\n', 1)
else: new = sec.rstrip('\n') + '\ntrusted_clients:\n    ' + net + '\n\n'
open(p, 'w').write(s.replace(sec, new, 1))
EOF
}

# ---------------------------------------------------------------- install each printer
SUMMARY=(); WROTE=()
V6ON=0; grep -q . /proc/net/if_inet6 2>/dev/null && V6ON=1   # no IPv6 on this host: an [::] listen would break nginx
for i in "${CHOSEN[@]}"; do
  inst="${INST[$i]}"; mrp="${INST_PORT[$i]}"; dir="$HOME/$inst"; conf="$dir/config/moonraker.conf"
  n="$NAME"; [ "$inst" != printer_data ] && n="$NAME-$inst"
  web="$HOME/$n"; site="/etc/nginx/sites-available/$n"
  echo; echo "${B}$inst${N}"

  # port: keep the one from the last install, else the first free one
  own=""; [ -f "$site" ] && own="$(grep -m1 -oE 'listen [0-9]+' "$site" | grep -oE '[0-9]+')"
  [ -z "$own" ] && [ "$inst" = printer_data ] && own="$CARBON_PORT"
  if [ -n "$own" ] && [ "$PORT_SET" = 0 ]; then p="$own"
  else
    p=$(free_port_from "$PORT")
    if [ "$p" != "$PORT" ] && [ -z "$PORT_NOTED" ]; then
      case "$TAKEN" in *" $PORT "*) ;; *) who="$(port_owner "$PORT")"; echo "  port $PORT is in use${who:+ by $who}, next free port is $p"; PORT_NOTED=1 ;; esac
    fi
  fi
  # a free port chosen from the suggestion; the user can still type another one
  if [ "$TTY" = 1 ] && [ "$YES" = 0 ] && [ -z "$own" ]; then
    ask "  Web UI port for $inst?" "$p"
    while :; do
      if ! [[ "$REPLY" =~ ^[0-9]+$ ]] || [ "$REPLY" -lt 1 ] || [ "$REPLY" -gt 65535 ]; then ask "  '$REPLY' is not a port number, port?" "$p"
      elif [ "$REPLY" != "$p" ] && port_used "$REPLY"; then ask "  :$REPLY is in use, another port?" "$p"
      else break; fi
    done
    p="$REPLY"
  fi
  TAKEN="$TAKEN$p "
  echo "  web UI port $p${own:+ (kept from the last install)}"

  say "files -> $web"
  rm -rf "$web"; mkdir -p "$web"; cp -r "$SRCDIR/." "$web/"; chmod -R a+rX "$web"; chmod o+x "$HOME"

  cams=($(cam_ports "$dir")); camloc=""
  for k in "${!cams[@]}"; do
    path="/webcam/"; [ "$k" -gt 0 ] && path="/webcam$((k+1))/"
    camloc+="    location $path { postpone_output 0; proxy_buffering off; proxy_ignore_headers X-Accel-Buffering; proxy_pass http://127.0.0.1:${cams[$k]}/; }"$'\n'
  done

  V6=""; [ "$V6ON" = 1 ] && V6="    listen [::]:$p;"
  say "nginx :$p -> Moonraker :$mrp, webcams ${cams[*]}"
  if [ -f "$site" ]; then cp "$site" "$TMP/$n.site.bak"; fi
  WROTE+=("$n")
  $SUDO tee "$site" >/dev/null <<EOF
# $n: Voyager UI for $inst, Mainsail/Fluidd keep working on their own port
server {
    listen $p;
$V6
    root $web;
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

    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location / { try_files \$uri \$uri/ /index.html; add_header Cache-Control "no-store, no-cache, must-revalidate"; }
    location = /index.html { add_header Cache-Control "no-store, no-cache, must-revalidate"; }
    location /websocket {
        proxy_pass http://127.0.0.1:$mrp/websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
    location ~ ^/(printer|api|access|machine|server)/ {
        proxy_pass http://127.0.0.1:$mrp\$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Scheme \$scheme;
    }
$camloc}
EOF
  $SUDO ln -sf "$site" "/etc/nginx/sites-enabled/$n"

  restart=0
  # update_manager entries of the old names point at repos that no longer exist
  for OLD in carbon-ui oznlab_klipperui; do
    on="$OLD"; [ "$inst" != printer_data ] && on="$OLD-$inst"
    [ -f "$conf" ] && grep -q "^\[update_manager $on\]" "$conf" && remove_updater "$conf" "$on" && restart=1
  done
  if [ "$UPDATER" = 1 ] && [ -f "$conf" ] && ! grep -q "^\[update_manager $n\]" "$conf"; then
    say "update_manager entry in moonraker.conf"
    printf '\n[update_manager %s]\ntype: web\nchannel: stable\nrepo: %s\npath: ~/%s\n' "$n" "$REPO" "$n" >> "$conf"
    restart=1
  fi

  a=$(auth_check "$conf"); status="ok"
  case "$a" in
    ok) ;;
    force_logins)
      warn "authorization" "force_logins is on in moonraker.conf. This UI has no login screen yet,"
      echo "     set force_logins: False under [authorization] or add your network to trusted_clients."; status="login needed" ;;
    missing*)
      net="${a#missing }"
      echo "  ${Y}!${N} Moonraker does not trust $net yet, the UI would be refused from your PC."
      echo "    ${D}it needs this under [authorization] in moonraker.conf:${N}"
      echo "      trusted_clients:"; echo "          $net"
      if yesno "  Add it now? (a backup is kept as moonraker.conf.bak-oznlab)" y; then add_trusted "$conf" "$net"; restart=1; echo "  added"
      else status="add $net to trusted_clients"; fi ;;
  esac
  [ "$restart" = 1 ] && restart_moonraker "$inst"
  SUMMARY+=("$inst|$p|$mrp|$status")
done

say "reloading nginx"
if ! $SUDO nginx -t 2>"$TMP/nginx.err"; then
  cat "$TMP/nginx.err"
  # put nginx back the way it was so Mainsail keeps working
  for n in "${WROTE[@]}"; do
    if [ -f "$TMP/$n.site.bak" ]; then $SUDO cp "$TMP/$n.site.bak" "/etc/nginx/sites-available/$n"
    else $SUDO rm -f "/etc/nginx/sites-available/$n" "/etc/nginx/sites-enabled/$n"; fi
  done
  echo "${R}nginx config test failed. The new sites were removed again, nginx was not reloaded.${N}"; exit 1
fi
$SUDO systemctl reload nginx 2>/dev/null || $SUDO nginx -s reload

# ---------------------------------------------------------------- final test
sleep 2
HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -z "$HOST" ] && HOST="$(hostname).local"
echo; echo "${B}Result${N}"
for row in "${SUMMARY[@]}"; do
  IFS='|' read -r inst p mrp status <<< "$row"
  code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$p/server/info" 2>/dev/null || echo 000)
  page=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$p/" 2>/dev/null || echo 000)
  if [ "$page" = 200 ] && [ "$code" = 200 ] && [ "$status" = ok ]; then ok "$inst" "http://$HOST:$p"
  elif [ "$page" = 200 ]; then warn "$inst" "http://$HOST:$p  (Moonraker answered $code${status:+, $status})"
  else bad "$inst" "page did not load on :$p (HTTP $page)"; fi
done
echo
