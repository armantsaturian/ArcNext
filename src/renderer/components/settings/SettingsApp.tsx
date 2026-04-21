import { useState } from 'react'
import { ExtensionsTab } from './ExtensionsTab'

const tabs = [
  { id: 'extensions', label: 'Extensions', icon: '\u29C9' }
] as const

export function SettingsApp(): JSX.Element {
  const [activeTab, setActiveTab] = useState<string>('extensions')

  return (
    <div style={styles.root}>
      <div style={styles.fixedHeader}>
        <div style={styles.dragRegion} />
        <div style={styles.tabBar}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.tabBtn,
                ...(activeTab === tab.id ? styles.tabBtnActive : {})
              }}
            >
              <span style={styles.tabIcon}>{tab.icon}</span>
              <span style={styles.tabLabel}>{tab.label}</span>
            </button>
          ))}
        </div>
        <div style={styles.divider} />
      </div>
      <div style={styles.content}>
        {activeTab === 'extensions' && <ExtensionsTab />}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#e0e0e0',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    overflow: 'hidden'
  },
  fixedHeader: {
    flexShrink: 0,
    position: 'relative' as const,
    zIndex: 1
  },
  dragRegion: {
    height: 36,
    WebkitAppRegion: 'drag' as unknown as undefined
  },
  tabBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: 2,
    padding: '0 12px 8px'
  },
  tabBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    padding: '4px 10px',
    background: 'none',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background 0.15s',
    minWidth: 52
  },
  tabBtnActive: {
    background: 'rgba(255,255,255,0.1)'
  },
  tabIcon: {
    fontSize: 16,
    lineHeight: '20px'
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: 500,
    color: '#aaa',
    letterSpacing: 0.2
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.06)'
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 16px'
  }
}
