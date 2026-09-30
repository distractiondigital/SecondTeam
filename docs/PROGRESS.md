# Second Team — Progress

| # | Milestone | Status | Notes |
|---|---|---|---|
| 0 | Scaffold | ✅ Done (tested by Spencer 2026-09-29) | Electron window with an R3F viewport, a metre grid, orbit controls and an axis gizmo. `start.bat` launcher. |
| 1 | Set building | ✅ Done (tested by Spencer 2026-09-29) | Six primitives; gizmo with snapping; outliner (tree, rename, hide, lock); properties with real-size fields; m/ft; group/duplicate/delete; full undo/redo; save/open `.secondteam` folders; unsaved-changes prompts. Snap modes (Off/Grid/Surface, Ctrl to flip), anchors. 23 automated tests. |
| 2 | Mannequins | ✅ Done (tested by Spencer 2026-09-29) | 17-joint FK figure; click a body part to pose; realistic limits (toggle per figure); 7 presets + mirror; height (child→adult proportions) and build. Follow-up: user pose presets (project + app library), 42 automated tests. |
| 3 | Cameras & shot list | ✅ Done (tested by Spencer 2026-09-29) | Shot cameras from the current view; camera view with game-style fly controls; sensors incl. PYXIS 12K / ALEXA 35; squeeze; frame guides + delivery frame; HUD readouts; shot size/angle; shot list with live thumbnails. 56 automated tests. |
| 4 | Lights & clay render | ⬜ | |
| 5 | Render passes | ⬜ | |
| 6 | First AI frames | ⬜ | |
| 7 | Continuity | ⬜ | |
| 8 | Storyboard | ⬜ | |
| 9 | Plug-and-play | ⬜ | |
| 10 | Polish | ⬜ | Includes **Posing 2** (Spencer, 2026-09-29): IK hands/feet, head look-at target that flows subtly into the torso, choosing which end of a limb stays put (e.g. plant a foot). |

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

- 2026-09-29 (M2): Figures are a new node type; project.json is now **schema v2** (v1 files still open; older builds refuse v2 files instead of misreading them).
- 2026-09-29 (M2): Posing = click the figure, then click a body part (Spencer's choice). Realistic joint limits on every joint, with a per-figure "Joint limits" checkbox to cheat poses (Spencer's choice + the toggle). The pelvis is free because it's the whole-body orientation.
- 2026-09-29 (M2): Joint angles are XYZ Euler degrees in a shared frame (figure faces +Z, left = +X). Mirroring = swap sides and negate Y/Z.
- 2026-09-29 (M2): The hip offset is stored as a fraction of height, so a sitting or lying figure stays correct when its height changes.
- 2026-09-29 (M2): The head carries invisible nose/eye/ear marker points (`<id>:kp:*`) for the M5 OpenPose render.

- 2026-09-29 (M2 follow-up): Saved poses live in both places (Spencer's choice): per project in `project.json` (`poses`, undoable) and an app-wide library in `%LOCALAPPDATA%\SecondTeam\poses.json` (saved immediately, not undoable). Poses store the hip offset relative to height, so they fit any figure.
- 2026-09-29: IK / look-at / anchor-end posing are scheduled for M10 Polish (Spencer's choice) as one "Posing 2" piece sharing a single solver.

- 2026-09-29 (M3): Cameras are scene nodes (schema **v3**), so move/rotate, outliner, undo, duplicate and save all apply. The rotation is stored like every node; pan/tilt/roll are converted for display.
- 2026-09-29 (M3): Camera view uses Spencer's game-style controls (right-mouse look + WASD, Space/C, Q/E roll, Ctrl+Q/E level, scroll dolly, Ctrl+scroll zoom). The letter keys only fly the camera in camera view; mouse-look only while the right button is held, so left-click still selects.
- 2026-09-29 (M3): New cameras default to Full Frame 35 mm showing the full sensor (Spencer). Frame guides are overlays; one is marked the **delivery frame**, which is what M5/M6 render. Squeeze widens the de-squeezed image (sensor width × squeeze).
- 2026-09-29 (M3): Sensor sizes checked: PYXIS 12K 36 × 23.56 mm (12,288 × 8,040 photosites), ALEXA 35 27.99 × 19.22 mm open gate.
- 2026-09-29 (M3): Shot size is based on how much of the subject figure's height the frame covers at its distance; angle on tilt plus lens height vs. eye height. Thresholds live in `src/shared/camera.ts`.
- 2026-09-29 (M3): `viewport/renderShot.ts` renders any camera's delivery frame without helpers (thumbnails now, render passes in M5).

- 2026-09-29 (M3 feedback): Undo steps now have owners (`beginGesture(owner)`/`endGesture(owner)`); only the starter can close one and overlapping ones merge, so one right-button camera session = one undo step. Left Ctrl also moves down; Esc / ` / an Exit button leave camera view (no numpad needed).
- 2026-09-29 (M3 feedback): **Master scene + per-shot changes** (Spencer's design). Each camera stores its shot's overrides (schema **v4**); everything visual can differ per shot (transform, size, anchor, pose, height, build, colour, visibility, limits); structure, names and locks are Master-only. The Shot list sets the active shot; edits in a shot become overrides, new shots copy the active shot's overrides, delete-in-shot hides, and there are Revert / Push to master buttons. Every shot has a hidden copy of the set (R3F portal) used for its thumbnail, readouts and (M5) render passes.

- 2026-09-29 (M3 feedback): **Scenes & shots** (Spencer): a project has numbered scenes (picker at the top of the Outliner: new / duplicate-set / rename / delete); each scene's set is what we called Master; shots are named 1A, 1B… (I and O skipped) and added from the Shot list (＋ Add shot); cameras belong to shots and are hidden from the Outliner and never grouped. **One camera body per project** (sensor, squeeze, guides, delivery frame, thirds in `project.camera`); lens, focus, placement per shot. Schema **v5**; v4 files convert (kit from the first shot, numeric shots renamed 1A…).
- 2026-09-29 (M3 feedback): Number boxes can be dragged to scrub values (Shift fine, Ctrl coarse; pointer lock so drags don't stop at the screen edge; one drag = one undo step). Shots can be dragged to reorder; shot names always follow list order (reorder and delete rename them), so the shot name is no longer editable by hand.

## Ideas / later
- Shoot order: a separate order for the shooting schedule that doesn't rename shots (Spencer).
- Fly controls (right-mouse + WASD) in the free view too.
- Show other cameras' positions in camera view as small markers (currently hidden for a clean frame).
- Drag-reorder in the shot list, independent of shot number.

- Hands and fingers (fist, open, pointing) and costume/prop attachments on figures.
- More pose presets (running, kneeling, leaning on a wall, crouching), plus saving your own.
- Scene switcher / multiple scenes in the UI (the data model already supports them).
- Recent-projects list on startup.
- Gizmo on a multi-selection without grouping first.
- Box (drag) select in the viewport; Shift-click range select in the outliner.
- Drag-and-drop reordering/reparenting in the outliner.
- New objects are all placed at the view centre, so they can overlap; maybe offset them if the spot is taken.
- Drag-to-scrub on number fields.
