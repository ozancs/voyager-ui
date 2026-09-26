# How Voyager UI works

A guide for reading and reviewing the code. For a one-line description of every file see [CODE_MAP.md](CODE_MAP.md).

## The short version

Voyager UI is a static web app (Vue 3, built with Vite). There is no server side code of its own: nginx serves the built files, and everything the page does goes through Moonraker, the same API Mainsail and Fluidd use.

```
browser                                                    printer host
┌──────────────────────────────────────────────┐          ┌───────────────┐
│ components / pages                           │          │               │
│   read  S('extruder').temperature            │          │   Moonraker   │──> Klipper
│   act   gcode('G28'), api.call(...)          │          │               │
│        │                     ▲               │          │               │
│        ▼                     │               │ websocket│               │
│ store.js  state.status, state.settings ...   │◀────────▶│               │
│ api/moonraker.js  JSON-RPC client            │   HTTP   │               │
└──────────────────────────────────────────────┘          └───────────────┘
```

## Where things live

| Folder | What is in it |
| --- | --- |
| `src/store.js` | The reactive app state, the Moonraker connection, settings, shared helpers. Start here. |
| `src/api/moonraker.js` | Websocket JSON-RPC client, login token handling, file URLs. |
| `src/views/` | One file per page (Dashboard, Files, Config editor, Machine...). |
| `src/components/` | Dashboard cards, dialogs, the top bar and side menu, small building blocks. |
| `src/editor/` | The config editor's Klipper language, checks (lint) and doc links. |
| `src/features.js` | Things that run in the background for the whole app: macro prompts, toasts, sounds, health checks. |
| `src/locales/` | Translations, one file per language. |
| `src/demo/mock.js` | A fake Moonraker that runs in the browser, only in the demo build. |
| `tests/` | Unit tests (vitest) for the pure helpers and the translations. |
| `scripts/` | Build and maintenance scripts (release zip, icon subset, translation keys, code map, checks). |

## Data flow

1. `start()` in `store.js` opens the websocket (`api/moonraker.js`), lists the printer objects and subscribes to all of them.
2. Moonraker pushes `notify_status_update`; the store merges it into `state.status`. Components read it through `S('object name')`, so they update on their own.
3. Actions go the other way: `gcode('...')` sends a G-code script, `api.call(method, params)` calls any Moonraker method (files, history, update manager, database...).
4. Console output (`notify_gcode_response`) is collected in `state.console`.

## Settings

- UI settings are one object, `state.settings`, with defaults in `DEFAULT_SETTINGS` (store.js).
- They are saved in the Moonraker database under the `voyager-ui` namespace, so every printer has its own. A copy in localStorage makes the first paint fast before the connection is up.
- `sync.js` can mirror a few settings (printer name, presets, jog steps) to Mainsail's and Fluidd's namespaces when the user turns that on.

## Pages and the dashboard

- `router.js` is a small hash router (`#/files`, `#/config/printer.cfg`). `App.vue` loads each page on first visit and keeps it alive.
- `views/Dashboard.vue` has `MODULES`, the list of every card type with its default and minimum size. To add a card: write the component in `src/components/`, add it to `MODULES`, add its name to the translations.
- The layout is stored in `settings.layout` (and `settings.layoutPrint` for the printing layout). Customize mode edits a copy and saves it on Done; the previous layout is kept as a backup.

## What writes to the printer

Useful to know when reviewing for safety:

- `gcode()` in store.js sends G-code. Most buttons that move, heat or change something end up here; starting a print uses `printer.print.start`.
- Config files are written by the config editor (`views/ConfigEditor.vue`) and the printer settings page (`views/QuickConfig.vue`). Both call `backupBeforeWrite()` first, which saves a timestamped copy next to the file.
- File operations (upload, rename, delete, move) go through Moonraker's file API in `views/Files.vue` and `components/FileBrowser.vue`. Deleting always asks first.
- Updates run through Moonraker's update manager (`views/Machine.vue`), after a confirm dialog.

The page only talks to the host it was loaded from (Moonraker, webcams configured there, and optionally Mainsail's logo files on the same host). Text from the printer is shown as text; the one exception is console lines with Happy Hare's colour markup, which go through `richText.js` and keep only a short allow-list of tags and styles.

## Translations

The English text is the key: `t('Save')`. `scripts/i18n_keys.py` collects every key into `scripts/i18n-keys.json` and lists what a language file is missing (`python3 scripts/i18n_keys.py de`). A test fails when a key is missing in any language.

## Checks

```bash
npm test               # unit tests
npm run format:check   # code style (Prettier)
npm run same-code      # proves a change is formatting only (compares syntax trees and compiled templates)
npm run code-map       # rebuilds docs/CODE_MAP.md from the comments at the top of each file
npm run build:demo     # the demo, a fake printer in the browser, for trying changes without a printer
```

## Where to start reading

1. `src/main.js` and `src/App.vue` for how the app starts and what is on screen.
2. `src/store.js` for the state and the connection.
3. Any card in `src/components/`, for example `LiveZCard.vue` (small) or `ToolheadCard.vue` (bigger), to see how a card reads state and sends G-code.
