# Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/?host=<printer>` to point the dev server at a printer. Moonraker needs the dev address in `cors_domains`. `?host=` only works in the dev server; a release build connects to the address it was loaded from, or to a printer picked from the printer list.

| Command | What it does |
| --- | --- |
| `npm test` | runs the tests |
| `npm run format:check` | checks the code style (`npm run format` fixes it) |
| `npm run build:demo` | builds the live demo: the UI plus a fake Moonraker in `src/demo/mock.js`. GitHub Pages serves it from every push to main |
| `bash scripts/pack.sh` | builds the release zip |

Pushing a `v*` tag makes a GitHub release.

## Reading the code

[ARCHITECTURE.md](ARCHITECTURE.md) explains how the pieces fit together and what writes to the printer. [CODE_MAP.md](CODE_MAP.md) lists every source file with what it does. Every file starts with a comment saying the same, and the code is formatted with Prettier so it reads the same everywhere.
