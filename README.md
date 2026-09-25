<p align="center"><img src="public/logo.svg" width="96" alt=""></p>

# Voyager UI

A web interface for Klipper printers, running next to Mainsail or Fluidd on its own port. It talks to Moonraker like any other client, so nothing in Klipper changes.

Status: early and tested on one printer (CoreXY, Raspberry Pi 4, Klipper + Moonraker installed with KIAUH). Expect rough edges.

## Features

- dashboard with cards you can drag, resize, hide and add (custom command and macro buttons included)
- favorites bar for macros and commands, with icons and autocomplete
- temperatures, fans, LEDs, filament sensors and Spoolman in one strip
- console, webcam, 3d heightmap, g-code viewer, file manager, print history
- config editor: Klipper syntax colours, file tree and tabs, search and replace, folding, suggestions, checks while typing (repeated options, missing includes, unbalanced macro blocks, Klipper warnings), compare with the saved file or a backup, docs link per section. A backup copy is made before every save
- machine page with system load and update manager
- MMU card for Happy Hare and Box Turtle (AFC), shown by itself when one is found
- webcams: MJPEG, WebRTC (camera-streamer, go2rtc, MediaMTX), HLS
- Moonraker login when the printer asks for one
- power devices (smart plugs, relays) and phone notifications (Telegram, Discord, ntfy, Pushover) through Moonraker
- health page: MCU and CAN link errors, heater power and stability, TMC driver flags, host throttling
- maintenance reminders based on print hours, with a due date estimated from recent printing
- search everything with Ctrl+K: pages, macros, commands, g-code files, settings and config options (opens the file at the line)
- dialogs for macro prompts (`action:prompt_*`), manual probe (PROBE_CALIBRATE and friends), BED_SCREWS_ADJUST and SCREWS_TILT_CALCULATE
- job queue panel next to the file list
- optional separate dashboard layout while printing
- Klipper errors as pop-ups with a short hint, optional sounds for print finished, paused and errors
- dashboard cards for macros (with parameters), devices, recent files, recent prints, Spoolman, firmware retraction and health
- quick commands in the search box: `chamber 40`, `bed off`, `fan 50`, `speed 120`, `z offset -0.05`, `home xy`, preset names. Checked against max_temp, homing and axis limits before they run
- 14 languages (English, German, Spanish, French, Italian, Dutch, Polish, Portuguese, Turkish, Russian, Ukrainian, Chinese, Japanese, Korean), with a short setup on first start. Translations other than English and Turkish were made with AI help, corrections are welcome
- settings are stored in the Moonraker database and can be exported as a file

## Requirements

- Klipper and Moonraker
- nginx (already there if you installed Mainsail or Fluidd)
- a free port, 8000 by default

## Install

Run on the printer host over SSH:

```bash
curl -fsSL https://raw.githubusercontent.com/ozancs/voyager-ui/main/install.sh | bash
```

Then open `http://<printer-host>:8000`. Mainsail or Fluidd keeps working on port 80. If port 8000 is taken, the installer says what is using it and offers the next free port. Updates keep the port you picked.

To use another port:

```bash
curl -fsSL https://raw.githubusercontent.com/ozancs/voyager-ui/main/install.sh | bash -s -- --port 8001
```

The installer first runs a system check (OS, sudo, nginx, python3, disk space, Moonraker) and stops with a clear message if something is missing. To only run the check and change nothing:

```bash
curl -fsSL https://raw.githubusercontent.com/ozancs/voyager-ui/main/install.sh | bash -s -- --check
```

Then it:

1. finds every printer on the host (`printer_data`, `printer_data_2`, `<name>_data` ...) and asks which ones to install for
2. finds each Moonraker port, and asks when it cannot
3. picks a free web port for each printer, starting at 8000
4. copies the release to `~/voyager-ui` (other printers get `~/voyager-ui-<folder>`)
5. adds an nginx site per printer, with webcam ports read from `crowsnest.conf`
6. checks that Moonraker trusts your network (`trusted_clients`) and offers to add it, keeping a backup of `moonraker.conf`
7. adds this section to `moonraker.conf` so updates show up in the update manager:

```ini
[update_manager voyager-ui]
type: web
channel: stable
repo: ozancs/voyager-ui
path: ~/voyager-ui
```

Other options: `--printer printer_data_2` (or `all`), `--moonraker-port 7126`, `--yes` to take every suggested answer.

Not supported yet: Creality K1 / K1 Max, Sonic Pad and other OpenWrt based hosts, Moonraker with `force_logins` turned on.

Use `--no-updater` to skip step 7.

## Update

Use the update manager in this UI, Mainsail or Fluidd. Running the install command again also works.

## Roll back or install offline

Download a zip from the releases page, copy it to the printer and run:

```bash
bash install.sh --zip voyager-ui.zip
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/ozancs/voyager-ui/main/install.sh | bash -s -- --uninstall
```

This removes the files, the nginx site and the update manager section. Your settings stay in the Moonraker database.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/?host=<printer-host>` to connect the dev server to a printer. `?host=` with an empty value switches back to same origin. Moonraker has to allow the dev address in `cors_domains`.

Build a release zip with `bash scripts/pack.sh`. Pushing a `v*` tag builds the zip on GitHub and attaches it to a release.

## License

GPL-3.0. See [LICENSE](LICENSE).
