import { defineConfig } from 'vite'
import { resolve } from 'path'
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import cesium from 'vite-plugin-cesium'
import manifest from './manifest.json'

// vite-plugin-cesium injects <script src="/cesium/Cesium.js"> into EVERY html
// page. Cesium must only load inside the sandboxed iframe — on the privileged
// wrapper/sidepanel pages it runs under `script-src 'self'` and throws
// EvalError/CompileError. Strip those injected tags from every page except the
// sandbox so Cesium loads in exactly one place.
function cesiumOnlyInSandbox() {
  function stripHtml(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        stripHtml(full)
      } else if (
        entry.endsWith('.html') &&
        !entry.includes('cesium-sandbox')
      ) {
        const cleaned = readFileSync(full, 'utf8')
          .split('\n')
          .filter((line) => !line.includes('/cesium/'))
          .join('\n')
        writeFileSync(full, cleaned)
      }
    }
  }
  return {
    name: 'cesium-only-in-sandbox',
    writeBundle(options) {
      stripHtml(options.dir || resolve(__dirname, 'dist'))
    },
  }
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), cesium(), cesiumOnlyInSandbox()],
  build: {
    rollupOptions: {
      input: {
        globe: resolve(__dirname, 'src/globe/index.html'),
        'cesium-sandbox': resolve(__dirname, 'src/globe/cesium-sandbox.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
    cors: {
      origin: '*',
    },
  },
})