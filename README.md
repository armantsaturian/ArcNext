# ArcNext

You like Arc Browser? You like living in the terminal with AI agents? You'll love ArcNext.

A terminal emulator with Arc browser-style UX, built on Electron. For developers who've shifted from browser+terminal+IDE to terminal-heavy workflows.

## Why build this?

The times are changing, i spend more time in terminal than in browser. I run a dozen of agents with different context and need to jump between them. See this https://x.com/armantsaturian/status/2032392669763158205?s=20 and https://x.com/karpathy/status/2031767720933634100. We need a new surface. Arc + Terminal with proper Agent Command Control = ArcTerm.

## Features

- **Vertical sidebar tabs** — Arc-style workspace list with color picker
- **Split panes** — Vertical and horizontal splits within a workspace
- **Combined split tabs** — Multi-pane workspaces collapse into one compact sidebar row
- **Drag-and-drop** — Drop files onto a terminal pane to insert the path
- **Workspace merging** — Drag sidebar rows to merge workspaces; hold Shift for horizontal split
- **Right-click to separate** — Split merged workspaces back into individual rows
- **Collapsible sidebar** — Resize handle, traffic light hiding, Cmd+B toggle
- **Per-pane close buttons** — Hover over a merged workspace row to close individual panes

## Tech Stack

| Component | Choice |
|-----------|--------|
| Runtime | Electron 34 |
| Bundler | electron-vite + Vite 6 |
| UI | React 19 + TypeScript |
| Terminal | xterm.js 6 (WebGL, web-links, fit addons) |
| PTY | node-pty |
| State | Zustand 5 |
| Packaging | electron-builder (macOS DMG) |

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── main.ts        # Window lifecycle, IPC handlers
│   └── pty.ts         # node-pty spawning and management
├── preload/           # IPC bridge
│   └── preload.ts     # contextBridge exposing PTY API to renderer
├── renderer/          # React UI
│   ├── App.tsx        # Root component, keyboard shortcuts
│   ├── components/    # Sidebar, SplitView, TerminalPane
│   ├── model/         # splitTree (binary tree), terminalManager
│   ├── store/         # paneStore (Zustand — workspaces, splits, panes)
│   └── styles/        # global.css
└── shared/            # Shared types (IPC channel definitions)
```

## Requirements

- Node.js 20+
- macOS (target platform)

## Setup

```bash
npm install
```

## Dev

```bash
npm run dev
```

## Build

```bash
npm run build          # production build
npm run package        # build macOS DMG
```

## Automated Codex PR reviews

- Pull requests from branches in this repository trigger `.github/workflows/codex-pr-review.yml`.
- The workflow runs `openai/codex-action` using the repo's `OPENAI_API_KEY` secret.
- The prompt is based on OpenAI's published Codex PR-review example and returns structured JSON with Codex's own merge recommendation.
- Reviews are posted back to the PR as a single updatable comment from `github-actions[bot]`, and the `Codex merge recommendation` check passes or fails based on Codex's verdict.
- Draft PRs and forked PRs are skipped by design, so API secrets are not exposed to forks.


## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+T` | New workspace |
| `Cmd+D` | Split right |
| `Cmd+Shift+D` | Split down |
| `Cmd+W` | Close active pane |
| `Cmd+B` | Toggle sidebar |
| `Cmd+1-9` | Switch workspace by index |
| `Opt+Cmd+Arrows` | Navigate between panes |
| `Opt+Left/Right` | Word jump |
| `Cmd+Left/Right` | Line start / end |
| `Opt+Backspace` | Delete previous word |
| `Cmd+Backspace` | Delete to line start |

## License

MIT License. See [LICENSE](LICENSE) for details.
