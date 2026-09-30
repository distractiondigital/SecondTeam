# Second Team — Progress

| # | Milestone | Status | Notes |
|---|---|---|---|
| 0 | Scaffold | ✅ Done (tested by Spencer 2026-09-29) | Electron window with an R3F viewport, a metre grid, orbit controls and an axis gizmo. `start.bat` launcher. |
| 1 | Set building | 🟨 Built, awaiting Spencer's test | Six primitives; gizmo with snapping; outliner (tree, rename, hide, lock); properties with real-size fields; m/ft; group/duplicate/delete; full undo/redo; save/open `.secondteam` folders; unsaved-changes prompts. 14 automated tests. |
| 2 | Mannequins | ⬜ | |
| 3 | Cameras & shot list | ⬜ | |
| 4 | Lights & clay render | ⬜ | |
| 5 | Render passes | ⬜ | |
| 6 | First AI frames | ⬜ | |
| 7 | Continuity | ⬜ | |
| 8 | Storyboard | ⬜ | |
| 9 | Plug-and-play | ⬜ | |
| 10 | Polish | ⬜ | |

## Decisions log
- 2026-09-29: Name "Second Team" (working title). Stack: Electron + React + three.js (R3F) + managed ComfyUI. SDXL first for ControlNet/IP-Adapter maturity and commercial licence.
- 2026-09-29 (M0): Build tool is **electron-vite** (v5, with Vite 7, because electron-vite 5 doesn't support Vite 8 yet). Also: Electron 44, React 19, three 0.186, R3F 9, drei 10, TypeScript 5.9.
- 2026-09-29 (M0): The renderer is sandboxed (`contextIsolation`, no `nodeIntegration`, `sandbox: true`), and its Content-Security-Policy blocks all outside network access. **From M6, all ComfyUI HTTP/WebSocket traffic goes through the main process**, and the renderer reaches it only over IPC via the preload bridge. That way the CSP stays strict. Nothing is built for this yet.
- 2026-09-29 (M1): **Blender-style navigation** (Spencer's choice): middle-drag orbit, Shift+middle-drag pan, scroll zoom, left-click select.
- 2026-09-29 (M1): Properties show **real size** (W/H/D in m or ft), stored as scale × the primitive's base size (Spencer's choice).
- 2026-09-29 (M1): Electron's cache/settings moved to `%LOCALAPPDATA%\SecondTeam\app-data` (default was `%APPDATA%`, which breaks the hard rule). The stray M0 folder was deleted.
- 2026-09-29 (M1): Undo keeps whole-project snapshots (immer structural sharing), capped at 200 steps. Selection isn't undoable. A gizmo drag is one step.
- 2026-09-29 (M1): The project name = folder name (`Name.secondteam`). Main only writes into folders picked through a Save/Open dialog this session, and writes atomically (temp file, then rename).
- 2026-09-29 (M1): Clicking an object in a group selects the outermost group; double-click selects the object itself. The gizmo works on one object or group at a time (multi-select → group them first).
- 2026-09-29 (M1): New dependencies: immer (MIT), lucide-react icons (ISC), Vitest (MIT, dev only).

## Ideas / later
- Scene switcher / multiple scenes in the UI (the data model already supports them).
- Recent-projects list on startup.
- Gizmo on a multi-selection without grouping first.
- Box (drag) select in the viewport; Shift-click range select in the outliner.
- Drag-and-drop reordering/reparenting in the outliner.
- New objects are all placed at the view centre, so they can overlap; maybe offset them if the spot is taken.
- Drag-to-scrub on number fields.
