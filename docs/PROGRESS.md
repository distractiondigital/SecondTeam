# Second Team — Progress

| # | Milestone | Status | Notes |
|---|---|---|---|
| 0 | Scaffold | ✅ Done (tested by Spencer 2026-09-29) | Electron window with an R3F viewport, a metre grid, orbit controls and an axis gizmo. `start.bat` launcher. |
| 1 | Set building | ⬜ | |
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

## Ideas / later
-
