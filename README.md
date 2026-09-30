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
| `npm test` | Runs the automated checks (undo/redo, grouping, saving, units) |
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
- Each scene has **shots**: frame something up in the viewport, then click **＋ Add shot** at the bottom of the **Shot list**. Shots are named after the scene: 1A, 1B, 1C… (I and O are skipped, like on a slate). Every shot has its own camera; cameras don't appear in the Outliner. **Drag shots in the Shot list to reorder them**; shot names always follow the list order, so reordering or deleting renames them (delete 1B and 1C becomes 1B). The Shot list shows a live thumbnail of each shot. Click a shot to edit it, double-click to look through it.
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

## A scene's set and per-shot changes
- Each scene has its own **set**, which every shot in it starts from. The top row of the Shot list (e.g. "Scene 01") edits it; clicking a shot (or looking through its camera) edits *that shot's version* instead. A banner over the viewport always says which (the viewport gets an orange frame while you're in a shot).
- In a shot, moving, rotating, resizing, posing, recolouring or hiding something changes it **for that shot only**. Everything you haven't changed in a shot keeps following the scene's set. **Delete** in a shot only hides the object there; delete in the scene's set removes it everywhere. New objects always go into the scene's set.
- A new camera made while a shot is active starts from that shot's version; one made from the scene's set starts clean.
- Select a changed object to see **Changed in Shot 3: position, pose**, with **Revert to master** (drop this shot's change) and **Push to master** (make it the Master version). Changed objects show a clapperboard badge in the Outliner.

## Projects
A project is a folder called `Name.secondteam` containing `project.json` (the set, in plain readable JSON) and folders for reference images, renders and exports. To open one, choose that folder in the Open dialog. The project's name is the folder's name.

## Project layout
```
src/main/       Electron main process: the window, and later ComfyUI management
src/preload/    The safe bridge between the UI and the main process
src/renderer/   The React + three.js UI (state/, viewport/, panels/)
src/shared/     The project file format, used by both sides
docs/           Spec and progress tracker
```
