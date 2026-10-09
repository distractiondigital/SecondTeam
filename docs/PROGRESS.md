# Second Team: progress

Current version: **0.3.0 beta** (October 2026). The plan is in [SPEC.md](SPEC.md).

## Milestones

| # | Milestone | Status | What it delivered |
|---|---|---|---|
| 0 | Scaffold | ✅ Done | The desktop app, a 3D viewport and a one-click launcher |
| 1 | Set building | ✅ Done | Primitives, gizmos and snapping, outliner, real-world units, undo, save and open projects |
| 2 | Mannequins | ✅ Done | Posable figures with joint limits, presets, mirror and a pose library |
| 3 | Cameras & shot list | ✅ Done | Scenes and shots, real sensor and lens maths, frame guides, camera HUD, per-shot changes, live thumbnails |
| 4 | Lights & clay render | ✅ Done | Sun, point, spot and ambient lights, clay shading, automatic lighting descriptions |
| 5 | Render passes | ✅ Done | Clay, depth, normals, object ID and pose passes for each shot |
| 6 | First AI frames | ✅ Done | Local AI frames guided by the set and the figures' poses, takes and seeds |
| 7 | Continuity | ✅ Done | Cast and props with reference images, consistent across shots; circle takes |
| 8 | Storyboard | ✅ Done | The board, captions, dialogue and notes, PDF and PNG export; time of day and atmosphere |
| 9 | Plug-and-play | 🟡 Built, awaiting a test on a second PC | Windows installer and a first-run wizard that installs the AI engine |
| 10 | Figures 2 | ✅ Done | Realistic human figures with body, face, hands, hair and clothing |
| 11 | Polish | ✅ Done | Box select and multi-selection, Outliner drag and drop, recent projects, free-view flying, light aiming, reach-and-plant posing with Look at, per-scene and per-shot cast texts, take comparison, materials |
| 12 | Mac version | 🟡 Built, awaiting the collaborator's test | Apple Silicon app (AI coming later on Mac); see [MAC.md](MAC.md) |
| 13 | Depth of field | ✅ Done | Optically accurate depth of field in every clay picture (sensor, lens, stop, focus), click to focus, focus readout and planes |
| 14 | Clay lighting | ✅ Done | Lights with real sizes, soft shadows that harden at contact, ambient occlusion and ground bounce in every clay picture |
| 15 | App updates | 🟡 Built, awaiting Spencer's test | Checks GitHub for a newer version on launch (can be turned off), downloads it in the background and installs on restart |
| 16 | Path-traced Render | 🟡 Built, awaiting Spencer's test | Path-traced pictures with real bounce light, soft shadows and lens blur, in camera view, on the Board, in exports and as thumbnails |
| 17 | Practicals & diffusion | 🟡 Built, awaiting Spencer's test | Lamps, bare bulbs, flashlights and fairy lights that light the set, and a Diffusion material for curtains and frosted glass, matching in Clay and the Render |

## Since the milestones

- **Figures:** skin tone, natural colours with an optional Figure colours view, eye colours.
- **Storyboard:** never an empty frame (shots without an AI take show their clay render).
- **Cameras:** 48 camera bodies and recording formats from ARRI, RED, Sony, Canon, Blackmagic and Nikon, plus Super 16; a live shot window in the corner of the viewport, with the camera steerable from inside it.
- **Presentation:** start screen with version and credits; new README, [user guide](GUIDE.md) and [credits](../CREDITS.md).

## Known limitations

- AI frames need Windows and an NVIDIA graphics card; AI on Mac is coming later.
- The installers aren't code-signed yet, so Windows and macOS ask for confirmation the first time.
- Surface snapping uses bounding boxes, so it is approximate for rotated objects.
- The pose pass draws joints even when something hides them.
- Takes are stored in the project folder, so a project must be saved before generating.

## Ideas / later
- **Render:** Atmosphere (fog) in the Render; lens character (blade count, anamorphic flares; measured lens profiles from a test shoot, e.g. DZOFilm Arcana, with flare, distortion and vignetting); a sharper sun shadow map for extreme close-ups in Clay; moving to the WebGPU path tracer when it matures.

- **Figures:** a fresh look for the human figures, better shapes when sitting, smoother close-ups, more outerwear, an expression strength slider.
- **AI:** AI on Mac (starting with ComfyUI's own Mac app), face-consistent cast references, a pose pass that skips hidden joints, passes for a whole scene at once.
- **Lenses:** anamorphic lens character (horizontal streak flares, edge falloff and distortion).
- **Lighting:** diffusion frames (a light shining through diffusion becomes a big soft source, e.g. sun through a curtained window), light colours (gels), soft boxes, flags and bounce; more practicals (candles, screens).
- **Shots:** a shoot order separate from shot names, custom shot names, other cameras shown in the camera view.
- **Figures and sets:** more pose presets (running, kneeling, leaning, crouching); new objects placed so they don't overlap.
- **Distribution:** code signing for Windows, Apple notarization, automatic updates.
