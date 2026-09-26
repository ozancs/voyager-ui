<p align="center"><img src="public/logo.svg" width="96" alt=""></p>

# Voyager UI

A web interface for Klipper printers. Runs next to Mainsail or Fluidd on its own port, talks to Moonraker like any other client, changes nothing in Klipper.

> **Read this first.** The code in this repo was written with AI (Claude). I am a maker, not a frontend developer, and I could not have built this on my own. I designed it, decided what goes where, tested every feature on my printer, sent back everything that looked or felt wrong and had it redone until it was right. There is a mock Moonraker for automated browser tests, unit tests for the config checks and translations, and the code went through a security review. Still, it is one person's printer and one person's taste. Treat it as early software and keep Mainsail installed next to it.
>
> Why it exists: Mainsail is great but it never quite fit how I use my printer, and reading the forums I saw I am not alone. This is my take on it. If a UI like this is something you wanted too, try it, break it, open an issue.

Tested on: a CoreXY with a Raspberry Pi 4, Klipper + Moonraker installed with KIAUH.

## What it does

A dashboard you arrange yourself (drag, resize, hide, colour the cards), a config editor that understands Klipper and checks your files before you save, and Ctrl+K to reach any page, macro, file or setting by typing a few letters.

Reading is boring. Go click around the **[live demo](https://ozancs.github.io/voyager-ui/)** (a simulated printer running in your browser, nothing is real). If it feels right, install it on your printer and try it there.

Video: coming soon.

## Install

You need Klipper, Moonraker and nginx (they are all there if you have Mainsail or Fluidd) and a free port.

Open a terminal (PowerShell on Windows, Terminal on macOS) and connect to your printer over SSH. Use your printer's user name and IP address, the same ones you use for Mainsail:

```bash
ssh pi@192.168.1.xxx
```

Once you are on the printer, run this and answer the questions:

```bash
curl -fsSL https://raw.githubusercontent.com/ozancs/voyager-ui/main/install.sh | bash
```

Then open `http://<printer-ip>:8000` in your browser. Mainsail or Fluidd stays on port 80 as before.

## Update

The installer registers Voyager UI with Moonraker's update manager, so it shows up next to Klipper and Moonraker. When a new version is out, the sidebar footer says so; click it to go to the Machine page, where the Update Manager card has an Update button on the `voyager-ui` row. It also shows up in Mainsail's and Fluidd's update lists.

<p align="center"><img src="docs/update-manager.png" width="560" alt="Update Manager card with an Update button on the voyager-ui row"></p>

If you prefer, running the install command again also updates.

## Several printers

The arrow next to the printer name in the top bar opens the printer list. Add each printer with a nickname and its address, then switch between them from the same page. The address is the printer's IP or hostname, with a port when Moonraker is not behind a web server on port 80 (Moonraker's own port is usually `7125`). This also covers a Moonraker on a non-standard port.

Each printer has to allow the page's address in `moonraker.conf`, otherwise the browser is not let in:

```ini
[authorization]
cors_domains:
    http://192.168.1.10:8000
```

Use the address you open Voyager UI with. The list is kept in the browser, so every browser has its own list. Dashboard layout and other settings stay on each printer.

With more than one printer in the list, the same menu has All printers: one card per printer with its state, progress, temperatures and a camera snapshot.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/?host=<printer>` to point the dev server at a printer (Moonraker needs the dev address in `cors_domains`). This only works in the dev server, a release build always talks to the host it was loaded from. `npm test` runs the tests, `npm run format:check` checks the code style, `bash scripts/pack.sh` builds the release zip, pushing a `v*` tag makes a GitHub release. `npm run build:demo` builds the live demo (the UI plus a fake Moonraker in `src/demo/mock.js`), which GitHub Pages serves from every push to main.

## Reading the code

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the pieces fit together and what writes to the printer. [docs/CODE_MAP.md](docs/CODE_MAP.md) lists every source file with what it does. Every file starts with a comment saying the same, and the code is formatted with Prettier so it reads the same everywhere.

## License

GPL-3.0. See [LICENSE](LICENSE). The extra icons in the icon picker come from [Lucide](https://lucide.dev) (ISC, see [LICENSE-lucide](LICENSE-lucide)).

## For the curious

Everything the UI does, in one list:

- Dashboard with cards you can drag, resize, hide, add and colour. Optional second layout while printing
- Favorites bar for macros and commands
- Temperatures, fans, LEDs, filament sensors and Spoolman in one strip of tiles
- Console, webcam (MJPEG, WebRTC, HLS), heightmap, g-code viewer, file manager, print history, job queue
- Config editor with Klipper syntax colours, search and replace, folding, suggestions, live checks (repeated options, missing includes, unbalanced macro blocks), diff against the saved file or a backup. A backup is made before every save
- Ctrl+K search: pages, macros, files, settings, config options, and quick commands like `bed 60`, `fan 50`, `z offset -0.05`
- Calibrations page with a tab for each kind the printer has: input shaper, PID, probe and Z, bed leveling, motors, other calibration macros, [OznLab Sensor](https://github.com/ozancs/oznlab-sensor) tools, and [Klippain Shake&Tune](https://github.com/Frix-x/klippain-shaketune) when installed (run its tests, compare two graphs side by side, write the chosen shaper to your config)
- Health page: MCU and CAN errors, TMC driver flags, host throttling, maintenance reminders based on print hours, and heaters compared with their own first measurement (holding power, heat-up time, temperature swing)
- Check before printing: material and remaining weight of the active Spoolman spool, nozzle size, temperatures and height against the printer (only what both sides report is compared)
- Common Klipper errors explained in plain words, under the error banner and behind the ? on console error lines
- MMU card for Happy Hare and Box Turtle (AFC)
- Power devices and phone notifications (Telegram, Discord, ntfy, Pushover) through Moonraker
- Dialogs for macro prompts, PROBE_CALIBRATE, BED_SCREWS_ADJUST, SCREWS_TILT_CALCULATE
- Settings dialog like Mainsail's. Printer name, jog steps, extrusion and temperature presets are kept in sync with Mainsail and Fluidd
- Scales to the screen, so a laptop shows the same layout as a big monitor
- 14 languages. Everything except English and Turkish was machine translated, corrections welcome

What the installer does: checks the system first, finds every printer on the host, asks which ones to set up, picks a free port for each, writes an nginx site (webcam ports come from `crowsnest.conf`), checks `trusted_clients` and adds an `[update_manager voyager-ui]` section to `moonraker.conf`. Options:

```
--port 8001              use this port
--printer printer_data_2 only this printer (or: all)
--moonraker-port 7126    if it cannot find it
--check                  only run the system check
--no-updater             skip the update_manager section
--yes                    take every suggested answer
--zip voyager-ui.zip     install from a downloaded release (offline, or to roll back)
--uninstall              remove files, nginx site and update_manager section. Settings stay in the Moonraker database
```

Not supported yet: Creality K1, Sonic Pad and other OpenWrt hosts, Moonraker with `force_logins`.
