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

In the Properties panel, type values and press Enter. Lengths accept either unit system whatever the display is set to, e.g. `2.5`, `150cm`, `6' 2"` or `6ft 2in`.

## Figures (posable mannequins)
- **Add → Figure** puts a mannequin on the floor. Click it once to select the whole figure: move and rotate it with the gizmo, and set **Height** (0.9–2.1 m; short figures get child proportions) and **Build** in Properties.
- With the figure selected, **click a body part** to pose the joint that moves it (forearm → elbow, thigh → hip, head → head…). Drag the rings, or type angles in Properties. Hold **Ctrl** for 15° steps. **Esc** or clicking empty space goes back to the whole figure.
- **Presets**: Standing, Walking, Sitting, Pointing, Arms crossed, Looking over shoulder, Lying down. **Mirror L↔R** swaps sides. **Reset pose** returns to standing.
- **Saved poses**: name the current pose and **Save to project** (travels with the project folder) or **Save to library** (on this PC, available in every project). Saved poses appear in the preset menu and in the Saved poses list, where you can apply them to any figure, copy between project and library, or delete them. Poses scale to each figure's height.
- **Joint limits** (on by default) keep joints in natural ranges. Turn them off for a figure to cheat a pose for the lens.
- The pelvis joint also has a **Hip offset** for lowering the body (sitting, lying down).

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
