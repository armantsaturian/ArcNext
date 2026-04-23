# AGENTS.md

## Repo context
- ArcNext is an Electron desktop app with a React renderer, Zustand state, xterm.js terminal panes, and node-pty integration.
- The highest-risk areas are workspace/split-tree correctness, terminal session lifecycle, drag-and-drop behavior, keyboard shortcuts, and packaged-app filesystem paths.
- Packaging matters: keep an eye on `electron-builder`, `asarUnpack`, preload safety, and any shell-integration path assumptions.

## Review guidelines
- Review like a maintainer, not a rubber stamp.
- Prioritize correctness, regressions, security, missing tests, and user-visible bugs over style nits.
- Treat these as especially important:
  - pane/workspace tree mutations that can orphan or duplicate terminals
  - renderer/store mismatches that can desync visible panes from backing state
  - focus, keyboard shortcut, and drag/drop regressions
  - Electron main/preload changes that widen the app's attack surface
  - packaging or path changes that can break the packaged macOS app while working in dev
- Keep reviews concise and severity-based:
  - `High` for must-fix issues
  - `Medium` for should-fix issues
  - `Low` for optional polish
- If no concrete issue is found, say so plainly and mention what you checked.

## Commands
- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Package: `npm run package`

## Publishing a release
- Source credentials from `.env.build` before building: `source .env.build`
- Then publish via electron-builder: `electron-vite build && electron-builder --publish always`
- This requires a `GH_TOKEN` env var with repo write access, plus the Apple signing vars from `.env.build` (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
- electron-builder uploads the DMG, ZIP, **and** `latest-mac.yml` to the GitHub release. The `latest-mac.yml` file is required for `electron-updater` to detect new versions — without it, the in-app update prompt silently fails.
- Never manually upload only the DMG/ZIP to a GitHub release; the YAML metadata file will be missing and users won't get update notifications.

## Browser bridge (for agents running inside ArcNext)
- If `ARCNEXT_BRIDGE_SOCK` is set in your env, you are running inside an ArcNext terminal pane and can drive any open browser pane in the same window.
- The `arcnext-bridge` CLI is on `PATH`. Use it whenever the human asks you to observe, read, or interact with a web page — don't ask them to copy/paste or describe what they see.
- Key commands: `panes` (list open browser panes), `open <url>` (open a new pane), `snapshot <paneId>` (accessibility tree of the page), `click <paneId> <ref>`, `type <paneId> <ref> <text>`, `navigate <paneId> <url>`.
- **Always consult `arcnext-bridge --help` and `arcnext-bridge <command> --help` as the authoritative reference** — the flags and output shape there win over anything written here.
- Interaction model is ref-based: `snapshot` returns an accessibility tree where each interactable node has a ref like `e23`. Pass those refs to `click` and `type`; don't guess coordinates or CSS selectors.
- Worked example — user says *"check my LinkedIn feed and like the top post"*:
  1. `arcnext-bridge open linkedin.com/feed` → returns a `paneId`
  2. `arcnext-bridge snapshot <paneId>` → find the first post's like button, note its ref (e.g. `e42`)
  3. `arcnext-bridge click <paneId> e42`
- The human sees everything: the pane glows sky-blue while you act, and they can interrupt at any time. Don't silently do destructive things (posting, sending, deleting, purchasing) — confirm first.
