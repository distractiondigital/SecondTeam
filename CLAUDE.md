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
- Tests: `npm test` (Vitest; store/undo, grouping, save round-trip, units)
- Typecheck: `npm run typecheck`
- Build: `npm run build` (typecheck + electron-vite build into `out/`)
- AI backend (dev): `node scripts/fetch-backend.mjs` downloads ComfyUI portable + the models from `backend/manifest.json` into `ComfyUI\` (git-ignored), resuming and SHA256-checking. Add a model = add a manifest entry with its licence (`commercial: true` is enforced by a test).
- Installer: `npm run dist` (electron-builder NSIS into `release/`; not validated until M9)
- Layout: `src/main` (Electron main; `projectFiles.ts` = save/open IPC), `src/preload` (IPC bridge, typed in `src/preload/api.d.ts`), `src/shared` (project.json schema, primitives), `src/renderer/src` (`state/` Zustand stores + actions, `viewport/`, `panels/`). Scene units: 1 unit = 1 metre, rotations stored in degrees, Y up.
- Document store (`state/documentStore.ts`) is the only place that changes the project; every change is an undo step (gizmo drags batched with `beginGesture`/`endGesture`). UI-only state lives in `state/uiStore.ts`.
- `electron-vite dev` hot-reloads the UI but not `src/main` or `src/preload`: restart the app after changing those. Its file watcher sometimes misses rapid edits (you get a stale module, e.g. "X is not defined" although typecheck passes); restart the dev server when that happens.
- Figures: skeleton, proportions, limits and presets live in `src/shared/mannequin.ts` (pure, tested). `viewport/MannequinView.tsx` renders them; joint groups are named `<id>:<joint>`; `viewport/JointGizmo.tsx` poses them.
- Cameras: maths in `src/shared/camera.ts` (pure, tested); `viewport/CameraView.tsx` (body/frustum), `viewport/LookThrough.tsx` (camera view + fly controls), `panels/FrameOverlay.tsx` (frame/HUD), `viewport/ShotTracker.tsx` (readouts + thumbnails via `viewport/renderShot.ts`). Mark any viewport-only object with `userData.helper = true` so it stays out of renders.
- Scenes & shots: a project has numbered scenes (`Scene.number`, optional title); shots are camera nodes named 1A, 1B… (`nextShotName` in `src/shared/camera.ts`); the camera body/format is project-wide (`project.camera`, read with `opticsFor(kit, focalLength)`); only lens/focus/placement are per shot. Cameras are hidden from the Outliner and never grouped.
- Master scene + per-shot overrides: `src/shared/overrides.ts` (merge rules). In the store, every edit goes through `edit()` → `write()`, which turns per-shot fields into the active shot's overrides. UI code must read nodes via `editedNodes(s)` (the shot being edited) or `sceneForShot(s, id)`, never raw `activeScene(s).nodes`, unless it deliberately wants Master. `viewport/ShotScenes.tsx` keeps a hidden per-shot copy of the set for thumbnails/renders.
- Lights: maths and the lighting phrase in `src/shared/lighting.ts` (pure, tested); `viewport/LightView.tsx` draws the three.js light (only in Clay shading) and its helper icon. Clay uses each object's own colour ("Material" in the UI, `color` in the file).
- Environment: `src/shared/environment.ts` (time of day 0-24 h → sky/fill colours, labels, prompt phrase; pure, tested). `Scene.environment`, per-shot `CameraNode.environment` (null = the scene's); read with `environmentFor(state, shotId)`, change with `setEnvironment` / `setShotOwnEnvironment`. `viewport/EnvironmentView.tsx` sets the sky as `scene.background` (so passes' `onBlack` clears it) plus a hemisphere fill; `RenderFloor` takes the ground colour. Clay viewport with lights shows the floor instead of the grid. The time phrase starts `ShotInfo.lighting` (`viewport/shotInfo.ts`).
- Render passes: pure maths in `src/shared/passes.ts` (SDXL size, COCO-18 keypoints, depth curve, ID legend; tested); `viewport/renderPasses.ts` renders them from the hidden per-shot scenes by swapping mesh materials (skips helpers and `userData.grid`; `userData.floor` is the automatic floor, `userData.workLight` the Work lights); `state/passes.ts` renders + saves (IPC `passes:write` in `src/main/passFiles.ts`) and drives `panels/PassViewer.tsx`. `viewport/RendererHandle.tsx` exposes the WebGL renderer outside the canvas. Colours for raw passes: don't go through `three.Color` (it converts to linear); write bytes directly.
- Testing over CDP: `import('/src/...')` from the page can return a *different* module instance than the app's after HMR updates (Vite adds `?t=` to changed modules). Drive UI state through the DOM (click the real buttons) or reload the page first.
- Generation (M6): main process only (`src/main/backend/`): `comfyProcess.ts` spawns the portable ComfyUI hidden on a free port (log in `%LOCALAPPDATA%\SecondTeam\logs\comfyui.log`, pid file to kill leftovers after a dev reload), `comfyClient.ts` (HTTP + WebSocket), `workflow.ts` fills `backend/workflows/*.json` `{{placeholders}}`, `generation.ts` (`GenerationBackend` + ComfyBackend), `takeFiles.ts` (takes on disk, never in project.json). Renderer: `state/generation.ts`, `panels/TakeStrip.tsx`, `TakeViewer.tsx`, `GenerateSection.tsx`, `BackendStatus.tsx`. Types shared in `src/shared/takes.ts`; prompt + settings maths in `src/shared/prompt.ts`.
- Continuity (M7): `project.cast` / `project.props` (`CastMember`, `Prop` in `shared/project.ts`), linked by `MannequinNode.castId` and `PrimitiveNode`/`GroupNode.propId`, or an object's own `description`. `shared/passes.ts` `entityKey` / `idLegend` decide each mesh's region (nearest linked or described node upward). Generation composes `backend/workflows/sdxl-continuity.json` with the per-entity fragments in `backend/workflows/fragments/` (`composeWorkflow` in `src/main/backend/workflow.ts`; fragment node ids are `<prefix>.<id>`, `{{in:x}}` placeholders are links). Reference images live in the project (`assets\cast|props\<id>\`, `assets\style\`), copied in by `src/main/assetFiles.ts`. UI: `panels/CastProps.tsx` (tabs, lists, EntityProperties, LinkSection), `panels/ReferenceImages.tsx`. Circle take = `CameraNode.circleTake`.
- Storyboard (M8): `project.board.order` (own order across scenes; `boardShots` in `src/shared/board.ts` merges it with the live shots), `CameraNode.boardText` (null = use `description`) and `dialogue`; store actions `setBoardOrder`, `updatePanel`. UI: `uiStore.view` ('set' | 'board'), `panels/BoardView.tsx`, `panels/BoardExport.tsx`; the Set workspace stays mounted (hidden) while the board shows. Board AI | Clay (`uiStore.boardImage`): while the board shows, `ShotScenes` builds hidden copies for every scene's shots (`sceneOfShot` finds a shot's own scene; `sceneForShot` uses it) and `ShotTracker` renders them into `uiStore.boardClay` (`viewport/boardClay.ts`; Clay exports render at 1920 px and send PNG data URLs in `BoardExportSpec.clayImages`). PDF = `src/shared/boardHtml.ts` (pure, tested) printed by a hidden window in `src/main/boardExport.ts` (`printToPDF`); exports go to `<project>\exports\`.
- Files use LF line endings (enforced by `.gitattributes`). After scripted multi-file find/replace edits, grep to confirm they landed; prefer the Edit tool for anything with non-ASCII characters.
- To drive the dev app in tests: `npx electron-vite dev --remoteDebuggingPort 9222`, then use the Chrome DevTools Protocol.
- Editing files from Windows PowerShell 5: always pass `-Encoding UTF8` to `Get-Content`, or non-ASCII characters (·, ’, °) get corrupted.
- Electron 44 downloads its binary lazily on first run (no postinstall). npm 11's allow-scripts warnings about esbuild and electron-winstaller are harmless.
