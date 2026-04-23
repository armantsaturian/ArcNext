import { useState, useEffect, useCallback } from 'react'
import { TrashblockSettings } from './TrashblockSettings'
import trashblockIcon from '../../../extensions/trashblock/icon.png'
import xnextIcon from '../../../extensions/xnext/icon.svg'
import type { TrashblockData } from '../../../extensions/trashblock/types'
import type { XNextData } from '../../../extensions/xnext/types'

export function ExtensionsTab(): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [trashblockEnabled, setTrashblockEnabled] = useState(true)
  const [xnextEnabled, setXnextEnabled] = useState(true)
  const [xcliMissing, setXcliMissing] = useState(false)

  const load = useCallback(() => {
    window.settings.trashblock.getState().then((s: TrashblockData) => {
      setTrashblockEnabled(s.enabled)
    })
    window.settings.xnext.getState().then((s: XNextData) => {
      setXnextEnabled(s.enabled)
    })
    window.settings.xnext.checkAvailable().then(({ available }) => {
      setXcliMissing(!available)
    })
  }, [])

  useEffect(() => {
    load()
    const unsub1 = window.settings.trashblock.onChanged(load)
    const unsub2 = window.settings.xnext.onChanged(load)
    return () => { unsub1(); unsub2() }
  }, [load])

  const toggleTrashblock = (enabled: boolean) => {
    setTrashblockEnabled(enabled)
    window.settings.trashblock.setEnabled(enabled)
  }

  const toggleXnext = (enabled: boolean) => {
    setXnextEnabled(enabled)
    window.settings.xnext.setEnabled(enabled)
  }

  return (
    <div>
      <ExtensionRow
        name="TrashBlock"
        icon={trashblockIcon}
        enabled={trashblockEnabled}
        onToggle={toggleTrashblock}
        onClick={() => setExpandedId(expandedId === 'trashblock' ? null : 'trashblock')}
      />
      {expandedId === 'trashblock' && (
        <div style={styles.expanded}><TrashblockSettings /></div>
      )}
      <ExtensionRow
        name="XNext"
        icon={xnextIcon}
        enabled={xnextEnabled}
        onToggle={toggleXnext}
        onClick={() => setExpandedId(expandedId === 'xnext' ? null : 'xnext')}
        subtitle={xcliMissing ? (
          <>
            Requires <code style={styles.code}>xcli</code>.{' '}
            <a
              href="https://github.com/armantsaturian/xcli"
              target="_blank"
              rel="noreferrer"
              style={styles.link}
              onClick={(e) => e.stopPropagation()}
            >
              Install →
            </a>
          </>
        ) : undefined}
      />
    </div>
  )
}

function ExtensionRow({ name, icon, enabled, onToggle, onClick, subtitle }: {
  name: string
  icon: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  onClick: () => void
  subtitle?: React.ReactNode
}) {
  return (
    <div style={styles.row} onClick={onClick}>
      <img src={icon} alt="" style={styles.icon} />
      <div style={styles.nameCol}>
        <span style={styles.name}>{name}</span>
        {subtitle && <span style={styles.subtitle}>{subtitle}</span>}
      </div>
      <div
        style={{ ...styles.toggle, ...(enabled ? styles.toggleOn : styles.toggleOff) }}
        onClick={(e) => { e.stopPropagation(); onToggle(!enabled) }}
      >
        <div style={{ ...styles.knob, ...(enabled ? styles.knobOn : styles.knobOff) }} />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    gap: 8
  },
  icon: {
    width: 20,
    height: 20,
    borderRadius: 4,
    flexShrink: 0
  },
  nameCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0
  },
  name: {
    fontSize: 13,
    color: '#e0e0e0'
  },
  subtitle: {
    fontSize: 11,
    color: '#888'
  },
  code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 10,
    color: '#bbb',
    background: 'rgba(255,255,255,0.06)',
    padding: '1px 4px',
    borderRadius: 3
  },
  link: {
    color: '#67b3ff',
    textDecoration: 'none'
  },
  toggle: {
    width: 32,
    height: 18,
    borderRadius: 9,
    cursor: 'pointer',
    position: 'relative' as const,
    flexShrink: 0,
    transition: 'background 0.2s'
  },
  toggleOn: { background: '#4ecca3' },
  toggleOff: { background: 'rgba(255,255,255,0.15)' },
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
  expanded: {
    padding: '4px 8px 12px 36px'
  }
}
