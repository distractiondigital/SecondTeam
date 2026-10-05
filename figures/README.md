# Human figure data

`body.json` + `body.bin` are made by `scripts/figures/build-figure-data.mjs` from MakeHuman data,
all **CC0** (public domain dedication, free for any use including commercial; no attribution required):

- Base mesh, body targets (gender / age / muscle / weight, three ethnic sets averaged), facial
  expression units, the game-engine rig and its skin weights: MakeHuman, as shipped in the data
  folder of MPFB 2.0.17 (https://extensions.blender.org/add-ons/mpfb/). Only data files are used;
  no MakeHuman or MPFB program code is included in Second Team.
- Licence statements: https://static.makehumancommunity.org/about/license.html and the `license`
  field of the weights file ("CC0").

The app's own code that blends targets, fits the skeleton and poses the body is original
(`src/shared/humanBody.ts`, `src/renderer/src/viewport/HumanView.tsx`).
