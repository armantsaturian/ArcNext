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
