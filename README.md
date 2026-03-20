<p align="center">
  <img src="arcnext.png" width="128" alt="ArcNext logo" />
</p>

<h1 align="center">ArcNext</h1>

<p align="center">
  Arc x Terminal = ArcNext. Build for Agentic Era.
</p>

---

ArcNext treats terminals the way Arc treats browser tabs — organized into workspaces with a vertical sidebar, split panes, and a **fully integrated web browser** that lets you dock web pages right alongside your shells. It's a terminal emulator and browser combined for the agentic era.

## Why build this?

See the [original motivation](https://x.com/armantsaturian/status/2032392669763158205) and [Karpathy's take on the shift](https://x.com/karpathy/status/2031767720933634100).

## Features

- **Vertical sidebar tabs** — Arc-style workspace list with color picker
- **Split panes** — Vertical and horizontal splits within a workspace
- **Combined split tabs** — Multi-pane workspaces collapse into one compact sidebar row
- **Drag-and-drop** — Drop files onto a terminal pane to insert the path
- **Workspace merging** — Drag sidebar rows to merge workspaces; hold Shift for horizontal split
- **Right-click to separate** — Split merged workspaces back into individual rows
- **Collapsible sidebar** — Resize handle, traffic light hiding, Cmd+B toggle
- **Per-pane close buttons** — Hover over a merged workspace row to close individual panes
- **External browser windows** — Terminal links open in a dedicated browser window shell
- **Dock / undock browser tabs** — Dock an external website into ArcNext as a new workspace without reloading, or undock it back out to its own window

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
│   ├── browserViewManager.ts
│   ├── browserViewUtils.ts
│   ├── externalBrowserWindows.ts
│   └── pty.ts         # node-pty spawning and management
├── preload/           # IPC bridges
│   ├── preload.ts
│   └── externalShellPreload.ts
├── renderer/          # React UI + external browser shell UI
│   ├── App.tsx        # Root component, keyboard shortcuts
│   ├── external-shell.html
│   ├── externalShell.ts
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
| `Cmd+Shift+Enter` | Undock active browser pane |
| `Cmd+W` | Close active pane |
| `Cmd+B` | Toggle sidebar |
| `Cmd+1-9` | Switch workspace by index |
| `Opt+Cmd+Arrows` | Navigate between panes |
| `Opt+Left/Right` | Word jump |
| `Cmd+Left/Right` | Line start / end |
| `Opt+Backspace` | Delete previous word |
| `Cmd+Backspace` | Delete to line start |

## External browser controls

- Clicking a link in a terminal opens it in an external browser window.
- The external browser window has a visible **Dock** button plus a native menu item.
- **Dock shortcut (external window):** `Cmd+Shift+D` on macOS / `Ctrl+Shift+D` on Windows/Linux.
- Docking always creates a **new workspace** in ArcNext.
- Docked browser panes have a visible **Undock** button, and `Cmd+Shift+Enter` undocks the active browser pane.

## License

MIT License. See [LICENSE](LICENSE) for details.
