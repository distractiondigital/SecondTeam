import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

// electron-vite builds three separate bundles:
//   main     - the Node/Electron side (window management, later: ComfyUI process + network)
//   preload  - the small, safe bridge the UI is allowed to call
//   renderer - the React UI shown inside the window
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    // The version shown on the start screen.
    define: { __APP_VERSION__: JSON.stringify(version) }
  }
})
