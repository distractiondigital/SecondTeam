# Second Team

A local Windows desktop app for film previs. You greybox a set, place real cameras, link characters and props to reference images, generate AI frames with a locally managed ComfyUI, and assemble a storyboard. Everything runs on your own PC.

- Full spec: [docs/SPEC.md](docs/SPEC.md)
- Progress: [docs/PROGRESS.md](docs/PROGRESS.md)

## Requirements
- Windows 11
- [Node.js](https://nodejs.org) LTS (v22 or newer)
- Git (for version history)

## Run it
**Easiest:** double-click `start.bat` in this folder.

- On the first run it installs the libraries the app needs. This takes a minute or two.
- It reinstalls them automatically whenever `package.json` or `package-lock.json` changes, for example after a milestone adds a new library.
- Then it opens the app. Closing the app window also closes the console window.

**From a terminal** (PowerShell, in this folder):

```
npm install
npm run dev
```

While `npm run dev` is running, most UI edits show up in the window instantly.

## Other commands
| Command | What it does |
|---|---|
| `npm run typecheck` | Checks the code for type errors without running it |
| `npm run build` | Typecheck, then build the app into `out/` |
| `npm start` | Run the built app from `out/` (no live reload) |
| `npm run dist` | Build a Windows installer into `release/` (set up properly in Milestone 9) |

## Viewport controls
- **Left-drag:** orbit
- **Right-drag:** pan
- **Scroll:** zoom

The grid is in metres: faint lines every 1 m, stronger lines every 10 m.

## Project layout
```
src/main/       Electron main process: the window, and later ComfyUI management
src/preload/    The safe bridge between the UI and the main process
src/renderer/   The React + three.js UI
docs/           Spec and progress tracker
```
