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

## Eyes, eyebrows, hair and clothes

`proxies.json` + `proxies/<id>.bin|png` are made by `scripts/figures/build-proxies.mjs` from the
MakeHuman community asset packs (makehuman_system_assets, shirts01, pants01, dress01, suits01: CC0;
shirts02: CC-BY). Every item records its licence, source and (for CC-BY) author in `proxies.json`;
the README's Credits section lists the CC-BY authors. Hair/eyebrow textures are reduced to
black-and-white transparency masks.
