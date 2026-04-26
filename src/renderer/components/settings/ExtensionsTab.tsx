import { useState } from 'react'
import { TrashblockSettings } from './TrashblockSettings'
import { BrowserBridgeSettings } from './BrowserBridgeSettings'
import { SettingRow, settingStyles } from './SettingRow'
import { setTrashblockEnabled, useTrashblockSnapshot } from '../../store/trashblockStore'
import { setWebBridgeEnabled, setWebBridgeInstalled, useWebBridgeSnapshot } from '../../store/webbridgeStore'
import { setXNextEnabled, useXNextSnapshot } from '../../store/xnextStore'
import trashblockIcon from '../../../extensions/trashblock/icon.png'
import xnextIcon from '../../../extensions/xnext/icon.svg'

export function ExtensionsTab(): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { enabled: trashblockEnabled } = useTrashblockSnapshot()
  const { enabled: xnextEnabled, xcliMissing } = useXNextSnapshot()
  const bridge = useWebBridgeSnapshot()

  return (
    <div>
      <SettingRow
        name="Browser Bridge"
        icon={'🌐'}
        enabled={bridge.enabled}
        onToggle={setWebBridgeEnabled}
        disabled={bridge.busy}
        onClick={() => setExpandedId(expandedId === 'webbridge' ? null : 'webbridge')}
        subtitle={bridge.error
          ? <span style={settingStyles.error}>{bridge.error}</span>
          : <>Let AI agents see and drive browser panes via <code style={settingStyles.code}>arcnext-bridge</code></>}
      />
      {expandedId === 'webbridge' && (
        <div style={settingStyles.expanded}>
          <BrowserBridgeSettings
            enabled={bridge.enabled}
            installed={bridge.installed}
            busy={bridge.busy}
            onSetInstalled={setWebBridgeInstalled}
          />
        </div>
      )}
      <SettingRow
        name="TrashBlock"
        icon={trashblockIcon}
        enabled={trashblockEnabled}
        onToggle={setTrashblockEnabled}
        onClick={() => setExpandedId(expandedId === 'trashblock' ? null : 'trashblock')}
      />
      {expandedId === 'trashblock' && (
        <div style={settingStyles.expanded}><TrashblockSettings /></div>
      )}
      <SettingRow
        name="XNext"
        icon={xnextIcon}
        enabled={xnextEnabled}
        onToggle={setXNextEnabled}
        onClick={() => setExpandedId(expandedId === 'xnext' ? null : 'xnext')}
        subtitle={xcliMissing ? (
          <>
            Requires <code style={settingStyles.code}>xcli</code>.{' '}
            <a
              href="https://github.com/armantsaturian/xcli"
              target="_blank"
              rel="noreferrer"
              style={settingStyles.link}
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
