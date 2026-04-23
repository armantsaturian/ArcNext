export function BrowserBridgeSettings({ installed }: { installed: boolean }): JSX.Element {
  if (!installed) {
    return (
      <div style={styles.panel}>
        <p style={styles.para}>
          When enabled, ArcNext installs an <code style={styles.code}>arcnext-bridge</code> CLI
          on your system and adds a short usage note to Claude, Codex, and OpenCode's
          user-global instructions. Your AI coding agents can then see and drive the
          browser panes you have open in ArcNext.
        </p>
        <p style={styles.para}>
          You'll see a sky-blue glow on the pane and the sidebar when an agent is
          acting. Click or type on the page anytime to take over — the agent yields.
        </p>
      </div>
    )
  }

  return (
    <div style={styles.panel}>
      <p style={styles.para}>
        The bridge is installed. Your AI agents can run <code style={styles.code}>arcnext-bridge --help</code> to
        see the available commands.
      </p>
      <p style={styles.section}><strong style={styles.strong}>Files installed</strong></p>
      <ul style={styles.list}>
        <li style={styles.li}><code style={styles.code}>~/.local/bin/arcnext-bridge</code> — CLI symlink</li>
        <li style={styles.li}><code style={styles.code}>~/.claude/CLAUDE.md</code> — Claude Code instructions</li>
        <li style={styles.li}><code style={styles.code}>~/.codex/AGENTS.md</code> — Codex instructions</li>
        <li style={styles.li}><code style={styles.code}>~/.config/opencode/AGENTS.md</code> — OpenCode instructions</li>
      </ul>
      <p style={styles.fineprint}>
        Turn this off to remove the CLI and strip the injected block from agent
        instructions. Only the block we added is removed; everything else stays.
      </p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    fontSize: 12,
    color: '#ccc',
    lineHeight: 1.55
  },
  para: {
    margin: '0 0 8px'
  },
  section: {
    margin: '10px 0 4px'
  },
  strong: {
    color: '#e0e0e0',
    fontSize: 12
  },
  list: {
    margin: '0 0 6px 16px',
    padding: 0
  },
  li: {
    margin: '2px 0',
    listStyle: 'disc'
  },
  fineprint: {
    margin: '8px 0 0',
    fontSize: 11,
    color: '#888'
  },
  code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    color: '#c5d3e0',
    background: 'rgba(255,255,255,0.06)',
    padding: '1px 5px',
    borderRadius: 3
  }
}
