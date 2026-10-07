# Credits

Second Team is © 2026 Distraction Digital, free and open source under the GPL-3.0. It is built on the work of others; thank you to all of them. The same list is in the app (**Credits** on the start screen).

## Human figures

**[MakeHuman](https://static.makehumancommunity.org/)** by the MakeHuman Community, CC0. The base mesh, body and face targets, skeleton weights, eyes, eyebrows, hair and most clothes. Data files only, taken from the [MPFB](https://extensions.blender.org/add-ons/mpfb/) add-on and the [MakeHuman community asset packs](https://static.makehumancommunity.org/assets/assetpacks.html). No MakeHuman or MPFB program code is included. Details: [figures/README.md](figures/README.md).

These garments are CC-BY ([Creative Commons Attribution](https://creativecommons.org/licenses/by/4.0/)), from the MakeHuman community asset pack [shirts02](https://static.makehumancommunity.org/assets/assetpacks/shirts02.html):

- **Shirt (untucked)** by Elvaerwyn
- **Shirt and tie** by Elvaerwyn
- **Hooded jacket** by Elvaerwyn
- **Striped shirt** by EWS
- **Knitted sweater** by Mindfront
- **Long cardigan** by Mindfront
- **Blouse** by punkduck
- **Sweater (older)** by janexx

## AI engine and models

These aren't part of the app. The setup wizard downloads them on Windows from their original sources, pinned and checksum-verified in [backend/manifest.json](backend/manifest.json). They run as a separate program. All allow commercial use of what they generate.

| Component | By | Licence |
|---|---|---|
| [ComfyUI](https://github.com/Comfy-Org/ComfyUI) | Comfy Org | GPL-3.0 |
| [ComfyUI_IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus) | cubiq | GPL-3.0 |
| [RealVisXL V5.0](https://huggingface.co/SG161222/RealVisXL_V5.0) | SG161222 | CreativeML OpenRAIL++-M |
| [Stable Diffusion XL 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) | Stability AI | CreativeML OpenRAIL++-M |
| [ControlNet Union SDXL ProMax](https://huggingface.co/xinsir/controlnet-union-sdxl-1.0) | xinsir | Apache-2.0 |
| [IP-Adapter Plus SDXL + CLIP ViT-H image encoder](https://huggingface.co/h94/IP-Adapter) | h94 (Tencent AI Lab); CLIP by LAION | Apache-2.0 |
| [TAESD](https://github.com/madebyollin/taesd) (live previews, ships with ComfyUI) | Ollin Boer Bohan | MIT |

## Software libraries

| Library | By | Licence |
|---|---|---|
| [Electron](https://www.electronjs.org) (with Chromium and Node.js, whose licences ship with the app) | OpenJS Foundation | MIT |
| [React](https://react.dev) | Meta Platforms | MIT |
| [three.js](https://threejs.org) | three.js authors | MIT |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber), [Drei](https://github.com/pmndrs/drei), [three-stdlib](https://github.com/pmndrs/three-stdlib) | Poimandres | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | Poimandres | MIT |
| [Immer](https://immerjs.github.io/immer) | Michel Weststrate | MIT |
| [electron-updater](https://www.electron.build/auto-update) (app updates) | electron-builder contributors | MIT |
| [Lucide](https://lucide.dev) icons | Lucide contributors | ISC |

Build tools (not shipped in the app): Vite, electron-vite, electron-builder, TypeScript, Vitest (MIT / Apache-2.0).

---

Second Team was designed by a filmmaker, not a software developer. It was realized with AI as a tool to assist filmmakers to create, communicate and collaborate on their art, and that's why it will always be open and free.
