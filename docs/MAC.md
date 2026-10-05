# Second Team on a Mac

For anyone testing the Mac version. It's the whole app (sets, figures, cameras, shots, the storyboard and its exports), with one thing missing for now: **the AI engine**. That's Windows-only at the moment, so on a Mac the AI parts say *coming soon*. AI frames made on Spencer's PC still show up when you open the same project.

You need a Mac with **Apple Silicon** (M1 or newer). To check:  menu → **About This Mac** → *Chip* should say Apple M-something.

## Getting it

Spencer sends you the file `Second Team <version> (Apple Silicon).dmg`. If you have access to the GitHub repo, you can also get it yourself: **Actions** → **Mac build** → the latest green run → **Artifacts** → *Second Team (Apple Silicon)*. That download is a .zip with the .dmg inside.

## Installing

1. Double-click the `.dmg`. Drag **Second Team** into **Applications**.
2. Open **Applications** and double-click **Second Team**. macOS will refuse the first time ("Apple could not verify…"), because the app isn't registered with Apple yet. Click **Done** (not *Move to Bin*).
3. Open **System Settings** → **Privacy & Security**, scroll down to *Security*: next to *"Second Team" was blocked…*, click **Open Anyway**, then confirm (with your password or Touch ID).
4. It opens. You only do this once per new version.

If macOS ever says the app **"is damaged and can't be opened"**, that's the same check being stricter. Open **Terminal** and paste this, then open the app again:

```
xattr -cr "/Applications/Second Team.app"
```

## Using it on a Mac

- **Trackpad** is the default (the mouse / trackpad button at the right of the toolbar switches):
  - two-finger swipe: orbit
  - **Shift** + swipe: pan
  - pinch: zoom
  - **Option** + drag: orbit (with Shift: pan)
  - two-finger click and hold (a right-click) + **W A S D**: fly
- **Cmd** replaces Ctrl:
  - **Cmd**+click adds to a selection
  - **Cmd**+drag removes from a box selection
  - **Cmd**+S saves, **Cmd**+Z undoes, **Cmd**+D duplicates
- **Delete** deletes the selected objects.
- **⌘Q** quits (it asks first if there are unsaved changes).
- The app keeps its own settings in `~/Library/Application Support/SecondTeam`. Projects are folders called `Name.secondteam`, wherever you save them.

## Sharing projects with the PC

A project is just a folder, so it can live in a shared folder (Nextcloud, Dropbox, iCloud Drive…) or be copied across. It contains no Windows paths, so it opens on either computer. **Don't have the same project open on both computers at once**: the last one to save wins.

## AI on the Mac

Coming soon. Until then:
- the AI light at the bottom right says *Coming soon on Mac*
- **Generate** explains why it can't run
- the AI sections stay folded away
- takes generated on the PC show in the take strip and on the storyboard

Advanced only: if you already run ComfyUI on this Mac with the same models and the IP-Adapter add-on, **Engine settings → Advanced** can connect to it.

## Test checklist (send Spencer what doesn't work, with a screenshot)

1. The app opens (after *Open Anyway*), with the start panel. *New project*, then **Save** (⌘S) somewhere.
2. Add a box, a sphere and a **Figure** from the toolbar. Click one, then move / rotate it with W / E and drag the gizmo.
3. Navigate with the trackpad: swipe, Shift+swipe, pinch, and Option+drag.
4. Drag a rectangle to select several things, and **Cmd**+click one to add or remove it.
5. Select the figure, click its hand, press **W**, hold the orange ball and move it. While holding, press **W** and **S**.
6. Add a light (sun) and switch to **Clay**.
7. **＋ Add shot**: it opens the camera view. Fly with two-finger click held + W A S D, then press Esc.
8. Add a second shot. Open **Board**, and **Export** a PDF.
9. Open a project folder copied from the PC: its takes show in the strip and on the board.
10. Click the AI light: it says *Coming soon on Mac*.
11. Type into a text box, then copy and paste (⌘C / ⌘V).
12. ⌘Q with unsaved changes: it asks to save.
