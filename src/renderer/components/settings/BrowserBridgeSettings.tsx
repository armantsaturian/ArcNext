interface Props {
  enabled: boolean
  installed: boolean
  busy: boolean
  onSetInstalled: (on: boolean) => void
}

export function BrowserBridgeSettings({ enabled, installed, busy, onSetInstalled }: Props): JSX.Element {
  return (
    <div style={styles.panel}>
      <p style={styles.para}>
        {enabled
          ? <>The bridge is running. Agents in ArcNext-spawned terminals can use <code style={styles.code}>arcnext-bridge</code> immediately.</>
          : <>The bridge is off. No socket is listening and the CLI can't connect.</>}
      </p>
      <p style={styles.para}>
        You'll see a sky-blue glow on the pane and the sidebar when an agent is
        acting. Click or type on the page anytime to take over — the agent yields.
      </p>

      <div style={styles.subRow}>
        <div style={styles.subRowText}>
          <div style={styles.subRowTitle}>Install CLI + agent docs system-wide</div>
          <div style={styles.subRowSubtitle}>
            Symlinks <code style={styles.code}>~/.local/bin/arcnext-bridge</code> and adds a short
            instructions block to Claude/Codex/OpenCode's user-global agent config files.
            Needed only if you want agents running <em>outside</em> ArcNext (Terminal.app, iTerm, etc.)
            to use the bridge.
          </div>
        </div>
        <div
          style={{
            ...styles.toggle,
            ...(installed ? styles.toggleOn : styles.toggleOff),
            ...(busy ? styles.toggleBusy : {})
          }}
          onClick={() => { if (!busy) onSetInstalled(!installed) }}
        >
          <div style={{ ...styles.knob, ...(installed ? styles.knobOn : styles.knobOff) }} />
        </div>
      </div>

      {installed && (
        <div style={styles.installedDetails}>
          <div style={styles.strong}>Files installed</div>
          <ul style={styles.list}>
            <li style={styles.li}><code style={styles.code}>~/.local/bin/arcnext-bridge</code></li>
            <li style={styles.li}><code style={styles.code}>~/.claude/CLAUDE.md</code></li>
            <li style={styles.li}><code style={styles.code}>~/.codex/AGENTS.md</code></li>
            <li style={styles.li}><code style={styles.code}>~/.config/opencode/AGENTS.md</code></li>
          </ul>
          <div style={styles.fineprint}>
            Turn the install off to remove the CLI and strip only the injected block from agent files — surrounding content is preserved.
          </div>
        </div>
      )}
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
  subRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    margin: '10px 0 0',
    padding: '8px 10px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.03)'
  },
  subRowText: {
    flex: 1
  },
  subRowTitle: {
    fontSize: 12,
    color: '#e0e0e0',
    marginBottom: 2
  },
  subRowSubtitle: {
    fontSize: 11,
    color: '#888'
  },
  toggle: {
    width: 32,
    height: 18,
    borderRadius: 9,
    cursor: 'pointer',
    position: 'relative' as const,
    flexShrink: 0,
    transition: 'background 0.2s',
    marginTop: 2
  },
  toggleOn: { background: '#4ecca3' },
  toggleOff: { background: 'rgba(255,255,255,0.15)' },
  toggleBusy: { opacity: 0.5, cursor: 'wait' },
  knob: {
    width: 14,
    height: 14,
    borderRadius: 7,
    background: '#fff',
    position: 'absolute' as const,
    top: 2,
    transition: 'left 0.2s'
  },
  knobOn: { left: 16 },
  knobOff: { left: 2 },
  installedDetails: {
    marginTop: 10
  },
  strong: {
    color: '#e0e0e0',
    fontSize: 12,
    marginBottom: 4
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
    margin: '6px 0 0',
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
