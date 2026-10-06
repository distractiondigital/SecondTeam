# Second Team: progress

Current version: **0.12.2** (October 2026). The plan is in [SPEC.md](SPEC.md).

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

## Since the milestones

- **Figures:** skin tone, natural colours with an optional Figure colours view, eye colours.
- **Storyboard:** never an empty frame (shots without an AI take show their clay render).
- **Cameras:** 48 camera bodies and recording formats from ARRI, RED, Sony, Canon, Blackmagic and Nikon, plus Super 16.
- **Presentation:** start screen with version and credits; new README, [user guide](GUIDE.md) and [credits](../CREDITS.md).

## Known limitations

- AI frames need Windows and an NVIDIA graphics card; AI on Mac is coming later.
- The installers aren't code-signed yet, so Windows and macOS ask for confirmation the first time.
- Surface snapping uses bounding boxes, so it is approximate for rotated objects.
- The pose pass draws joints even when something hides them.
- Takes are stored in the project folder, so a project must be saved before generating.

## Ideas / later

- **Figures:** a fresh look for the human figures, better shapes when sitting, smoother close-ups, more outerwear, an expression strength slider.
- **AI:** AI on Mac (starting with ComfyUI's own Mac app), face-consistent cast references, a pose pass that skips hidden joints, passes for a whole scene at once.
- **Lighting:** light colours (gels), practical lamps, soft boxes, flags and bounce.
- **Shots:** a shoot order separate from shot names, custom shot names, other cameras shown in the camera view.
- **Figures and sets:** more pose presets (running, kneeling, leaning, crouching); new objects placed so they don't overlap.
- **Distribution:** code signing for Windows, Apple notarization, automatic updates.
