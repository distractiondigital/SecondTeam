# Second Team user guide

How to use every part of Second Team. For installing it, see the [README](../README.md); for a Mac, [MAC.md](MAC.md).

## Contents
- [Installing and AI engine setup (Windows)](#installing-and-ai-engine-setup-windows)
- [Viewport controls (Blender-style)](#viewport-controls-blender-style)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Figures (people and mannequins)](#figures-people-and-mannequins)
- [Cameras & shots](#cameras--shots)
- [A scene's set and per-shot changes](#a-scenes-set-and-per-shot-changes)
- [Lights & clay](#lights--clay)
- [Cast, props and continuity](#cast-props-and-continuity)
- [AI frames (Generate)](#ai-frames-generate)
- [Render passes](#render-passes)
- [Storyboard](#storyboard)
- [Projects](#projects)

## Installing and AI engine setup (Windows)
1. Run `Second Team Setup <version>.exe` (from the [Releases](https://github.com/distractiondigital/SecondTeam/releases) page). It isn't code-signed yet, so Windows shows **"Windows protected your PC"**: click **More info → Run anyway**. Windows asks for administrator permission once; it installs into `C:\Program Files\Second Team` (changeable) with Start-menu and desktop shortcuts. Each Windows user who opens it sets up their own engine and settings (in their own AppData), or points at an existing copy.
2. On the first start, the **AI engine setup** opens:
   1. **This PC**: checks the graphics card (an NVIDIA card with driver 580 or newer; 8 GB+ video memory recommended) and that Windows can unpack the engine (Windows 11 can by itself; Windows 10 needs [7-Zip](https://www.7-zip.org)).
   2. **Location**: where the engine and models go, by default `%LOCALAPPDATA%\SecondTeam\backend`. **Change…** for another drive. Or **Use files I already have…** to point at an existing copy (e.g. this repo's `ComfyUI` folder): nothing is copied.
   3. **Models**: the required pieces are always included; tick RealVisXL and/or SDXL 1.0 (sizes and licences listed; all allow commercial use).
   4. **Download** (about 20 GB): progress, speed and time left. **Pause** any time, even close the app: it carries on where it stopped. Every file's checksum is verified, then the engine starts.
   **Set up later** skips it: everything except AI frames works without the engine.
3. **Engine settings** (click the AI light in the Takes strip → **Engine settings…**, the AI window's **Engine** tab): status, location, what's installed (**Add** a model you skipped), **Repair** (re-downloads anything missing or damaged; **Full check** also re-reads every model's checksum), **Open log**, **Restart**, and under **Advanced** a ComfyUI that's already running on this PC.
4. Uninstalling (Windows Settings → Apps) removes the app but keeps the engine, the models and your projects, so reinstalling doesn't download again. To free the space, delete the backend folder yourself.

## Viewport controls (Blender-style)
- **Mouse or trackpad** (the mouse / trackpad button at the right of the toolbar; click to switch, remembered on each PC). **Trackpad:** two-finger swipe orbits, **Shift** + swipe pans, **pinch** zooms; in camera view a swipe dollies and a pinch zooms the lens. (Windows keeps three-finger swipes for itself, so they can't be used.) **Mouse:** as below.
- **Alt + left-drag** orbits and **Alt + Shift + left-drag** pans in either mode (no middle button needed); in camera view Alt + left-drag looks around (W A S D fly while it's held), like the right button.
- **Middle-drag:** orbit
- **Shift + middle-drag:** pan
- **Scroll:** zoom
- **Hold right mouse:** fly. Move the mouse to look around; while it's held, **W A S D** move, **Space** up, **C** down, **Shift** faster, scroll sets the speed (the free view starts at 5 m/s; a shot camera at 1.5 m/s). Let go and orbit as usual (around a point in front of you).
- **Left-click:** select. **Ctrl/Shift + click** adds to the selection. Clicking empty space clears it.
- **Left-drag:** box select: everything whose middle is inside the rectangle. **Shift**-drag adds, **Ctrl**-drag removes.
- Clicking an object inside a group selects the whole group. **Double-click** selects just that object.
- **Several things selected:** the gizmo sits under their middle and **moves (W) or rotates (E)** them all together, in one undo step (group them to scale them).
- **Outliner:** **Ctrl+click** adds or removes one, **Shift+click** selects a range. **Drag** rows to reorder them, onto the middle of a group to put them inside, or below the list to take them out. Nothing moves in the set (in any shot) when it changes group. Dragging a selected row moves the whole selection.

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

## Figures (people and mannequins)
- **Add → Figure** puts a person on the floor (new figures alternate man / woman). Click it once to select the whole figure: move and rotate it with the gizmo. In Properties:
  - **Style: Human | Mannequin.** Human is a realistic, sculpted person; Mannequin is the art mannequin. Both use the same pose. Projects from before this version open with mannequins.
  - **Body** (Human): a **Body preset** (Man, Woman, Child, Teenager, Elderly, Athletic, Heavy, Slim) and sliders for **Gender**, **Age** (shown in years), **Muscle** and **Weight**. **Height** in metres or feet (hold Ctrl while dragging for whole centimetres / inches). The Mannequin has **Build** instead.
  - **Face & hands**: **Eyes** (brown, light brown, green, blue-green, grey, light blue, blue, deep blue, ice), **Expression** (Neutral, Smile, Laugh, Sad, Angry, Surprised, Scared, Talking, Disgusted) and each hand's shape (Relaxed, Fist, Open, Point, Grip). The expression also goes into that person's AI prompt.
  - **Look**: **Hair**, an **Outfit** (a whole outfit or dress) or a separate **Top** and **Bottom**, **Outerwear**, **Shoes** and a **Hat**, each with its own colour. Until you pick one, each part has a plain natural colour (navy polo, khaki shorts, brown shoes…); **×** goes back to that. **Skin tone** (Fair ↔ Dark) sets the skin.
  - **Figure colours** (the palette button next to Work | Clay): shows each person in their own colour in the viewport, handy to tell people apart while blocking. Off by default; thumbnails, the board and exports always show natural colours. Each new figure still gets its own colour (its **Material**, and the cast member's colour when linked).
  - Body, expression, hands and look can all change **per shot**, like everything else.
  - **Cast members share a look**: link figures to the same cast member and changing one's body or clothes (in the scene's set) changes them all, in every scene. Inside a shot it's just a cheat for that shot.
- The people are built live from MakeHuman's free (CC0) body data, so every slider is smooth and the clothes re-fit any body. Under Body, **Chest** (folded) has MakeHuman's own **Breast size** and **Breast firmness** sliders; the middle of each is the body as modelled.
- With the figure selected, **click a body part** to pose the joint that moves it (forearm → elbow, thigh → hip, head → head…). Drag the rings, or type angles in Properties. Hold **Ctrl** for 15° steps. **Esc** or clicking empty space goes back to the whole figure.
- **Presets**: Standing, Walking, Sitting, Pointing, Arms crossed, Looking over shoulder, Lying down. **Mirror L↔R** swaps sides. **Reset pose** returns to standing.
- **Saved poses**: name the current pose and **Save to project** (travels with the project folder) or **Save to library** (on this PC, available in every project). Saved poses appear in the preset menu and in the Saved poses list, where you can apply them to any figure, copy between project and library, or delete them. Poses scale to each figure's height.
- **Joint limits** (on by default) keep joints in natural ranges. Turn them off for a figure to cheat a pose for the lens.
- The pelvis joint also has a **Hip offset** for lowering the body (sitting, lying down).
- **Reach (drag a hand, foot or the hips):** click a hand, a foot or the hips, press **W**, and an orange ball sits on it. **Hold the ball** and move the mouse: it moves across the screen and the arm or leg bends to follow (elbows and knees keep bending their natural way). While still holding, **W / S** push it away from / toward the camera (**Shift** faster). Let go; **Ctrl+Z** undoes the whole drag. **E** gives the rotate rings back.
- **Snapping and planting:** a dragged hand or foot snaps onto the surface under the cursor when it can reach it (the ball turns green): a foot lands flat, a palm lands against it. **Space** while holding turns snapping off/on (the ball turns white). Left on a surface, it's **planted**: it stays put while you move the hips or pose the rest of the body (plant both feet, drag the hips down: a squat). Left in mid-air it just follows the body. Figure Properties → **Planted** lists them with **Release**. Moving the whole figure carries its planted hands and feet along. A preset, Mirror or a saved pose releases them.
- **Look at** (Figure Properties): **This shot's camera** (each shot's figure looks into that shot's lens), any figure (its eyes) or object in the set, or **A point** (drag its ball). The head turns, the neck shares the turn and a little goes into the chest, within the joint limits. It stays live: move the target or the figure and the head follows. While it's on, the head and neck follow it (turn it off to pose them by hand).
- Planted hands/feet and Look at can differ **per shot**, like the pose.

## Cameras & shots
- A project has **scenes** (Scene 01, Scene 02…). Pick, add, duplicate (same set, no shots), rename (number + title, e.g. "INT. KITCHEN – NIGHT") or delete scenes from the scene picker at the top of the Outliner.
- Each scene has **shots**: frame something up in the viewport, then click **＋ Add shot** at the bottom of the **Shot list**; it opens straight into the new shot's camera view, ready to fly and frame. Shots are named after the scene: 1A, 1B, 1C… (I and O are skipped, like on a slate). Every shot has its own camera; cameras don't appear in the Outliner. **Drag shots in the Shot list to reorder them**; shot names always follow the list order, so reordering or deleting renames them (delete 1B and 1C becomes 1B). The Shot list shows each shot's circle take, or else a Clay still of its frame; the shot you're editing updates live, and every other shot whose picture changed (e.g. you added an object) updates after a short pause. Click a shot to edit it (if it has a circle take, that opens in the take viewer; Esc closes it), double-click to look through it.
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
- **Shot window**: while you're editing a shot but not looking through it, a small live view through its lens sits in the bottom-left corner of the viewport, in the delivery frame's shape, with its focal length, stop and focus on top. Work on the set in the main view and watch the frame update. Steer the camera from inside the window with the same controls as camera view (hold the right mouse to look and fly, scroll to dolly, Ctrl+scroll to zoom; Q / E roll only while the right mouse is held, since E is also the rotate tool). Double-click it, or its expand button, for full camera view; **–** tucks it away into a small *Show* tab (remembered). It always shows the Clay picture (lit, with depth of field and ambient occlusion), even while the viewport is in Work.
- **Shot properties**: focal length, focus distance, stop, pan/tilt/roll, the shot's subject, and notes.
- **Depth of field**: every clay picture (camera view, Shot list thumbnails, the Board and Clay exports) is blurred the way the real lens would blur it, worked out from the sensor, focal length, **stop** and **focus distance**. Anamorphic lenses give upright oval blur.
  - **Stop** (Properties → Lens, or the stop menu at the top right of the camera view): T1.3 to T22. Lower = shallower focus. New and older shots start at T2.8.
  - **Focus**: leave it empty for **auto focus**: the subject's eye nearest the lens, as long as it's well inside the frame (the middle 75%) and not hidden; otherwise whatever is in the middle of the frame. Type a distance to set it, or **Pick** (the crosshair), or hold **Shift** in the camera view, and click anything in the frame: focus jumps to it (Ctrl+Z undoes it; Esc cancels the pick). **Auto** goes back to auto focus.
  - The camera view's top right and Properties show where it's focused, what's sharp (e.g. *sharp 2.6–3.8 m*) and the hyperfocal distance. With the camera selected in the set view, its frustum reaches the focus plane, and faint blue rectangles mark the near and far limits of sharpness.
  - The aperture button at the top right of the camera view turns the live blur off (handy on a slow laptop); pictures keep it. The AI's guide images stay sharp, and shallow-focus shots add *shallow depth of field, soft out-of-focus background* to the prompt.
- **Camera body (whole project)**, below that: **Camera** (grouped by maker: film formats Super 16 / Super 35 / Full Frame; ARRI ALEXA 35, Mini LF / LF, Mini, 265, 65; RED V-RAPTOR VV and S35, KOMODO; Sony VENICE 2, VENICE, BURANO, FX9, FX6, FX5, FX3; Canon C500 Mark II, C400 / C80, R5 C, C300 Mark III / C70; Blackmagic URSA Cine 17K 65 and 12K LF / PYXIS 12K, PYXIS 6K, Cinema Camera 6K, Pocket 6K, Pocket 4K with or without a Metabones Speed Booster; Nikon ZR; or a **Custom size**) and, for cameras with several, its recording **Format** (e.g. ALEXA 35 4.6K Open Gate, 4K 16:9 or 3.3K 6:5 anamorphic): each uses the area of the sensor that format records, so lenses frame exactly as on the real camera. The camera view shows the camera and format at the top. anamorphic squeeze (1.0–2.0), **frame guides** (16:9, 1.85, 2:1, 2.35, 2.39, 4:3, 1:1, 9:16, 4:5, custom), the **delivery frame** (what gets rendered later) and rule of thirds. These are the same for every shot in the project.
- The HUD and Shot list show camera height, tilt, distance to the subject, and the **shot size and angle** (e.g. "Medium close-up · Slight high angle"), worked out from the nearest figure in frame. Override them in Properties if you like.

## A scene's set and per-shot changes
- Each scene has its own **set**, which every shot in it starts from. The top row of the Shot list (e.g. "Scene 01") edits it; clicking a shot (or looking through its camera) edits *that shot's version* instead. A banner over the viewport always says which (the viewport gets an orange frame while you're in a shot).
- In a shot, moving, rotating, resizing, posing, recolouring or hiding something changes it **for that shot only**. Everything you haven't changed in a shot keeps following the scene's set. **Delete** in a shot only hides the object there; delete in the scene's set removes it everywhere. New objects always go into the scene's set.
- A new camera made while a shot is active starts from that shot's version; one made from the scene's set starts clean.
- Select a changed object to see **Changed in Shot 3: position, pose**, with **Revert to master** (drop this shot's change) and **Push to master** (make it the Master version). Changed objects show a clapperboard badge in the Outliner.

## Lights & clay
- **Lights** (toolbar): **Sun** (daylight from one direction; only its angle matters), **Point** (a bare bulb), **Spot** (a beam) and **Ambient** (soft even fill from the sky). Aim sun and spot with the rotate gizmo (E) or Pan/Tilt in Properties. While a sun or spot is selected, a dashed **aim line** shows where it lands (a cross where it hits), and a spot also outlines its **pool of light** on the floor and objects. The cross has its own **move handle**: drag it and the light turns to point at it, staying where it is.
- **Material** (Properties, objects): the colour plus **Matte · Glossy · Metal · Glass · Glow**: how the surface looks in Clay, thumbnails and Clay exports (render passes ignore it). For an object with a description, or one linked to a prop, a non-matte material is added to its prompt (*…, metal*; a group lists its parts' different ones: *glass and metal*). Changeable per shot.
- Light Properties: **intensity in stops** (0 = a standard key, +1 = twice as bright), **colour temperature** in Kelvin (with Candle / Tungsten / Daylight / Overcast / Shade presets), **size** (the source's real size, which sets how soft its shadows and light are: point and spot lights in metres, with presets from Bare bulb 0.05 m through Fresnel, China ball and 4×4 / 8×8 / 12×12 / 20×20 frames; the sun in degrees, from Clear sun 0.5° through Hazy and Thin cloud to Overcast 30°; a selected lamp shows its size as a faint outline), casts shadows, and for spots the cone angle and beam edge. Point and spot lights fall off with distance like real ones.
- **Work / Clay** (toolbar): Work shows object colours under even light; **Clay** shows every surface in its **Material** colour (Properties), matte, lit by your lights, with shadows, under the **environment**'s sky and on its ground (below).
- **Clay light behaves like the real thing**: a light's **size** changes both its shadows and the light itself. Shadows are crisp where an object touches the floor and soften the further they fall; and a big source (a 4×4 or 12×12 frame, a hazy or overcast sun) wraps further round a face, giving a soft, gradual shadow line and broader highlights, while a bare bulb gives a hard line. Corners, creases and contact points get a gentle darkening (ambient occlusion), and a sunlit floor bounces a little of its colour back up onto the shadow sides of figures and props. The same look appears in camera view, thumbnails, the Board and Clay exports. Looking through a camera switches to Clay automatically (and back when you leave, if you were in Work).
- Each shot gets an automatic **lighting description** (e.g. "Soft key light from camera left, rim light from behind, warm tungsten, high contrast"), shown in the camera HUD and the shot's Properties, where you can overwrite it. It goes into the AI prompt.
- Lights work with per-shot changes, so you can cheat a light for one setup. Shot list thumbnails show each shot lit.
- **Environment** (a shot's Properties, under Lighting): a **Time of day** slider (Night → Dawn → Sunrise → Morning → Midday → Afternoon → Sunset → Dusk → Night) that sets the sky behind the set and a soft fill light in the sky's colour, an **Atmosphere** slider (Clear → Haze → Thick fog: distant things fade into the sky's horizon colour; the depth, normals and ID passes stay clear), and a **Ground** colour for the automatic floor. Your own lights stay the key light; the sky and ground show in Clay (once the scene has a light), camera view, thumbnails and clay renders. It belongs to the scene: **Scene 01** changes it for every shot that follows the scene, **This shot only** gives one shot its own (switch back to drop it). The time of day (and any atmosphere) also starts the lighting description, so it goes into the AI prompt (unless you've typed your own lighting).

## Cast, props and continuity
Keep characters and story objects looking the same from shot to shot.

- The left column has three tabs: **Outliner | Cast | Props**. In **Cast** or **Props**, click **＋ New**, then fill it in on the right:
  - **Description**: how it looks, e.g. *young woman in her 20s, curly dark hair, olive raincoat*. It becomes that one's own prompt, applied only to its part of the frame. Describe the look, not the name.
  - **Everywhere | Scene 01 | Shot 1B** above the Description: change the text for just one scene or one shot (*…, soaking wet, hair plastered down*). The box starts with the text that scene or shot uses now, so add to it or rewrite it; a dot marks scopes with their own text, and **Back to the … text** removes it. A shot's own text wins over its scene's, which wins over the usual one. The Cast/Props list says *changed here* when the current scene or shot has its own.
  - **Reference images** (up to 4, PNG or JPEG): photos or drawings of how it should look. Add files with the image button, or **paste** (the clipboard button, or **Ctrl+V** while the cast member or prop is open): an image copied from a browser or a screenshot tool, or image files copied in Explorer. They're copied into the project (`assets\cast\…`, `assets\props\…`) and guide only its part of the frame.
  - **Reference strength**, and for cast a **Material** colour (linked figures wear it).
  - **Linked to** lists every figure or object that is this one, in every scene.
- **Linking:** select a figure → Properties → **Cast** → pick one (or *New cast member…*). Select an object or a group → **Prop**. A whole group can be one prop (a car built from boxes). Something that isn't a cast member or prop can still get its own **Description** (e.g. *a rusty oil drum*).
- The **Object ID** pass now has one colour per cast member, prop and described object (two figures of the same character share a colour).
- **Style reference** (AI window → Generation, whole project): images that set the look of every shot (a film still, an artbook page, a sketch), with a Subtle ↔ Strong slider. It works alongside the Style text. At higher strengths it can override details that come only from text; characters with their own reference images hold up best.
- **How the prompts are split:** the **Frame description** applies only to the parts of the frame that aren't a cast member, prop or described object. Each of those gets its own prompt instead: its description, which way *that* figure faces, plus the shot size, lens, lighting and style. So one character's words can't land on another.
- **Figures and depth:** the depth pass guides the **set and props** (so what's behind whom stays right), while each **figure's own area gets only a weak, heavily softened version of it** (how far away they are, so props stay in front of or behind them): figures are shaped by their pose skeleton, their own prompt and references, never by the mannequin's ball joints. A figure that isn't a cast member gets its own area too, as *a person*.
- **Advanced → Cast & props:** **Feather** (how soft each one's edge is) and **End** (when references stop guiding). If a look leaks across an edge, raise Feather or lower End.
- **Good references:** at least a few hundred pixels tall, showing what should carry over (a full-length outfit shot, a face close-up; several are combined, keeping each one's detail). Make the description agree with them: if the photo shows a cloak and vest, don't write "sweater".
- **Compare takes:** in the take viewer click **Compare**, or **Ctrl+click** a second take in the strip. **Side by side** shows both; **Wipe** shows one frame, take A left of a divider that follows the mouse, take B right of it. **← / →** flip B through the shot's takes, **Shift+← / →** flip A, the ☆ on either side circles it, **Esc** goes back to one take.
- **Live previews** while a take is being made are sharp (TAESD, MIT licence, shipped with the engine).
- **Circle takes:** click the ☆ on a take (or *Circle this take* in the take viewer). One per shot; it keeps its place in the strip (marked with a filled star and an orange border) and becomes the shot's thumbnail in the Shot list. The Storyboard uses it. Ctrl+Z undoes it.
- Takes with cast and props take longer (about 30 s instead of 7), because each one's part of the frame is worked out separately. At most 6 cast members/props with reference images are used per take; the strip says who was left out.

## AI frames (Generate)
**One-time setup**: in development the app uses the `ComfyUI` folder here (Git ignores it). If it's missing, the setup wizard opens and installs into it; or run the older script (needs 7-Zip):

```
node scripts/fetch-backend.mjs
```

Either way it downloads ComfyUI (the local AI engine) and the models listed in `backend/manifest.json`, checks every file's checksum, and can be re-run to resume. Every model's licence is recorded there; all of them allow commercial use:

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
- **Keeping AI out of the way:** everything AI folds away, and each fold remembers whether it's open on this PC. In a shot's Properties, **AI generation** holds the Prompt, **Generate**, **Check passes** and a **Generation settings…** link; the **Frame description** stays visible (it's also the storyboard caption). Cast and props fold their reference images into **AI references**. The **takes strip** folds down to a thin bar (the chevron on its left) with Generate and the AI light; it opens by itself while a take is being made.
- **Generation (whole project)**, in the **AI window → Generation** tab (the AI light → *Generation settings…*, or the link in a shot's AI generation fold): **Model**, **Style** (e.g. *moody 16mm film still* or *pencil sketchbook drawing*; save a style you like with the **disk** button under it as a named **preset**, and load presets from the list in any project; a preset remembers the model it was made with), **Strictness** (how closely the set's shapes are followed, from *Loose* to *Traces blocking*), **Takes** per Generate, **Seed** (locked = the same seed each time; unlocked = random), and **Advanced**: steps, CFG, the depth guide's strength/start/end, the pose guide's strength/end, and the negative prompt.
- The project must be saved: takes are stored in it as `scenes\<scene id>\shots\<shot id>\takes\` (the PNG, a thumbnail, and a `.json` with the seed, prompt, model and licence, and every setting).

## Render passes
The images the AI works from, rendered from a shot's camera through its delivery frame:
- You never need to render passes yourself: **Generate makes them fresh** for the shot every time, right before the AI works. To look at them, click **Check passes** in the shot's Properties. The **pass viewer** opens over the viewport:
  - **Clay**: the lit set, in each object's Material colour.
  - **Depth**: near is white, far is black.
  - **Normals**: which way each surface faces (blue/lilac faces the lens).
  - **Object ID**: a flat colour per object or figure, with a legend.
  - **Pose**: an OpenPose skeleton of each figure.
- Flip between them with **← / →** or **1–5**; **Esc** closes. **Re-render** after changing the shot.
- The size is set automatically for the AI model (SDXL): about one megapixel in the delivery frame's shape, e.g. 1536 × 640 for 2.39.
- If the project is saved, the passes are also written into it: `scenes\<scene id>\shots\<shot id>\passes\` (five PNGs plus `passes.json`). **Show in folder** opens it.
- Renders and Shot list thumbnails include an automatic endless floor at ground level. Turn it off per scene with **Floor in renders** in the scene menu (top of the Outliner), e.g. for a rooftop or when you've built your own ground.

## Storyboard
Turn the circle takes into a board you can send to a client or crew.

- Click **Board** in the **Set | Board** switch at the top. Every shot in the project appears as a panel: its circle take, the shot (1A) with its scene, and lens · shot size · angle. Shots without a circle take show their clay render instead, so there's never an empty frame and the board doubles as a shot plan. A new project's board starts on **Clay** and switches to **AI** once any shot has a circle take. **Set** takes you back where you were.
- Each panel has three boxes: **Description** (starts as the shot's Frame description; change it here and the AI prompt stays as it was), **Dialogue** (printed in quotes) and **Notes** (the shot's notes). They save when you click away; Ctrl+Z undoes them.
- **AI | Clay** (top right of the board) switches every panel between its circle take and the shot's live clay render (the same lit view as the Shot list thumbnail, in each object's Material colour, from every scene). Export… starts on the same choice.
- **Drag** a panel by its grip (⋮⋮) to reorder. The board has its own order across all scenes (intercut freely), and shot names never change. New shots join the end.
- **Double-click** a panel's picture to jump to that shot in the Set view, with its circle take open.
- **Export…**:
  - **Layout:** Grid 2 / 3 / 6 (landscape pages, captions under each frame) or Rows 2 / 3 / 4 (portrait pages, picture left, captions right). A small sketch of one page under the buttons shows how the chosen layout will look.
  - **Page size** (Letter or A4), **Title** (the project name), and an optional **Footer** (e.g. *Distraction Digital · v1 · not for distribution*). If some shots have a circle take and others don't, the Export window notes that those will use their clay render.
  - **Export PDF** makes `exports\Storyboard <date time> Grid 3.pdf` in the project folder; **Export PNGs** copies the full-size circle takes into `exports\Storyboard <date time> PNGs\001 - 1A.png …` in board order. **Open** / **Show in folder** afterwards. Exporting twice never overwrites: the second gets "(2)". Under **Pictures**, **AI** uses the circle takes and **Clay** the clay renders of every shot (names end in "Clay", e.g. `… Grid 3 Clay.pdf`, `… Clay PNGs\`).
  - Very long captions are trimmed with "…" in the PDF so they never run into the next panel.

## Projects
A project is a folder called `Name.secondteam` containing `project.json` (the set, in plain readable JSON) and folders for reference images, renders and exports. To open one, choose that folder in the Open dialog. The project's name is the folder's name.

When the app starts, a panel offers **New project**, **Open…** and your **recent projects** (newest first; a moved or deleted one says "Not found", and × takes it off the list). The **▾** next to Open in the toolbar lists them too. The list is kept in `%LOCALAPPDATA%\SecondTeam\recent.json`.
