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
Right-click any workspace to rename it manually or generate a contextual AI name from the current session.

![Workspaces demo](assets/demo-workspaces.gif)

### Split Panes
Terminals and browser views side by side in any layout.

![Split Panes demo](assets/demo-split-panes.gif)

### Integrated Browser
Dock any web page next to your terminals. Links open in-app. Undock back to a standalone window anytime.
ArcNext keeps its embedded Chromium current so modern sites and Cloudflare/Turnstile checks are less likely to break in-app.

![Integrated Browser demo](assets/demo-browser.gif)

### Agent bridge
Agents running in an ArcNext terminal pane can observe and drive any open browser pane through the `arcnext-bridge` CLI — snapshot the page, click, type, navigate. Presence is detected via the `ARCNEXT_BRIDGE_SOCK` env var, and the pane glows sky-blue while an agent is acting so you can watch and interrupt.
For example, ask Claude Code to "like the top post on my LinkedIn feed" and it'll open the page, snapshot it, and click the right button for you. See `arcnext-bridge --help` for the full command list.

### Smart Cmd+T
Frecency-powered picker with ghost text autocomplete. Search your directory and web history, Tab to complete, Enter to go.

![Smart Cmd+T demo](assets/demo-cmdt.gif)

## Tech Stack

Electron 41 · React 19 · TypeScript · xterm.js 6 (WebGL) · node-pty · Zustand 5 · electron-vite

## Setup

```bash
npm install
npm run dev            # development
npm run package        # production DMG (signed + notarized)
```

## Optional Integrations

A few features shell out to external CLIs that aren't bundled with ArcNext. The app works without them — those features just stay dark until you install the tool.

| Feature | Requires | Install |
|---------|----------|---------|
| XNext sidebar (X/Twitter feed + compose) | `xcli` | [github.com/armantsaturian/xcli](https://github.com/armantsaturian/xcli) |
| AI Rename (workspace auto-naming) and browser "Summarize URL" | `summarize` | [github.com/steipete/summarize](https://github.com/steipete/summarize) |

After installing, make sure the CLI is on your `PATH` (or, for `xcli`, available at `~/.pyenv/shims/xcli`). Restart ArcNext to pick it up.

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
