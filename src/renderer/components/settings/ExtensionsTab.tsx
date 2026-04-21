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

  const load = useCallback(() => {
    window.settings.trashblock.getState().then((s: TrashblockData) => {
      setTrashblockEnabled(s.enabled)
    })
    window.settings.xnext.getState().then((s: XNextData) => {
      setXnextEnabled(s.enabled)
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
        id="trashblock"
        name="TrashBlock"
        icon={trashblockIcon}
        enabled={trashblockEnabled}
        expanded={expandedId === 'trashblock'}
        onToggle={toggleTrashblock}
        onClick={() => setExpandedId(expandedId === 'trashblock' ? null : 'trashblock')}
      />
      {expandedId === 'trashblock' && (
        <div style={styles.expanded}><TrashblockSettings /></div>
      )}
      <ExtensionRow
        id="xnext"
        name="XNext"
        icon={xnextIcon}
        enabled={xnextEnabled}
        expanded={expandedId === 'xnext'}
        onToggle={toggleXnext}
        onClick={() => setExpandedId(expandedId === 'xnext' ? null : 'xnext')}
      />
    </div>
  )
}

function ExtensionRow({ name, icon, enabled, expanded, onToggle, onClick }: {
  id: string
  name: string
  icon: string
  enabled: boolean
  expanded: boolean
  onToggle: (enabled: boolean) => void
  onClick: () => void
}) {
  return (
    <div style={styles.row} onClick={onClick}>
      <img src={icon} alt="" style={styles.icon} />
      <span style={styles.name}>{name}</span>
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
  name: {
    flex: 1,
    fontSize: 13,
    color: '#e0e0e0'
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
