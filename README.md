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
| `npm test` | Runs the automated checks (undo/redo, grouping, saving, camera and lighting maths, render passes, prompts, workflows, model licences) |
| `node scripts/fetch-backend.mjs` | Downloads/repairs the AI engine and models (about 18 GB) |
| `npm run typecheck` | Checks the code for type errors without running it |
| `npm run build` | Typecheck, then build the app into `out/` |
| `npm start` | Run the built app from `out/` (no live reload) |
| `npm run dist` | Build a Windows installer into `release/` (set up properly in Milestone 9) |

## Viewport controls (Blender-style)
- **Middle-drag:** orbit
- **Shift + middle-drag:** pan
- **Scroll:** zoom
- **Left-click:** select. **Ctrl/Shift + click** adds to the selection. Clicking empty space clears it.
- Clicking an object inside a group selects the whole group. **Double-click** selects just that object.

The grid is in real-world units. In metres: faint lines every 1 m, stronger every 10 m. In feet: every 1 ft and 10 ft.

## Keyboard shortcuts
| Key | Action |
|---|---|
| W / E / R | Move / rotate / scale gizmo |
| Shift+Tab | Cycle snap mode: Off → Grid (0.1 m or ½ ft, 15°, 0.1× scale) → Surface (sides click flush against the floor and nearby objects) |
| Hold Ctrl while dragging | Temporarily flip grid snapping on or off |
| F | Frame the selection (or everything) |
| Ctrl+D | Duplicate |
| Del or X | Delete |
| Ctrl+G / Ctrl+Shift+G | Group / ungroup |
| H | Hide / show |
| F2 | Rename |
| Esc | Deselect |
| Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) | Undo / redo |
| Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S | New / open / save / save as |

**Anchor** (Properties): Bottom / Middle / Top sets the point an object scales and rotates around, and its position is that point. With Bottom (the default), making something taller keeps it on the floor. Planes are always centred.

In the Properties panel, **drag left/right on any number box** to change it (hold Shift for fine steps, Ctrl for big ones; one drag is one undo step), or click it to type a value and press Enter. Lengths accept either unit system whatever the display is set to, e.g. `2.5`, `150cm`, `6' 2"` or `6ft 2in`.

## Figures (posable mannequins)
- **Add → Figure** puts a mannequin on the floor. Click it once to select the whole figure: move and rotate it with the gizmo, and set **Height** (0.9–2.1 m; short figures get child proportions; hold Ctrl while dragging the slider for whole inches in feet mode, or whole centimetres) and **Build** in Properties.
- With the figure selected, **click a body part** to pose the joint that moves it (forearm → elbow, thigh → hip, head → head…). Drag the rings, or type angles in Properties. Hold **Ctrl** for 15° steps. **Esc** or clicking empty space goes back to the whole figure.
- **Presets**: Standing, Walking, Sitting, Pointing, Arms crossed, Looking over shoulder, Lying down. **Mirror L↔R** swaps sides. **Reset pose** returns to standing.
- **Saved poses**: name the current pose and **Save to project** (travels with the project folder) or **Save to library** (on this PC, available in every project). Saved poses appear in the preset menu and in the Saved poses list, where you can apply them to any figure, copy between project and library, or delete them. Poses scale to each figure's height.
- **Joint limits** (on by default) keep joints in natural ranges. Turn them off for a figure to cheat a pose for the lens.
- The pelvis joint also has a **Hip offset** for lowering the body (sitting, lying down).

## Cameras & shots
- A project has **scenes** (Scene 01, Scene 02…). Pick, add, duplicate (same set, no shots), rename (number + title, e.g. "INT. KITCHEN – NIGHT") or delete scenes from the scene picker at the top of the Outliner.
- Each scene has **shots**: frame something up in the viewport, then click **＋ Add shot** at the bottom of the **Shot list**. Shots are named after the scene: 1A, 1B, 1C… (I and O are skipped, like on a slate). Every shot has its own camera; cameras don't appear in the Outliner. **Drag shots in the Shot list to reorder them**; shot names always follow the list order, so reordering or deleting renames them (delete 1B and 1C becomes 1B). The Shot list shows a live thumbnail of each shot. Click a shot to edit it (if it has a circle take, that opens in the take viewer; Esc closes it), double-click to look through it.
- **Numpad 0** or **`** (the key left of 1), or the eye button in the toolbar, looks through the selected camera. **Esc**, `, Numpad 0 or the **Exit camera view** button take you back. In camera view:

| Control | Action |
|---|---|
| Hold right mouse | Look around (pan / tilt) |
| + W A S D | Move level (dolly / truck) |
| + Space / C or Left Ctrl | Up / down |
| + Shift | Move faster |
| + Scroll | Fly speed |
| Q / E | Roll the horizon (Dutch) |
| Ctrl+Q or Ctrl+E | Level the horizon |
| Scroll | Dolly in / out |
| Ctrl+scroll | Zoom (focal length); or type it in the HUD box |
| ← / → | Previous / next shot |

  Let go of the right mouse button to get the cursor back and click or move things in the set while framed up. Each right-button session (everything you do while holding it) is one undo step.
- **Shot properties**: focal length, focus distance, pan/tilt/roll, the shot's subject, and notes.
- **Camera body (whole project)**, below that: sensor (Super 35, Full Frame, Blackmagic PYXIS 12K, ARRI ALEXA 35, Custom), anamorphic squeeze (1.0–2.0), **frame guides** (16:9, 1.85, 2:1, 2.35, 2.39, 4:3, 1:1, 9:16, 4:5, custom), the **delivery frame** (what gets rendered later) and rule of thirds. These are the same for every shot in the project.
- The HUD and Shot list show camera height, tilt, distance to the subject, and the **shot size and angle** (e.g. "Medium close-up · Slight high angle"), worked out from the nearest figure in frame. Override them in Properties if you like.

## Lights & clay
- **Lights** (toolbar): **Sun** (daylight from one direction; only its angle matters), **Point** (a bare bulb), **Spot** (a beam) and **Ambient** (soft even fill from the sky). Aim sun and spot with the rotate gizmo (E) or Pan/Tilt in Properties.
- Light Properties: **intensity in stops** (0 = a standard key, +1 = twice as bright), **colour temperature** in Kelvin (with Candle / Tungsten / Daylight / Overcast / Shade presets), **softness** (hard to soft shadows), casts shadows, and for spots the cone angle and beam edge. Point and spot lights fall off with distance like real ones.
- **Work / Clay** (toolbar): Work shows object colours under even light; **Clay** shows every surface in matte grey, lit only by your lights, with shadows. Looking through a camera switches to Clay automatically (and back when you leave, if you were in Work).
- Each shot gets an automatic **lighting description** (e.g. "Soft key light from camera left, rim light from behind, warm tungsten, high contrast"), shown in the camera HUD and the shot's Properties, where you can overwrite it. It will go into the AI prompt.
- Lights work with per-shot changes, so you can cheat a light for one setup. Shot list thumbnails show each shot lit.

## AI frames (Generate)
**One-time setup** (downloads about 21 GB into the `ComfyUI` folder here; Git ignores it):

```
node scripts/fetch-backend.mjs
```

It downloads ComfyUI (the local AI engine) and the models listed in `backend/manifest.json`, checks every file's checksum, and can be re-run to resume. Every model's licence is recorded there; all of them allow commercial use:

| Model | Look | Licence |
|---|---|---|
| RealVisXL V5.0 | Photoreal film stills | OpenRAIL++-M |
| SDXL 1.0 (stock) | Most versatile across art styles (sketches, paintings, fantasy art) | OpenRAIL++-M |
| ControlNet Union SDXL ProMax | Makes the image follow your set (depth) and figures (pose) | Apache-2.0 |
| IP-Adapter Plus SDXL + CLIP ViT-H encoder | Reference images for cast, props and style | Apache-2.0 |
| ComfyUI_IPAdapter_plus (add-on inside ComfyUI) | Runs the reference images | GPL-3.0 (runs inside ComfyUI; not part of Second Team's code) |

**Using it**
- The app starts the AI engine by itself in the background. The **AI** light at the right of the take strip shows *Starting…* then *Ready* (click it for the log or a restart). It's closed when you quit.
- Select a shot and write its **Frame description** in Properties (what's in the frame). The **Prompt** below it shows the shot's prompt: your description, the shot size and angle, the lens, the lighting and the project style. (Which way each figure faces goes into that figure's own prompt.)
- Press **Generate** (in Properties or the take strip). The shot's passes are rendered: the **depth** pass (softened) guides the shapes of the set, and the **pose** pass guides how the figures stand and which way they face, and each take appears in the **take strip** under the viewport with a live preview while it's made. **Cancel** stops it.
- Takes are always in order: newest on the left, oldest on the right. To delete one, hover it and click the **bin** (top-left), or press **Del** in the take viewer; it goes to the Windows **Recycle Bin**, so you can still restore it from there.
- Click a take to see it large (← / → to flip, Esc to close) with its seed and settings. **Use this seed** locks the seed so you can change one thing and compare.
- **Generation (whole project)**, below the camera body in a shot's Properties: **Model**, **Style** (e.g. *moody 16mm film still* or *pencil sketchbook drawing*; save a style you like with the **disk** button under it as a named **preset**, and load presets from the list in any project; a preset remembers the model it was made with), **Strictness** (how closely the set's shapes are followed, from *Loose* to *Traces blocking*), **Takes** per Generate, **Seed** (locked = the same seed each time; unlocked = random), and **Advanced**: steps, CFG, the depth guide's strength/start/end, the pose guide's strength/end, and the negative prompt.
- The project must be saved: takes are stored in it as `scenes\<scene id>\shots\<shot id>\takes\` (the PNG, a thumbnail, and a `.json` with the seed, prompt, model and licence, and every setting).

## Cast, props and continuity
Keep characters and story objects looking the same from shot to shot.

- The left column has three tabs: **Outliner | Cast | Props**. In **Cast** or **Props**, click **＋ New**, then fill it in on the right:
  - **Description**: how it looks, e.g. *young woman in her 20s, curly dark hair, olive raincoat*. It becomes that one's own prompt, applied only to its part of the frame. Describe the look, not the name.
  - **Reference images** (up to 4, PNG or JPEG): photos or drawings of how it should look. Add files with the image button, or **paste** (the clipboard button, or **Ctrl+V** while the cast member or prop is open): an image copied from a browser or a screenshot tool, or image files copied in Explorer. They're copied into the project (`assets\cast\…`, `assets\props\…`) and guide only its part of the frame.
  - **Reference strength**, and for cast a **viewport colour** (linked figures wear it).
  - **Linked to** lists every figure or object that is this one, in every scene.
- **Linking:** select a figure → Properties → **Cast** → pick one (or *New cast member…*). Select an object or a group → **Prop**. A whole group can be one prop (a car built from boxes). Something that isn't a cast member or prop can still get its own **Description** (e.g. *a rusty oil drum*).
- The **Object ID** pass now has one colour per cast member, prop and described object (two figures of the same character share a colour).
- **Style reference** (Generation, whole project): images that set the look of every shot (a film still, an artbook page, a sketch), with a Subtle ↔ Strong slider. It works alongside the Style text. At higher strengths it can override details that come only from text; characters with their own reference images hold up best.
- **How the prompts are split:** the **Frame description** applies only to the parts of the frame that aren't a cast member, prop or described object. Each of those gets its own prompt instead: its description, which way *that* figure faces, plus the shot size, lens, lighting and style. So one character's words can't land on another.
- **Figures and depth:** the depth pass guides the **set and props** (so what's behind whom stays right), while each **figure's own area gets only a weak, heavily softened version of it** (how far away they are, so props stay in front of or behind them): figures are shaped by their pose skeleton, their own prompt and references, never by the mannequin's ball joints. A figure that isn't a cast member gets its own area too, as *a person*.
- **Advanced → Cast & props:** **Feather** (how soft each one's edge is) and **End** (when references stop guiding). If a look leaks across an edge, raise Feather or lower End.
- **Good references:** at least a few hundred pixels tall, showing what should carry over (a full-length outfit shot, a face close-up; several are combined, keeping each one's detail). Make the description agree with them: if the photo shows a cloak and vest, don't write "sweater".
- **Circle takes:** click the ☆ on a take (or *Circle this take* in the take viewer). One per shot; it keeps its place in the strip (marked with a filled star and an orange border) and becomes the shot's thumbnail in the Shot list. The Storyboard uses it. Ctrl+Z undoes it.
- Takes with cast and props take longer (about 30 s instead of 7), because each one's part of the frame is worked out separately. At most 6 cast members/props with reference images are used per take; the strip says who was left out.

## Storyboard
Turn the circle takes into a board you can send to a client or crew.

- Click **Board** in the **Set | Board** switch at the top. Every shot in the project appears as a panel: its circle take, the shot (1A) with its scene, and lens · shot size · angle. Shots without a circle take show a grey "No circle take yet" panel, so the board doubles as a shot plan. **Set** takes you back where you were.
- Each panel has three boxes: **Description** (starts as the shot's Frame description; change it here and the AI prompt stays as it was), **Dialogue** (printed in quotes) and **Notes** (the shot's notes). They save when you click away; Ctrl+Z undoes them.
- **AI | Clay** (top right of the board) switches every panel between its circle take and the shot's live clay render (the same lit grey view as the Shot list thumbnail, from every scene). Exports always use the circle takes.
- **Drag** a panel by its grip (⋮⋮) to reorder. The board has its own order across all scenes (intercut freely), and shot names never change. New shots join the end.
- **Double-click** a panel's picture to jump to that shot in the Set view, with its circle take open.
- **Export…**:
  - **Layout:** Grid 2 / 3 / 6 (landscape pages, captions under each frame) or Rows 2 / 3 / 4 (portrait pages, picture left, captions right). A small sketch of one page under the buttons shows how the chosen layout will look.
  - **Page size** (Letter or A4), **Title** (the project name), an optional **Footer** (e.g. *Distraction Digital · v1 · not for distribution*), and whether to include shots without a circle take.
  - **Export PDF** makes `exports\Storyboard <date time> Grid 3.pdf` in the project folder; **Export PNGs** copies the full-size circle takes into `exports\Storyboard <date time> PNGs\001 - 1A.png …` in board order. **Open** / **Show in folder** afterwards. Exporting twice never overwrites: the second gets "(2)".
  - Very long captions are trimmed with "…" in the PDF so they never run into the next panel.

## Render passes
The images the AI will work from (Milestone 6), rendered from a shot's camera through its delivery frame:
- Select a shot and click **Render passes** in its Properties. The **pass viewer** opens over the viewport:
  - **Clay**: the lit grey set.
  - **Depth**: near is white, far is black.
  - **Normals**: which way each surface faces (blue/lilac faces the lens).
  - **Object ID**: a flat colour per object or figure, with a legend.
  - **Pose**: an OpenPose skeleton of each figure.
- Flip between them with **← / →** or **1–5**; **Esc** closes. **Re-render** after changing the shot.
- The size is set automatically for the AI model (SDXL): about one megapixel in the delivery frame's shape, e.g. 1536 × 640 for 2.39.
- If the project is saved, the passes are also written into it: `scenes\<scene id>\shots\<shot id>\passes\` (five PNGs plus `passes.json`). **Show in folder** opens it.
- Renders and Shot list thumbnails include an automatic endless floor at ground level. Turn it off per scene with **Floor in renders** in the scene menu (top of the Outliner), e.g. for a rooftop or when you've built your own ground.

## A scene's set and per-shot changes
- Each scene has its own **set**, which every shot in it starts from. The top row of the Shot list (e.g. "Scene 01") edits it; clicking a shot (or looking through its camera) edits *that shot's version* instead. A banner over the viewport always says which (the viewport gets an orange frame while you're in a shot).
- In a shot, moving, rotating, resizing, posing, recolouring or hiding something changes it **for that shot only**. Everything you haven't changed in a shot keeps following the scene's set. **Delete** in a shot only hides the object there; delete in the scene's set removes it everywhere. New objects always go into the scene's set.
- A new camera made while a shot is active starts from that shot's version; one made from the scene's set starts clean.
- Select a changed object to see **Changed in Shot 3: position, pose**, with **Revert to master** (drop this shot's change) and **Push to master** (make it the Master version). Changed objects show a clapperboard badge in the Outliner.

## Projects
A project is a folder called `Name.secondteam` containing `project.json` (the set, in plain readable JSON) and folders for reference images, renders and exports. To open one, choose that folder in the Open dialog. The project's name is the folder's name.

## Project layout
```
src/main/       Electron main process: the window, files, and the managed ComfyUI (backend/)
backend/        manifest.json (pinned AI engine + model downloads, with licences) and workflow templates
scripts/        fetch-backend.mjs (downloads the AI engine and models)
src/preload/    The safe bridge between the UI and the main process
src/renderer/   The React + three.js UI (state/, viewport/, panels/)
src/shared/     The project file format, used by both sides
docs/           Spec and progress tracker
```
