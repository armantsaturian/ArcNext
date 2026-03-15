import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync } from 'fs'

function copyShellIntegration() {
  return {
    name: 'copy-shell-integration',
    writeBundle() {
      mkdirSync('out/main/shell-integration', { recursive: true })
      copyFileSync('src/main/shell-integration/zshrc', 'out/main/shell-integration/.zshrc')
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyShellIntegration()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: 'src/main/main.ts'
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: 'src/preload/preload.ts'
      }
    }
  },
  renderer: {
    plugins: [react()],
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: 'src/renderer/index.html'
      }
    }
  }
})
