<p align="center">
  <img src="arcnext.png" width="128" alt="ArcNext logo" />
</p>

<h1 align="center">ArcNext</h1>

<p align="center">
  Arc x Terminal = ArcNext. Built for the Agentic Era.
</p>

---

A terminal emulator that treats shells the way Arc treats tabs — workspaces, split panes, and a fully integrated browser side by side. One app for everything you need while coding with AI agents.

## Why?

See the [original motivation](https://x.com/armantsaturian/status/2032392669763158205) and [Karpathy's take on the shift](https://x.com/karpathy/status/2031767720933634100).

## Features

### Workspaces
Vertical sidebar with Arc-style tabs. Drag to merge, color-code, pin, sleep.

![Workspaces demo](assets/demo-workspaces.gif)

### Split Panes
Terminals and browser views side by side in any layout.

![Split Panes demo](assets/demo-split-panes.gif)

### Integrated Browser
Dock any web page next to your terminals. Links open in-app. Undock back to a standalone window anytime.

![Integrated Browser demo](assets/demo-browser.gif)

### Smart Cmd+T
Frecency-powered picker with ghost text autocomplete. Search your directory and web history, Tab to complete, Enter to go.

![Smart Cmd+T demo](assets/demo-cmdt.gif)

## Tech Stack

Electron 34 · React 19 · TypeScript · xterm.js 6 (WebGL) · node-pty · Zustand 5 · electron-vite

## Setup

```bash
npm install
npm run dev            # development
npm run package        # production DMG (signed + notarized)
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+T` | New tab picker |
| `Cmd+D` / `Cmd+Shift+D` | Split right / down |
| `Cmd+W` | Close pane |
| `Cmd+B` | Toggle sidebar |
| `Cmd+1-9` | Switch workspace |
| `Opt+Cmd+Arrows` | Navigate panes |

## License

MIT
