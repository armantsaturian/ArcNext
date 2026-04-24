import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, readdirSync, chmodSync } from 'fs'
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

function buildBridgeCli() {
  return {
    name: 'build-bridge-cli',
    async writeBundle() {
      // Bundle the CLI as a single self-contained file via esbuild so it can
      // be invoked by agents from any shell without needing node_modules.
      // electron-vite's main build produces code-split chunks which won't
      // resolve correctly once we move the entry — a fresh standalone bundle
      // avoids that entire class of problem.
      //
      // Destination is `out/main/bin/` (not `out/bin/`) so that __dirname +
      // 'bin' in main.ts resolves correctly in both dev and packaged builds.
      const { build } = await import('esbuild')
      mkdirSync('out/main/bin', { recursive: true })
      const dest = 'out/main/bin/arcnext-bridge'
      await build({
        entryPoints: ['src/extensions/webbridge/cli/main.ts'],
        bundle: true,
        platform: 'node',
        target: 'node18',
        format: 'cjs',
        outfile: dest,
        banner: { js: '#!/usr/bin/env node' },
        logLevel: 'warning',
        legalComments: 'none'
      })
      chmodSync(dest, 0o755)
    }
  }
}

function buildBridgeInjected() {
  return {
    name: 'build-bridge-injected',
    async writeBundle() {
      // Bundle the page-side bridge (ariaSnapshot + roleUtils + our entry)
      // into a single IIFE loaded via CDP Page.addScriptToEvaluateOnNewDocument.
      // Output lives next to main so snapshot.ts can readFileSync it at runtime.
      const { build } = await import('esbuild')
      mkdirSync('out/main/injected', { recursive: true })
      await build({
        entryPoints: ['src/extensions/webbridge/injected/entry.ts'],
        bundle: true,
        platform: 'browser',
        target: 'chrome120',
        format: 'iife',
        outfile: 'out/main/injected/snapshot-bundle.js',
        logLevel: 'warning',
        legalComments: 'none',
        minify: true
      })
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyShellIntegration(), copyTrashblockBlockPage(), buildBridgeCli(), buildBridgeInjected()],
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
