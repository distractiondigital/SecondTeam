# Second Team — Progress

| # | Milestone | Status | Notes |
|---|---|---|---|
| 0 | Scaffold | ✅ Done (tested by Spencer 2026-09-29) | Electron window with an R3F viewport, a metre grid, orbit controls and an axis gizmo. `start.bat` launcher. |
| 1 | Set building | ✅ Done (tested by Spencer 2026-09-29) | Six primitives; gizmo with snapping; outliner (tree, rename, hide, lock); properties with real-size fields; m/ft; group/duplicate/delete; full undo/redo; save/open `.secondteam` folders; unsaved-changes prompts. Snap modes (Off/Grid/Surface, Ctrl to flip), anchors. |
| 2 | Mannequins | ✅ Done (tested by Spencer 2026-09-29) | 17-joint FK figure; click a body part to pose; realistic limits (toggle per figure); 7 presets + mirror; height (child→adult proportions) and build. Follow-up: user pose presets (project + app library). |
| 3 | Cameras & shot list | ✅ Done (tested by Spencer 2026-09-29) | Scenes (01, 02…) with shots 1A, 1B…; cameras belong to shots; one camera body per project; camera view with game-style fly controls; frame guides + delivery frame; HUD readouts; shot size/angle; per-shot changes over each scene's set; shot list with live thumbnails, drag to reorder. |
| 4 | Lights & clay render | ✅ Done (tested by Spencer 2026-09-30) | Sun / point / spot / ambient lights (stops, Kelvin, softness, shadows, spot cone); Work/Clay shading with auto Clay in camera view; soft shadows; per-shot light cheats; clay thumbnails; automatic lighting description per shot. |
| 5 | Render passes | ✅ Done (tested by Spencer 2026-09-30) | Clay, depth, normals, object ID and OpenPose passes per shot at the SDXL size (about 1 MP, sides in 64s); saved into the project folder with a `passes.json` sidecar; pass viewer. Automatic floor in renders (per-scene toggle). |
| 6 | First AI frames | ✅ Done (tested by Spencer 2026-09-30) | Managed ComfyUI 0.38 (starts hidden with the app); RealVisXL V5 + SDXL 1.0 + Union ControlNet (depth) from a pinned, licence-checked manifest; depth (softened) + pose guides; prompt from frame description + which way the subject faces + shot size/angle + lens + lighting + style; strictness, takes, seed lock; live previews, cancel; take strip + viewer; takes saved with full sidecars. |
| 7 | Continuity | ⬜ Next | |
| 8 | Storyboard | ⬜ | |
| 9 | Plug-and-play | ⬜ | |
| 10 | Polish | ⬜ | Includes **Posing 2** (Spencer, 2026-09-29): IK hands/feet, head look-at target that flows subtly into the torso, choosing which end of a limb stays put (e.g. plant a foot). |

## Where we are (2026-09-30)
Milestones 0–6 are done and tested. The whole "build the shot" half of the app works:
- Greybox a set with shapes, posed figures and lights.
- Break a project into scenes (01, 02…) and shots (1A, 1B…). Each shot has its own camera and can cheat anything in the set just for that shot.
- Look through any shot with real sensor/lens/squeeze maths, frame guides, and readouts for height, tilt, distance, shot size, angle and lighting.
- Save and reopen projects as `Name.secondteam` folders.
- Render each shot's control images (clay, depth, normals, object ID, pose) and flip through them.
- Generate AI frames for a shot on your own PC and keep every take with its seed and settings.

The AI engine (ComfyUI) lives in the `ComfyUI` folder and is downloaded with `node scripts/fetch-backend.mjs`. There are 113 automated checks (`npm test`), and all pass.

## Things to know
- **Project files:** saved projects are format **v8**. Every older format still opens, but a build from before a format change can't open a newer file.
- **What undo covers:**
  - Undo goes back 200 steps and covers every change to the project, including per-shot changes, lights and deleting a scene.
  - Selection, switching scenes and the saved-pose *library* (the one shared across projects) aren't undoable. Poses saved into a project are.
- **Where things are stored:**
  - Projects go wherever you save them.
  - The app's own data (settings cache and pose library) lives in `%LOCALAPPDATA%\SecondTeam`.
  - Nothing is sent over the network.
- **Grouping and per-shot changes:** group/ungroup always changes the scene's set. If an object already has per-shot moves, those shots can shift after grouping or ungrouping, so group things first and cheat per shot afterwards.
- **Surface snap** uses bounding boxes: exact for sets built square to the grid, approximate for rotated objects.
- **Shot names** follow the Shot List order automatically (reorder or delete renames them). Custom names can't be typed; that comes with "shoot order" later.
- **Light gizmos** point exactly where the light shines, but it's hard to see where a light *lands*. An aim line is on the Ideas list.
- **Thumbnails** show the lit (Clay) look once a scene has at least one light; before that they use the work look. Thumbnails and passes include the automatic floor (the camera view doesn't).
- **Depth pass contrast** is stretched to each frame's own nearest and farthest surface, so two shots of the same set can look different in brightness. That's normal for depth ControlNets.
- **Pose pass** draws joints even when another object hides them.
- **Generating:** the first take after starting loads the model (about 10 s extra); after that a take takes about 7 s at 30 steps on the 5070 Ti. Switching models reloads. Takes live only in the project folder (not in `project.json`), so the project must be saved first.
- **Strictness** controls the depth guide (the shapes of the set): mid-point = strength 0.6 for the first 65% of the steps. Figures are guided by their pose skeletons at any strictness (Advanced → Pose guide). If objects in the set are ignored, slide toward Traces blocking; if everything looks like grey blocks, toward Loose.
- **Updating the app:** if the app is open while I change code, it reloads itself, and unsaved work can be lost. Save and close it before a work session, and restart with `start.bat` afterwards.
- **For development** (in `CLAUDE.md`): files use LF line endings, enforced by `.gitattributes`. Changes to `src/main` or `src/preload` need an app restart.

## What's next
**Milestone 7: Continuity.** Cast and Props with reference images, linked to figures and objects; regional prompts per object (using the ID pass); reference images applied only inside each one's mask (IP-Adapter); pose control from the pose pass; a project style reference image; circle takes. This needs extra models (IP-Adapter + CLIP vision); I'll list them with their licences in the plan.

## Decisions log
- 2026-09-29: Name "Second Team" (working title). Stack: Electron + React + three.js (R3F) + managed ComfyUI. SDXL first for ControlNet/IP-Adapter maturity and commercial licence.
- 2026-09-29 (M0): Build tool is **electron-vite** (v5, with Vite 7, because electron-vite 5 doesn't support Vite 8 yet). Also: Electron 44, React 19, three 0.186, R3F 9, drei 10, TypeScript 5.9.
- 2026-09-29 (M0): The renderer is sandboxed (`contextIsolation`, no `nodeIntegration`, `sandbox: true`), and its Content-Security-Policy blocks all outside network access. **From M6, all ComfyUI HTTP/WebSocket traffic goes through the main process**, and the renderer reaches it only over IPC via the preload bridge. That way the CSP stays strict.
- 2026-09-29 (M1): **Blender-style navigation** (Spencer's choice): middle-drag orbit, Shift+middle-drag pan, scroll zoom, left-click select.
- 2026-09-29 (M1): Properties show **real size** (W/H/D in m or ft), stored as scale × the primitive's base size (Spencer's choice).
- 2026-09-29 (M1): Electron's cache/settings moved to `%LOCALAPPDATA%\SecondTeam\app-data` (default was `%APPDATA%`, which breaks the hard rule). The stray M0 folder was deleted.
- 2026-09-29 (M1): Undo keeps whole-project snapshots (immer structural sharing), capped at 200 steps. Selection isn't undoable. A gizmo drag is one step.
- 2026-09-29 (M1): The project name = folder name (`Name.secondteam`). Main only writes into folders picked through a Save/Open dialog this session, and writes atomically (temp file, then rename).
- 2026-09-29 (M1): Clicking an object in a group selects the outermost group; double-click selects the object itself. The gizmo works on one object or group at a time (multi-select → group them first).
- 2026-09-29 (M1): New dependencies: immer (MIT), lucide-react icons (ISC), Vitest (MIT, dev only).
- 2026-09-29 (M1 feedback): Snap is a mode (Off / Grid / Surface), and holding Ctrl during a drag flips grid snapping (Blender-style). Snapped rotation locks to whole 15° increments, so a stray rotation snaps back onto the grid. Surface = contact snap on bounding boxes within 15 cm, move gizmo only (Spencer's choice).
- 2026-09-29 (M1 feedback): Primitives have an anchor (bottom/center/top) that sets their origin; changing it keeps the object in place. Planes stay centre-only (Spencer's choice; build walls from thin boxes).
- 2026-09-29 (M1 bug): A plane whose hidden height scale reached 0 couldn't be clicked. Scales are clamped to at least 0.001 everywhere, and planes don't show the vertical scale handle.
- 2026-09-29 (M2): Figures are a node type (schema **v2**).
- 2026-09-29 (M2): Posing = click the figure, then click a body part (Spencer's choice). Realistic joint limits on every joint, with a per-figure "Joint limits" checkbox to cheat poses. The pelvis is free because it's the whole-body orientation.
- 2026-09-29 (M2): Joint angles are XYZ Euler degrees in a shared frame (figure faces +Z, left = +X). Mirroring = swap sides and negate Y/Z. The hip offset is stored as a fraction of height, so poses fit any figure.
- 2026-09-29 (M2): The head carries invisible nose/eye/ear marker points (`<id>:kp:*`) for the M5 OpenPose render.
- 2026-09-29 (M2 follow-up): Saved poses live in both places (Spencer's choice): per project in `project.json` (undoable) and an app-wide library in `%LOCALAPPDATA%\SecondTeam\poses.json` (saved immediately, not undoable).
- 2026-09-29: IK / look-at / anchor-end posing are scheduled for M10 Polish (Spencer's choice) as one "Posing 2" piece sharing a single solver.
- 2026-09-29 (M3): Cameras are scene nodes (schema **v3**). The rotation is stored like every node; pan/tilt/roll are converted for display.
- 2026-09-29 (M3): Camera view uses Spencer's game-style controls (right-mouse look + WASD, Space up, C or Left Ctrl down, Q/E roll, Ctrl+Q/E level, scroll dolly, Ctrl+scroll zoom). Letter keys only fly the camera in camera view; mouse-look only while the right button is held, so left-click still selects. Enter/leave with ` or Numpad 0; Esc and an Exit button also leave.
- 2026-09-29 (M3): Frame guides are overlays; one is the **delivery frame**, which is what M5/M6 render. Squeeze widens the de-squeezed image (sensor width × squeeze). Sensor sizes checked: PYXIS 12K 36 × 23.56 mm, ALEXA 35 27.99 × 19.22 mm open gate.
- 2026-09-29 (M3): Shot size is based on how much of the subject figure's height the frame covers at its distance; angle on tilt plus lens height vs. eye height. Thresholds in `src/shared/camera.ts`.
- 2026-09-29 (M3 feedback): Undo steps have owners (`beginGesture(owner)`/`endGesture(owner)`); only the starter can close one and overlapping ones merge, so one right-button camera session = one undo step.
- 2026-09-29 (M3 feedback): **Scene set + per-shot changes** (Spencer's design). Each camera stores its shot's overrides (schema **v4**); everything visual can differ per shot; structure, names and locks are set-only. Edits in the active shot become overrides, new shots copy the active shot's overrides, delete-in-shot hides, and there are Revert / Push buttons. Every shot has a hidden copy of the set (R3F portal) used for its thumbnail, readouts and (M5) render passes.
- 2026-09-29 (M3 feedback): **Scenes & shots** (Spencer): numbered scenes (picker at the top of the Outliner); shots named 1A, 1B… (I and O skipped), added from the Shot list; cameras belong to shots, hidden from the Outliner and never grouped. **One camera body per project** (`project.camera`); lens, focus and placement per shot. Schema **v5**.
- 2026-09-29 (M3 feedback): Number boxes can be dragged to scrub values (Shift fine, Ctrl coarse; one drag = one undo step). Shots can be dragged to reorder; shot names follow list order. Ctrl on the figure Height slider snaps to whole inches (ft) or centimetres (m).
- 2026-09-30 (M4): Lights are scene nodes (schema **v6**) with an extra **Ambient** type beyond the spec's sun/point/spot. Brightness in **stops** (Spencer): 0 = standard key (2.5 three.js units at the subject; point/spot reach that at 2 m with inverse-square falloff). Colour temperature via a blackbody fit (`src/shared/lighting.ts`).
- 2026-09-30 (M4): **Work / Clay** shading (Spencer): Clay = uniform matte grey (#b5b5b5), scene lights only, variance shadow maps (per-light softness = blur radius); camera view switches to Clay automatically and back only if it did the switching. No lights → dim fill plus a note.
- 2026-09-30 (M4): Lighting description = key light (most light on the subject) described relative to the camera, hard/soft, warm/cool, rim from behind, contrast from key:fill in stops. Overridable per shot.
- 2026-09-30 (M5): Pass size is automatic (Spencer): the SDXL size for the delivery frame, ≈1 MP with both sides multiples of 64 (16:9 → 1344 × 768, 2.39 → 1536 × 640, full frame 3:2 → 1280 × 832). M6 generates at the same size.
- 2026-09-30 (M5): **Automatic floor** in renders and thumbnails (Spencer): an endless floor 2 mm below ground, per-scene "Floor in renders" toggle in the scene menu, on by default (schema **v7**, `scene.floor`).
- 2026-09-30 (M5): Depth pass = inverse depth (disparity) stretched to the frame's nearest/farthest surface (MiDaS / Depth Anything convention the depth ControlNets are trained on); empty = black. Normals = camera space, R right, G up, B toward the lens. ID = one flat colour per visible top-level object/group/figure, black background, legend in `passes.json` (switches to Cast/Prop in M7). Pose = OpenPose COCO-18 drawn like controlnet_aux (limbs at 60% colour, 4 px at 512 px, scaled); face points dropped when the head faces away, far ear/eye dropped in profile, off-frame points dropped.
- 2026-09-30 (M5): Passes are saved to `scenes/<scene id>/shots/<shot id>/passes/` (internal ids, so renaming shots never orphans files). Main only writes the six known file names, only into an approved project folder, only for plain ids.
- 2026-09-30 (before M6): **ComfyUI lives inside the project folder** (Spencer): `C:\Dev\SecondTeam\ComfyUI\` holds the whole backend (portable Python, ComfyUI, custom nodes, models, outputs). The entire folder is git-ignored, not just the models: it's many GB of downloaded binaries that the pinned manifest can recreate, and GitHub rejects files over 100 MB. `backend/` (manifest + workflow templates) stays in git. Vitest only looks in `src/` so it never runs ComfyUI's own tests. (The M9 installer's default location for end users is still open; the spec says `%LOCALAPPDATA%\SecondTeamackend`, and we'll revisit it then.)
- 2026-09-30 (M6): ComfyUI **portable 0.38.0 (NVIDIA, PyTorch 2.14 + CUDA 13)** in `ComfyUI\`, started by the app (Spencer's choice) hidden on a free localhost port with `--preview-method auto`; killed with its children on quit; a pid file cleans up a leftover after dev reloads.
- 2026-09-30 (M6): Models (Spencer picked RealVisXL + stock SDXL): **RealVisXL V5.0 fp16** (OpenRAIL++-M) and **SDXL 1.0 base** (OpenRAIL++-M) as checkpoints; **xinsir ControlNet Union SDXL ProMax** (Apache-2.0) for depth now and pose/normal/segment in M7. All URLs, sizes and SHA256 pinned in `backend/manifest.json`; a test fails if any model lacks a licence or isn't `commercial: true`. The **M9 wizard will let the user tick which models to download** (Spencer).
- 2026-09-30 (M6): Workflow `backend/workflows/sdxl-depth.json`: core nodes only (no custom nodes): checkpoint → CLIP text → Union ControlNet (type depth, ControlNetApplyAdvanced) → KSampler dpmpp_2m/karras → PreviewImage (temp; the app copies the result into the project). One queued prompt per take, seeds seed, seed+1…
- 2026-09-30 (M6): Prompt = frame description (new per-shot field) + shot size, angle + lens (+ "anamorphic" at ≥1.3× squeeze) + lighting phrase + project style text. Strictness 0–1 → strength 0.35–0.9 and end 0.4–1.0 (editing those by hand = Custom). Defaults: 30 steps, CFG 5, 2 takes. Settings are project-wide in `project.generation` (schema **v8**).
- 2026-09-30 (M6): Takes live on disk only (`takes\<date-time-id>.png/.json/.thumb.jpg`), listed by the main process; not in project.json (circle takes in M7 will reference them). The AI status light sits in the take strip header (the top bar had no room).
- 2026-09-30 (M6 feedback): Spencer's takes traced the mannequin's ball joints and showed figures from behind. Depth alone can't tell front from back. Fix: **pose control moved forward from M7**: the pose pass guides the figures (Union ControlNet type openpose, strength 0.7 for 80% of the steps; skipped when no figure is in frame), the depth pass is **softened** before use (Gaussian blur ≈ width/185 px) and the strictness range lowered (strength 0.35–0.85, end 0.4–0.9; old projects follow the new mapping automatically). The prompt also says which way the subject figure faces ("facing the camera", "in profile, facing camera left"…), measured from its chest. Tested on Spencer's shot: text alone didn't turn the figure around; the pose guide did.
- 2026-09-30: The repo keeps LF line endings in the working copy (`.gitattributes`); mixed endings had been making some scripted edits silently miss.

## Ideas / later
- Takes: delete / hide a take, compare two takes side by side, sharper live previews (TAESD preview models, MIT licence, ~10 MB).
- Pose pass: leave out joints hidden behind other objects (like a real OpenPose detection); hands (OpenPose hand keypoints) once figures have hands.
- Pass viewer: overlay the pose on the clay render; render passes for every shot in a scene at once.
- Show where a light lands: an aim line from sun/spot to the surface it hits, and the spot's footprint (Spencer: hard to judge aim from the short cone icon).
- Light gels / colours beyond colour temperature; practical lights (lamps) as props that emit light; area / soft-box lights, flags and bounce.
- Shoot order: a separate order for the shooting schedule that doesn't rename shots, plus custom shot names (Spencer).
- Fly controls (right-mouse + WASD) in the free view too.
- Show other cameras' positions in camera view as small markers (currently hidden for a clean frame).
- Hands and fingers (fist, open, pointing) and costume/prop attachments on figures.
- More pose presets (running, kneeling, leaning on a wall, crouching).
- Recent-projects list on startup.
- Gizmo on a multi-selection without grouping first.
- Box (drag) select in the viewport; Shift-click range select in the outliner.
- Drag-and-drop reordering/reparenting in the outliner.
- New objects are all placed at the view centre, so they can overlap; maybe offset them if the spot is taken.
