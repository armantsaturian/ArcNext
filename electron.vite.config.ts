import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

function copyShellIntegration() {
  return {
    name: 'copy-shell-integration',
    writeBundle() {
      mkdirSync('out/main/shell-integration', { recursive: true })
      copyFileSync('src/main/shell-integration/zshrc', 'out/main/shell-integration/.zshenv')
    }
  }
}

function copyTrashblockBlockPage() {
  return {
    name: 'copy-trashblock-blockpage',
    writeBundle() {
      const src = 'src/extensions/trashblock/blockPage'
      const dest = 'out/main/extensions/trashblock/blockPage'
      mkdirSync(dest, { recursive: true })
      for (const file of readdirSync(src)) {
        copyFileSync(join(src, file), join(dest, file))
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyShellIntegration(), copyTrashblockBlockPage()],
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
          quitDialogPreload: resolve(__dirname, 'src/preload/quitDialogPreload.ts'),
          fdaDialogPreload: resolve(__dirname, 'src/preload/fdaDialogPreload.ts'),
          settingsPreload: resolve(__dirname, 'src/preload/settingsPreload.ts')
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
          quitDialog: resolve(__dirname, 'src/renderer/quit-dialog.html'),
          fdaDialog: resolve(__dirname, 'src/renderer/fda-dialog.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html')
        }
      }
    }
  }
})
