import { useState, useEffect, useCallback } from 'react'
import { TrashblockSettings } from './TrashblockSettings'
import { BrowserBridgeSettings } from './BrowserBridgeSettings'
import { SettingRow, settingStyles } from './SettingRow'
import { setXNextEnabled, useXNextSnapshot } from '../../store/xnextStore'
import trashblockIcon from '../../../extensions/trashblock/icon.png'
import xnextIcon from '../../../extensions/xnext/icon.svg'
import type { TrashblockData } from '../../../extensions/trashblock/types'

export function ExtensionsTab(): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [trashblockEnabled, setTrashblockEnabled] = useState(true)
  const { enabled: xnextEnabled, xcliMissing } = useXNextSnapshot()
  const [bridgeEnabled, setBridgeEnabled] = useState(false)
  const [bridgeInstalled, setBridgeInstalled] = useState(false)
  const [bridgeBusy, setBridgeBusy] = useState(false)
  const [bridgeError, setBridgeError] = useState<string | null>(null)

  const load = useCallback(() => {
    window.settings.trashblock.getState().then((s: TrashblockData) => {
      setTrashblockEnabled(s.enabled)
    })
    window.settings.webbridge.getSettings().then((s: { enabled: boolean; installed: boolean }) => {
      setBridgeEnabled(s.enabled)
      setBridgeInstalled(s.installed)
    })
  }, [])

  useEffect(() => {
    load()
    const unsub1 = window.settings.trashblock.onChanged(load)
    return () => { unsub1() }
  }, [load])

  const toggleTrashblock = (enabled: boolean) => {
    setTrashblockEnabled(enabled)
    window.settings.trashblock.setEnabled(enabled)
  }

  const toggleXnext = (enabled: boolean) => {
    setXNextEnabled(enabled)
  }

  const toggleBridgeEnabled = async (on: boolean) => {
    setBridgeBusy(true)
    setBridgeError(null)
    try {
      await window.settings.webbridge.setEnabled(on)
      setBridgeEnabled(on)
    } catch (err) {
      setBridgeError(err instanceof Error ? err.message : String(err))
    } finally {
      setBridgeBusy(false)
    }
  }

  const toggleBridgeInstalled = async (on: boolean) => {
    setBridgeBusy(true)
    setBridgeError(null)
    try {
      const result = await window.settings.webbridge.setInstalled(on)
      if (result.ok) setBridgeInstalled(on)
      else setBridgeError((result.errors?.[0]) || 'Install failed')
    } catch (err) {
      setBridgeError(err instanceof Error ? err.message : String(err))
    } finally {
      setBridgeBusy(false)
    }
  }

  return (
    <div>
      <SettingRow
        name="Browser Bridge"
        icon={'🌐'}
        enabled={bridgeEnabled}
        onToggle={toggleBridgeEnabled}
        disabled={bridgeBusy}
        onClick={() => setExpandedId(expandedId === 'webbridge' ? null : 'webbridge')}
        subtitle={bridgeError
          ? <span style={settingStyles.error}>{bridgeError}</span>
          : <>Let AI agents see and drive browser panes via <code style={settingStyles.code}>arcnext-bridge</code></>}
      />
      {expandedId === 'webbridge' && (
        <div style={settingStyles.expanded}>
          <BrowserBridgeSettings
            enabled={bridgeEnabled}
            installed={bridgeInstalled}
            busy={bridgeBusy}
            onSetInstalled={toggleBridgeInstalled}
          />
        </div>
      )}
      <SettingRow
        name="TrashBlock"
        icon={trashblockIcon}
        enabled={trashblockEnabled}
        onToggle={toggleTrashblock}
        onClick={() => setExpandedId(expandedId === 'trashblock' ? null : 'trashblock')}
      />
      {expandedId === 'trashblock' && (
        <div style={settingStyles.expanded}><TrashblockSettings /></div>
      )}
      <SettingRow
        name="XNext"
        icon={xnextIcon}
        enabled={xnextEnabled}
        onToggle={toggleXnext}
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
