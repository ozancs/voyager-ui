# Changelog

## 0.15.1

- Sidebar footer shows when a new Voyager UI version is available; clicking it opens the Machine page at the update row
- Pages opened by deep link or reload no longer fail with "not connected" before the socket is up (Update Manager stuck on "Loading…")
- README: shorter, beginner-friendly install steps, update section with screenshot

## 0.15.0

Bug sweep over the whole code base. Fixed:

- Settings: a change made while Moonraker was unreachable, or right before a reload, is no longer thrown away by the next load from the database; a fresh Moonraker database is seeded from the browser copy instead of defaults; the carry-over from the old names can no longer overwrite newer settings
- Language and login token from the old names are picked up on the first load after the rename
- Klipper restart: init no longer runs twice at once (double subscribe, console wiped, temperature history loaded twice)
- A malformed link (`#/files/100%`) no longer leaves a blank page
- Update notifications are refreshed instead of piling up; the "heater reached" sound no longer plays on page load
- Dashboard: the print layout is no longer silently copied from the idle layout on the first print, cards hidden on the idle dashboard stay hidden while printing, window resizes no longer save settings, Customize from Ctrl+K has a working Undo / Cancel
- Console: scroll-to-bottom and the unseen counter keep working after 600 lines; screw tilt results pop up on a re-run
- Number fields: an emptied field no longer sends 0 (or 1%) to Klipper; the heater pop-up no longer turns the heater off on an empty Set, and the typed target is not carried over to the next heater
- Tiles: showing a device hidden from the old device list takes one click; the pop-up of tiles on the right opens to the left
- Esc closes only the topmost dialog; nested modals no longer close their parent
- File names with `#`, `%` or spaces work for downloads, thumbnails and nested config files
- Config editor: Ctrl+S saves the current text after coming back from another page (not the text from before), opening a second file while the first is loading no longer shows the wrong text under the wrong name, closing the last tab reopens printer.cfg, Klipper's own backups moved to backups/ show up in the Backups menu, backup names use local time and keep the folder, inline `#` comments in macros are no longer counted as Jinja, absolute includes are not flagged
- Installer: never removes a git checkout with the old name, handles `listen 0.0.0.0:8000` and IPv6 listen lines, `--port N` on an installed instance keeps N, uninstall completes when nginx is stopped; release_info.json names the asset so multi printer sections update too

## 0.14.7

- Coming back to the dashboard no longer reopens Customize after it was closed with Done
- Ctrl+K: hits inside files need the typed text to be in the line; the loose letter matching stays for macros and commands only

## 0.14.6

- Toolhead, extruder, limits and retraction cards: content is spread evenly under the header when the card is taller than needed, instead of sitting at the bottom

## 0.14.5

- Top tiles can be put anywhere, the grouping by kind only applies until you reorder them

## 0.14.4

- Top tiles: dragging is simpler and sturdier. The tile follows the pointer, the tile under it is outlined, on release it takes that slot and the group slides into place. Nothing moves while the pointer is down, which is what broke the drag in Opera / Chrome

## 0.14.3

- Interface size defaults to 100% (Auto is still there in Appearance)
- A long printer name slides back and forth in the top bar instead of being cut off; the DEMO badge is gone
- Customize: the Add card menu is no longer hidden behind the tiles
- Demo: realistic config files for the editor and Ctrl+K, a tidier tile strip, every card on the dashboard

## 0.14.2

- Live demo: `npm run build:demo` builds the UI with a fake Moonraker running in the page (simulated print, temperatures, console, files, config, MMU). Published on GitHub Pages from main. A DEMO badge sits next to the logo

## 0.14.1

- Security: the `?host=` parameter is honoured by the dev server only. A release build always talks to the host the page came from, so a crafted link can no longer point the UI (and its Moonraker token or login) at another server. Found with Anthropic's claude-code-security-review

## 0.14.0

- New name: Voyager UI, with the amber probe logo. Settings, favorites and layouts from the old names (oznlab_klipperui, carbon-ui) are carried over on first start; the installer removes the old nginx sites and update_manager entries and keeps the port
- Install folder is `~/voyager-ui`, the Moonraker update_manager section is `[update_manager voyager-ui]`

## 0.13.1

- Favorites star and the accent hairlines around the favorites bar and the tiles are gone; the extra spacing under the tiles stays

## 0.13.0

- Interface settings are a dialog now (gear in the top bar, or the side menu), with categories: General, Dashboard, Control, Presets, Console, Appearance, Sounds, Phone notifications, Webcams, Mainsail / Fluidd, Backup. The separate settings page is gone
- Control settings: jog speeds for XY and Z, step presets for the axis buttons, the arrow pad and Z-Offset, extrusion amount and speed presets. The toolhead and extruder cards use them
- Shared settings are mirrored into the Mainsail and Fluidd database when they change (printer name, language, jog and extrusion presets, temperature presets) and taken over from there on first start. Can be turned off, or imported again by hand
- Webcams can be added, edited and removed here; the list is Moonraker's, so it is the same in Mainsail and Fluidd
- Customize moved from the tiles row to the top bar, next to the settings gear
- Favorites bar has its own slightly lighter band, more room between the tiles and the cards
- A card that is only a little too small for its content shrinks the content (up to 25%) instead of showing a scrollbar

## 0.12.3

- Machine page shows the detailed system loads again (version, load, frequency, temperature, network bandwidth); the compact tiles stay on the dashboard card
- Health page: the summary header and status tiles are gone, open issues are listed in one line above the cards
- Config editor: search hits are tinted and underlined, the current hit gets a ring, the text stays readable
- Pop-ups (presets, notifications, power, add card) close on a tap outside, also on touch screens; pop-ups inside dashboard cards are no longer clipped by the card
- Phone layout: top bar keeps state and progress without overlapping, file tables scroll sideways instead of squashing names, tooltips no longer stick after a tap
- Search panel of the editor fully translated; several Turkish strings that were still English
- Activity indicator no longer stays on "loading" if a request never answers

## 0.12.2

- One look only (Panel), the Classic style is gone
- Calibration page removed. Probe paper tests, bed screws and screws tilt still open as dialogs when the command runs
- Fan, heater and light pop-ups on the top tiles open above the cards below

## 0.12.1

- Power devices from Moonraker ([power]: smart plugs, relays) in the power menu, on a dashboard card and in Ctrl+K. Turning one off while printing asks first, devices locked while printing cannot be switched
- Phone notifications: set up Telegram, Discord, ntfy, Pushover or any Apprise URL from Interface settings. Written to moonraker.conf after a backup, sent by Moonraker so they arrive with the browser closed. Optional webcam snapshot
- Esc closes dialogs

## 0.12.0

- Config editor rebuilt on CodeMirror: Klipper syntax colours (sections, options, pins, G-code and Jinja in macros), file tree, tabs, search and replace, go to line, folding of sections, comment toggle, suggestions for sections, options and G-code commands
- Config checks while typing: options outside a section, repeated options, missing include files, unbalanced `{% if %}` / `{% for %}` in macros, Klipper's deprecated option warnings and startup errors on the right line
- Compare the editor with the saved file or with any backup, and load a backup back into the editor
- Link to the Klipper documentation for the section under the cursor
- MMU card for Happy Hare and Box Turtle (AFC), added to the dashboard by itself when an MMU is found
- Moonraker login screen for printers with `force_logins` or outside `trusted_clients`
- Webcams: WebRTC (camera-streamer, go2rtc, MediaMTX), HLS, plain video and iframe next to MJPEG; a message with what to check when no picture arrives
- 14 languages: English, German, Spanish, French, Italian, Dutch, Polish, Portuguese (Brazil), Turkish, Russian, Ukrainian, Chinese (simplified), Japanese, Korean. Languages load on demand
- Automatic tests for the config checks and the translations
- License: GPL-3.0

## 0.11.0

- Health page reports only clear faults: sustained CAN retransmits, invalid bytes, TMC over temperature and shorts. Heater power guesses removed
- Ctrl+K asks for a second Enter before heating, moving or running a macro
- Ctrl+K can search inside .py, .sh and .txt files (can be turned off)
- QGL button on Voron 2.4, Z Tilt on printers with z_tilt, hidden otherwise
- Design: quieter favorites, accent colour only for actions, card colours follow meaning, top tiles grouped by kind with balanced rows, cards spread their content, clearer disabled buttons, better contrast, bigger touch targets, fewer monospace labels

## 0.10.x

- Installer: system check, finds every printer on the host, Moonraker port detection, free port per printer, trusted_clients check, webcam ports from crowsnest, rollback of nginx changes on failure
- Smart finish time learned from past prints
- Open on phone (QR code)
- Interface scales with the screen so a laptop shows the same layout as a 1920 px monitor

## 0.9.x

- Panel look: filling instrument tiles, wide numerals, coloured card name plates
- Scroll to bottom button in the console
- Drag and drop upload and multi select download / delete in the file managers

## 0.8.x

- Dashboard auto scroll while dragging cards
- Light theme, more icons, card colours, compact system loads
