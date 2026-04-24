import { useState } from 'react'
import { ExtensionsTab } from './ExtensionsTab'
import { GeneralTab } from './GeneralTab'

const tabs = [
  { id: 'general', label: 'General', icon: '⚙' },
  { id: 'extensions', label: 'Extensions', icon: '⧉' }
] as const

export function SettingsApp(): JSX.Element {
  const [activeTab, setActiveTab] = useState<string>('general')

  return (
    <div style={styles.root}>
      <div style={styles.fixedHeader}>
        <div style={styles.dragRegion} />
        <div style={styles.tabBar}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...styles.tabBtn,
                  ...(isActive ? styles.tabBtnActive : {})
                }}
              >
                <span style={{ ...styles.tabIcon, ...(isActive ? styles.tabIconActive : {}) }}>{tab.icon}</span>
                <span style={{ ...styles.tabLabel, ...(isActive ? styles.tabLabelActive : {}) }}>{tab.label}</span>
              </button>
            )
          })}
        </div>
        <div style={styles.divider} />
      </div>
      <div style={styles.content}>
        {activeTab === 'general' && <GeneralTab />}
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
    height: 28,
    WebkitAppRegion: 'drag' as unknown as undefined
  },
  tabBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: 2,
    padding: '0 12px 6px'
  },
  tabBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '6px 0',
    background: 'none',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    width: 88
  },
  tabBtnActive: {
    background: 'rgba(116,192,252,0.18)'
  },
  tabIcon: {
    fontSize: 16,
    lineHeight: '20px',
    color: 'rgba(255,255,255,0.55)',
    transition: 'color 0.15s'
  },
  tabIconActive: {
    color: '#74c0fc'
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.2,
    transition: 'color 0.15s'
  },
  tabLabelActive: {
    color: '#74c0fc'
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
