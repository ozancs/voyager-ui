import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
import vue from '@vitejs/plugin-vue'
// `vite build --mode demo` bakes the in-browser fake Moonraker in (see src/demo/mock.js), no .env file needed
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  base: './',
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify(mode === 'demo' ? '1' : ''), __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 1500 },
}))
