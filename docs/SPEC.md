# Second Team — Product Spec

> "Second team" is what ADs call the stand-ins. The actual actors are "first team." In this app, grey boxes and mannequins are the stand-ins, and the AI render is first team stepping in.

## 1. What it is

A local Windows desktop app for film previs. You:

1. **Build a rough set** from primitives, posable mannequins, and simple lights (greyboxing).
2. **Place real cameras**: sensor + focal length + aspect ratio. You can have several camera setups per scene (wide, OTS, CU…).
3. **Tell it what everything is**. Each object/character links to a Cast or Prop entry with a description and reference images. The project also has a style reference.
4. **Generate a frame** per camera. The app renders control images from the 3D scene (depth, normals, object-ID mask, pose skeleton) and sends them with the references to a local AI backend. The image comes back into the app.
5. **Assemble and export a storyboard** from the chosen frames.

Everything runs locally on the user's PC. The AI backend is ComfyUI. The app installs and manages it itself, runs it hidden, and the user never opens ComfyUI.

**Target machine:** Windows 11, NVIDIA RTX 5070 Ti (16 GB VRAM). Optimize for this; don't block on other platforms.

**The user is a filmmaker/DP, not a programmer.** Use film language in the UI (shot, setup, take, circle take, lens, sensor, frame lines, blocking).

## 2. Non-goals for v1

- Animation, camera moves, video generation
- macOS/Linux builds
- Cloud AI APIs or any network calls besides downloading the backend/models
- Multi-user or collaboration
- Detailed modeling (no vertex editing). Only primitives, mannequins, and lights.

## 3. Tech stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** + electron-builder | All-TypeScript; Node can easily spawn/manage the ComfyUI process and do large downloads |
| UI | **React + TypeScript + Vite** | |
| 3D | **three.js via react-three-fiber + drei** | TransformControls, camera helpers, and render targets out of the box |
| State | **Zustand** (+ an undo/redo history layer) | |
| AI backend | **ComfyUI (Windows portable build)**, driven via its HTTP + WebSocket API | Talk to it only through the API; the user never sees ComfyUI |
| Storyboard PDF | Generated in-app (e.g. pdf-lib or Electron `printToPDF`) | |

If Claude Code believes a different choice is clearly better, raise it **before** building, with the reason. Don't switch silently.

## 4. Core concepts / data model

The project is saved as a folder: `MyProject.secondteam/`

```
project.json          # schema-versioned, human-readable
assets/cast/<id>/      # reference images per cast member
assets/props/<id>/
assets/style/          # project style reference image(s)
scenes/<sceneId>/shots/<shotId>/passes/   # rendered control images
scenes/<sceneId>/shots/<shotId>/takes/    # generated images + JSON sidecar (seed, prompt, settings)
exports/
```

- **Project**: name, style reference (images + text, e.g. "moody 16mm, green-tinted jungle, practical light"), default aspect ratio, list of Scenes, Cast, Props.
- **Cast member**: name, description text ("Maribel, 20s, curly dark hair, olive rain coat"), 1–N reference images, optional costume variants.
- **Prop**: name, description, reference images.
- **Scene**: set objects, mannequins, lights, cameras, notes.
- **Scene object**: primitive type, transform, colour (viewport only), optional link to a Prop, optional description override.
- **Mannequin**: transform, joint rotations, height/build scale, **link to a Cast member**.
- **Light**: type (directional / point / spot), transform, intensity, colour temp. Adds a lighting phrase to the prompt and shapes the clay render.
- **Camera setup (= Shot)**: shot number (e.g. 12A), transform, sensor preset, focal length (mm), aspect ratio, focus distance (optional), notes. Shot size and angle (e.g. "medium close-up, low angle") are auto-derived for the prompt and can be overridden.
- **Take**: generated image, seed, full settings, timestamp. One take per shot can be marked the **circle take**; the storyboard uses it.

## 5. Features by area

### 5.1 Set building
- Primitives: box, cylinder, sphere, plane, capsule, cone. Add, duplicate, delete, group.
- Move/rotate/scale gizmo, snapping (toggle), ground grid in real-world units (metres and feet toggle).
- Outliner list (rename, hide, lock, select) and a Properties panel.
- Undo/redo for everything. Keyboard shortcuts similar to Blender/Unreal (W/E/R, F to frame selected, Del).

### 5.2 Mannequins
- Jointed human figure built from simple shapes: pelvis, spine, chest, neck, head, shoulders, elbows, wrists, hips, knees, ankles.
- Click a joint to select it and rotate it with a gizmo (forward kinematics is fine for v1).
- Pose presets: standing, walking, sitting, pointing, arms crossed, looking over shoulder, lying down. Mirror pose L/R.
- Height and build sliders (child → adult, slim → broad).
- Each mannequin is linked to a Cast member, and its viewport colour matches that cast colour.

### 5.3 Cameras & shots
- Multiple cameras per scene, listed in a **Shot List** panel (shot number, lens, size, thumbnail).
- Sensor presets: Super 35, Full Frame, Blackmagic PYXIS 12K (full-frame 36×24mm-class; verify exact dimensions), ARRI Alexa 35, plus Custom.
- Focal length in mm; FOV is derived from sensor + focal length.
- Aspect ratios: 16:9, 1.85, 2.39, 4:3, 1:1, 9:16, custom. Draw frame lines in the viewport.
- **Look through camera** mode, with rule-of-thirds overlay.
- Readouts: camera height, tilt, distance to selected subject.

### 5.4 Lights
- Directional, point, and spot lights with a simple clay-shaded viewport preview.
- The key light direction is converted into a prompt phrase (e.g. "hard key light from camera left, backlit").

### 5.5 Render passes (from the active camera, at the output resolution)
- **Depth**: normalized, near = white, far = black (ControlNet convention)
- **Normals**
- **Object-ID mask**: flat unique colour per linked Cast/Prop; used for regional prompts and masked reference images
- **Pose**: an OpenPose-format skeleton image drawn by projecting mannequin joints to 2D (COCO-18 keypoint colours)
- **Clay**: the lit greybox
- A pass viewer lets the user flip through the passes (useful for debugging bad generations).

### 5.6 AI generation
- **Starting model family: SDXL.** It has the most mature ControlNet and IP-Adapter support, and its licence (CreativeML Open RAIL++-M) permits commercial use. The user delivers client work, so **every model must have a licence that permits commercial use**. Record the licence of each model in the model manifest.
- Pipeline per take:
  - Checkpoint: SDXL
  - ControlNet (depth + pose; a "union" SDXL ControlNet is preferred), each with **strength** and **start/end step range** exposed as sliders
  - **Regional prompting**: a global prompt (style + scene + camera phrase + lighting phrase) plus a per-object prompt masked by the ID pass
  - **Masked IP-Adapter per Cast/Prop**: each one's reference images apply only inside its own mask
  - Project style reference: a global IP-Adapter at low weight, and/or style text
- Controls: seed (lock/randomize), number of takes, steps, CFG, resolution preset, "strictness" slider (a friendly macro over ControlNet strength/range).
- Progress bar with live previews over the ComfyUI WebSocket, and a cancel button.
- Takes appear in a strip under the viewport. Click a take to view it; star it to make it the circle take.
- Workflows live as JSON templates in the repo (`backend/workflows/`) with placeholders the app fills in. Do not build workflows by hand in code.
- Keep the backend layer behind an interface (`GenerationBackend`) so other model families (Flux/Z-Image/Qwen-style multi-reference models) can be added later.

### 5.7 Storyboard
- A board view with the circle takes of all shots, in shot order and drag-reorderable.
- Each panel: image, shot number, lens/size/angle, and editable description and dialogue/action notes.
- Export: PDF (2, 3, or 6 panels per page, landscape) and a PNG sequence.
- Reference: the user already has a Python script at `Claude/research/AI-Storyboarding/scripts/build_board.py` in his Obsidian vault that makes printable boards from frames + a shots CSV. Its layout can inform the PDF design, but reimplement it in-app; don't call Python for this.

### 5.8 Plug-and-play backend (managed ComfyUI)
- First-run **setup wizard**:
  - check the GPU/driver and free disk space (warn that it needs roughly 30 GB)
  - pick an install location (default `%LOCALAPPDATA%\SecondTeam\backend`; let the user choose another drive)
  - download ComfyUI portable, the required custom nodes, and the models from a **pinned manifest** (`backend/manifest.json`: URLs, versions, SHA256, licences), with progress, resume, and checksum verification
- The app starts ComfyUI hidden on a free localhost port, health-checks it, restarts it on crash, and shuts it down on quit. Its logs go to a file the app can show.
- Settings → Backend: status, re-run repair, open the logs, and an advanced option to point at an existing ComfyUI URL (for development).
- Prior art to study: the **Krita AI Diffusion** plugin (Acly/krita-ai-diffusion) solves this same "managed ComfyUI" problem. Learn from its approach and its model/custom-node choices. It is GPL-3.0, so don't copy code into this project without flagging the licence implication to the user first.

## 6. Milestones

Build **one milestone at a time**. Each ends with the app running and a short "how to test this" checklist for the user in plain language. Commit to Git at the end of each milestone.

| # | Milestone | Done when the user can… |
|---|---|---|
| 0 | **Scaffold** | Run one command (or double-click a script) and see an Electron window with an empty 3D viewport and grid. README explains how to run it. |
| 1 | **Set building** | Add/move/rotate/scale primitives, use the outliner, undo/redo, save and reopen a project folder. |
| 2 | **Mannequins** | Add a figure, pose joints, apply presets, scale height. |
| 3 | **Cameras & shot list** | Create several camera setups, set sensor/lens/aspect, look through them with frame lines, and see them in a shot list. |
| 4 | **Lights & clay render** | Place lights and see the clay-shaded result through the camera. |
| 5 | **Render passes** | Export depth, normal, ID, pose, and clay PNGs for a shot, and flip through them in the pass viewer. |
| 6 | **First AI frames** | With a dev ComfyUI running (Claude Code helps set it up by hand for now), press Generate and get SDXL + depth ControlNet + prompt images back in the take strip. |
| 7 | **Continuity** | Create Cast/Props with references, link them to mannequins/objects, and get regional prompts + masked IP-Adapter + pose control + project style ref. Circle takes and seeds work. |
| 8 | **Storyboard** | Arrange circle takes on a board, add notes, export a PDF. |
| 9 | **Plug-and-play** | On a clean Windows machine: run the installer → setup wizard downloads everything → generate, never touching ComfyUI. Packaged `.exe` installer. |
| 10 | **Polish** | Fix pain points found by using it on a real project. |

## 7. Known risks (think about these early)
- **Reference bleed.** Masked IP-Adapters can leak one character's look onto another. Plan for per-reference weight and mask feathering controls.
- **"It traced my blocking" vs "it ignored my blocking."** This depends on ControlNet strength and step range. The user has hit unusable output before with similar tools, so these controls must be accessible and have good defaults.
- **VRAM.** SDXL + ControlNet(s) + several IP-Adapters must fit in 16 GB. Cap the reference count per take if needed and show a clear message.
- **Download size and reliability** for the first-run wizard.
- **Mannequin posing UX** is easy to make painful. Keep it simple.
