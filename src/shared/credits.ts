// Everything Second Team is built on or downloads, with its licence. Shown in the app (Credits on
// the start screen) and mirrored in CREDITS.md. A test checks that every CC-BY figure item in
// figures/proxies.json and every download in backend/manifest.json is credited here.

export const COPYRIGHT = '© 2026 Distraction Digital. All rights reserved.'

export interface Credit {
  name: string
  by?: string
  license: string
  url: string
  note?: string
}

export interface CreditSection {
  title: string
  items: Credit[]
}

export const CREDITS: CreditSection[] = [
  {
    title: 'Human figures',
    items: [
      {
        name: 'MakeHuman',
        by: 'the MakeHuman Community',
        license: 'CC0',
        url: 'https://www.makehumancommunity.org',
        note: 'Base mesh, body and face targets, skeleton weights, eyes, eyebrows, hair and most clothes (data only, via the MPFB add-on and the community asset packs).'
      },
      { name: 'Shirt (untucked)', by: 'Elvaerwyn', license: 'CC-BY', url: 'https://static.makehumancommunity.org/assets/assetpacks/shirts02.html' },
      { name: 'Shirt and tie', by: 'Elvaerwyn', license: 'CC-BY', url: 'https://static.makehumancommunity.org/assets/assetpacks/shirts02.html' },
      { name: 'Hooded jacket', by: 'Elvaerwyn', license: 'CC-BY', url: 'https://static.makehumancommunity.org/assets/assetpacks/shirts02.html' },
      { name: 'Striped shirt', by: 'EWS', license: 'CC-BY', url: 'https://static.makehumancommunity.org/assets/assetpacks/shirts02.html' },
      { name: 'Knitted sweater', by: 'Mindfront', license: 'CC-BY', url: 'https://static.makehumancommunity.org/assets/assetpacks/shirts02.html' },
      { name: 'Long cardigan', by: 'Mindfront', license: 'CC-BY', url: 'https://static.makehumancommunity.org/assets/assetpacks/shirts02.html' },
      { name: 'Blouse', by: 'punkduck', license: 'CC-BY', url: 'https://static.makehumancommunity.org/assets/assetpacks/shirts02.html' },
      { name: 'Sweater (older)', by: 'janexx', license: 'CC-BY', url: 'https://static.makehumancommunity.org/assets/assetpacks/shirts02.html' }
    ]
  },
  {
    title: 'AI engine and models (downloaded separately, not part of the app)',
    items: [
      { name: 'ComfyUI', by: 'Comfy Org', license: 'GPL-3.0', url: 'https://github.com/Comfy-Org/ComfyUI' },
      { name: 'ComfyUI_IPAdapter_plus', by: 'cubiq', license: 'GPL-3.0', url: 'https://github.com/cubiq/ComfyUI_IPAdapter_plus' },
      { name: 'RealVisXL V5.0', by: 'SG161222', license: 'OpenRAIL++-M', url: 'https://huggingface.co/SG161222/RealVisXL_V5.0' },
      { name: 'Stable Diffusion XL 1.0', by: 'Stability AI', license: 'OpenRAIL++-M', url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0' },
      { name: 'ControlNet Union SDXL ProMax', by: 'xinsir', license: 'Apache-2.0', url: 'https://huggingface.co/xinsir/controlnet-union-sdxl-1.0' },
      { name: 'IP-Adapter Plus SDXL and CLIP ViT-H image encoder', by: 'h94 (Tencent AI Lab); CLIP by LAION', license: 'Apache-2.0', url: 'https://huggingface.co/h94/IP-Adapter' },
      { name: 'TAESD live previews', by: 'Ollin Boer Bohan', license: 'MIT', url: 'https://github.com/madebyollin/taesd' }
    ]
  },
  {
    title: 'Software libraries',
    items: [
      { name: 'Electron', by: 'OpenJS Foundation', license: 'MIT', url: 'https://www.electronjs.org', note: 'Includes Chromium and Node.js; their licences ship with the app.' },
      { name: 'React', by: 'Meta Platforms', license: 'MIT', url: 'https://react.dev' },
      { name: 'three.js', by: 'three.js authors', license: 'MIT', url: 'https://threejs.org' },
      { name: 'React Three Fiber, Drei and three-stdlib', by: 'Poimandres', license: 'MIT', url: 'https://github.com/pmndrs' },
      { name: 'Zustand', by: 'Poimandres', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
      { name: 'Immer', by: 'Michel Weststrate', license: 'MIT', url: 'https://immerjs.github.io/immer' },
      { name: 'Lucide icons', by: 'Lucide contributors', license: 'ISC', url: 'https://lucide.dev' },
      { name: 'Vite, electron-vite, electron-builder, TypeScript, Vitest', license: 'MIT / Apache-2.0', url: 'https://vite.dev', note: 'Build tools; not shipped in the app.' }
    ]
  }
]
