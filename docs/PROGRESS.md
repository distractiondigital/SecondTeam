# Second Team — Progress

| # | Milestone | Status | Notes |
|---|---|---|---|
| 0 | Scaffold | ✅ Done (tested by Spencer 2026-09-29) | Electron window with an R3F viewport, a metre grid, orbit controls and an axis gizmo. `start.bat` launcher. |
| 1 | Set building | ✅ Done (tested by Spencer 2026-09-29) | Six primitives; gizmo with snapping; outliner (tree, rename, hide, lock); properties with real-size fields; m/ft; group/duplicate/delete; full undo/redo; save/open `.secondteam` folders; unsaved-changes prompts. Snap modes (Off/Grid/Surface, Ctrl to flip), anchors. 23 automated tests. |
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
- 2026-09-29 (M1 feedback): Snap is now a mode (Off / Grid / Surface), and holding Ctrl during a drag flips grid snapping (Blender-style). Snapped rotation locks to whole 15° increments (not 15° steps from the starting angle), so a stray rotation snaps back onto the grid. Surface = contact snap on bounding boxes within 15 cm, move gizmo only (Spencer's choice; exact for square-built sets, approximate for rotated ones).
- 2026-09-29 (M1 feedback): Primitives have an anchor (bottom/center/top) that sets their origin; changing it keeps the object in place. Planes stay centre-only (Spencer's choice; build walls from thin boxes). Stored in project.json as `anchor`; older files load with the old behaviour.
- 2026-09-29 (M1 bug): A plane whose hidden height scale reached 0 couldn't be clicked. Scales are now clamped to at least 0.001 everywhere (gizmo, fields, file load), and planes don't show the vertical scale handle.

## Ideas / later
- Scene switcher / multiple scenes in the UI (the data model already supports them).
- Recent-projects list on startup.
- Gizmo on a multi-selection without grouping first.
- Box (drag) select in the viewport; Shift-click range select in the outliner.
- Drag-and-drop reordering/reparenting in the outliner.
- New objects are all placed at the view centre, so they can overlap; maybe offset them if the spot is taken.
- Drag-to-scrub on number fields.
