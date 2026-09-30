import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron-vite builds three separate bundles:
//   main     - the Node/Electron side (window management, later: ComfyUI process + network)
//   preload  - the small, safe bridge the UI is allowed to call
//   renderer - the React UI shown inside the window
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
