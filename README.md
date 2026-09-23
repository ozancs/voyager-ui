# OznLab Klipper UI

A web interface for Klipper printers, running next to Mainsail or Fluidd on its own port. It talks to Moonraker like any other client, so nothing in Klipper changes.

Status: early and tested on one printer (CoreXY, Raspberry Pi 4, Klipper + Moonraker installed with KIAUH). Expect rough edges.

## Features

- dashboard with cards you can drag, resize, hide and add (custom command and macro buttons included)
- favorites bar for macros and commands, with icons and autocomplete
- temperatures, fans, LEDs, filament sensors and Spoolman in one strip
- console, webcam, 3d heightmap, g-code viewer, file manager, print history
- config editor with search, and a backup copy is made before every save
- machine page with system load and update manager
- settings are stored in the Moonraker database and can be exported as a file

## Requirements

- Klipper and Moonraker
- nginx (already there if you installed Mainsail or Fluidd)
- a free port, 8000 by default

## Install

Run on the printer host over SSH:

```bash
curl -fsSL https://raw.githubusercontent.com/ozancs/oznlab_klipperui/main/install.sh | bash
```

Then open `http://<printer-host>:8000`. Mainsail or Fluidd keeps working on port 80. If port 8000 is taken, the installer says what is using it and offers the next free port. Updates keep the port you picked.

To use another port:

```bash
curl -fsSL https://raw.githubusercontent.com/ozancs/oznlab_klipperui/main/install.sh | bash -s -- --port 8001
```

The installer:

1. downloads the latest release to `~/oznlab_klipperui`
2. adds an nginx site for the chosen port
3. adds this section to `moonraker.conf` so updates show up in the update manager:

```ini
[update_manager oznlab_klipperui]
type: web
channel: stable
repo: ozancs/oznlab_klipperui
path: ~/oznlab_klipperui
```

Use `--no-updater` to skip step 3.

## Update

Use the update manager in this UI, Mainsail or Fluidd. Running the install command again also works.

## Roll back or install offline

Download a zip from the releases page, copy it to the printer and run:

```bash
bash install.sh --zip oznlab_klipperui.zip
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/ozancs/oznlab_klipperui/main/install.sh | bash -s -- --uninstall
```

This removes the files, the nginx site and the update manager section. Your settings stay in the Moonraker database.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/?host=<printer-host>` to connect the dev server to a printer. `?host=` with an empty value switches back to same origin. Moonraker has to allow the dev address in `cors_domains`.

Build a release zip with `bash scripts/pack.sh`. Pushing a `v*` tag builds the zip on GitHub and attaches it to a release.
