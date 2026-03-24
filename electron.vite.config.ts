import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

function copyShellIntegration() {
  return {
    name: 'copy-shell-integration',
    writeBundle() {
      mkdirSync('out/main/shell-integration', { recursive: true })
      copyFileSync('src/main/shell-integration/zshrc', 'out/main/shell-integration/.zshenv')
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
        input: {
          preload: resolve(__dirname, 'src/preload/preload.ts'),
          externalShellPreload: resolve(__dirname, 'src/preload/externalShellPreload.ts'),
          quitDialogPreload: resolve(__dirname, 'src/preload/quitDialogPreload.ts'),
          fdaDialogPreload: resolve(__dirname, 'src/preload/fdaDialogPreload.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          externalShell: resolve(__dirname, 'src/renderer/external-shell.html'),
          quitDialog: resolve(__dirname, 'src/renderer/quit-dialog.html'),
          fdaDialog: resolve(__dirname, 'src/renderer/fda-dialog.html')
        }
      }
    }
  }
})
