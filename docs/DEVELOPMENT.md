# Developing Second Team

How the app is built and run from source. Project rules for contributors (and AI assistants) are in [CLAUDE.md](../CLAUDE.md); the plan is in [SPEC.md](SPEC.md) and [PROGRESS.md](PROGRESS.md).

## Requirements
- Windows 11
- [Node.js](https://nodejs.org) LTS (v22 or newer)
- Git (for version history)

## Run it
**Easiest:** double-click `start.bat` in the project folder.

- On the first run it installs the libraries the app needs. This takes a minute or two.
- It reinstalls them automatically whenever `package.json` or `package-lock.json` changes, for example after a milestone adds a new library.
- Then it opens the app. Closing the app window also closes the console window.

**From a terminal** (PowerShell, in the project folder):

```
npm install
npm run dev
```

While `npm run dev` is running, most UI edits show up in the window instantly.

## Other commands
| Command | What it does |
|---|---|
| `npm test` | Runs the automated checks (undo/redo, grouping, saving, camera and lighting maths, render passes, prompts, workflows, model licences) |
| `node scripts/fetch-backend.mjs` | Downloads/repairs the AI engine and models (about 18 GB) |
| `npm run typecheck` | Checks the code for type errors without running it |
| `npm run build` | Typecheck, then build the app into `out/` |
| `npm start` | Run the built app from `out/` (no live reload) |
| `npm run dist` | Build the Windows installer into `release/` |
| `npm run dist:mac` | Build the Mac .dmg (on a Mac; normally done by GitHub Actions) |

## Mac (Apple Silicon)
The Mac version is the whole app except the AI engine (*coming soon* on Mac; AI takes made on a PC still show in shared projects). Install it and the controls on a Mac: [MAC.md](MAC.md).

- It's built by GitHub Actions (`.github/workflows/mac.yml`) on GitHub's Mac machines, since Apple only allows building Mac apps on a Mac. Every push to `main` that changes the app (or **Actions → Mac build → Run workflow**) makes `Second Team <version> (Apple Silicon).dmg`, under that run's **Artifacts** (kept 30 days). On a private repo, Mac build minutes count 10× against the free allowance (about 25 builds a month).
- It isn't notarized by Apple (no paid developer account yet), so the first launch of each version needs **System Settings → Privacy & Security → Open Anyway**.
- On a Mac, settings and libraries live in `~/Library/Application Support/SecondTeam`; **Cmd** replaces Ctrl for clicks and shortcuts, **Option** replaces Alt, trackpad controls are the default, and Delete deletes.
- To try the Mac behaviour on a PC (development only): start the dev app with `SECONDTEAM_PLATFORM=mac`.

## Project layout
```
src/main/       Electron main process: the window, files, and the managed ComfyUI (backend/)
backend/        manifest.json (pinned AI engine + model downloads, with licences) and workflow templates
scripts/        fetch-backend.mjs (downloads the AI engine and models)
src/preload/    The safe bridge between the UI and the main process
src/renderer/   The React + three.js UI (state/, viewport/, panels/)
src/shared/     The project file format, used by both sides
figures/        Human figure data (MakeHuman, see figures/README.md)
docs/           User guide, spec, progress tracker, Mac guide
```
