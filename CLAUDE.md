# Second Team

A local Windows desktop app for film previs. You greybox a set (primitives, posable mannequins, lights), place real cameras, link objects and characters to reference images, then generate AI frames through a managed local ComfyUI backend and assemble a storyboard.

**Full spec: `docs/SPEC.md`. Read it before planning any milestone.**
**Progress tracker: `docs/PROGRESS.md`.** Update it at the end of every milestone.

## Stack
Electron + React + TypeScript + Vite · three.js via react-three-fiber + drei · Zustand · ComfyUI (Windows portable) over its HTTP/WebSocket API · electron-builder.

## About the user
- Spencer is a filmmaker/DP and experienced PC builder, but **new to software development**. This is his first app.
- Explain what you're doing in plain language, and briefly define any jargon.
- When a step needs him (installing something, testing, deciding), say exactly what to click or type.
- He tests by using the app, not by reading code. End every milestone with a short **"How to test this"** checklist.

## How we work
1. **One milestone at a time** (see the table in SPEC §6). Don't start the next one until he confirms the current one works.
2. Start each milestone in plan mode: propose the approach, list the files you'll create, and flag any decision he needs to make.
3. **Don't add features that aren't in the spec** without asking. Put ideas in the "Ideas / later" section of PROGRESS.md instead.
4. Commit to Git at the end of each working milestone, with a clear message.
5. If something in the spec seems wrong or there's a clearly better approach, say so and explain why before changing course.
6. Keep the app runnable. Never leave it in a broken state at the end of a session.

## Hard rules
- **Local only.** No cloud AI APIs and no telemetry. The only network calls allowed are downloading the backend and models from the pinned manifest.
- **Model licences matter.** He uses outputs for paying clients. Every model in `backend/manifest.json` records its licence. Never add a non-commercial model (e.g. FLUX.2 klein 9B, FLUX.1 dev) without flagging it clearly.
- Don't copy GPL code (e.g. from Krita AI Diffusion) into the project without asking first. Studying it for ideas is fine.
- Windows paths, and handle spaces in paths.
- Never write outside the project folder, the chosen backend install folder, or `%LOCALAPPDATA%\SecondTeam`.

## Commands
- Install dependencies: `npm install` (`start.bat` does this automatically when `package.json` or `package-lock.json` is newer than `node_modules\.install-stamp`)
- Run in dev: `npm run dev`, or double-click `start.bat`
- Typecheck: `npm run typecheck`
- Build: `npm run build` (typecheck + electron-vite build into `out/`)
- Installer: `npm run dist` (electron-builder NSIS into `release/`; not validated until M9)
- Layout: `src/main` (Electron main), `src/preload` (IPC bridge, typed in `src/preload/api.d.ts`), `src/renderer` (React + R3F UI). Scene units: 1 unit = 1 metre, Y up.
- Electron 44 downloads its binary lazily on first run (no postinstall). npm 11's allow-scripts warnings about esbuild and electron-winstaller are harmless.
