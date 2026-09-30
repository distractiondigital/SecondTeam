import { defineConfig } from 'vitest/config'

// Only our own tests: never crawl the ComfyUI folder (its custom nodes ship their own test files).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts']
  }
})
