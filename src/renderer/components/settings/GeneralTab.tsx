import { useState, useEffect } from 'react'
import { SettingRow } from './SettingRow'

export function GeneralTab(): JSX.Element {
  const [betaChannel, setBetaChannel] = useState(false)

  useEffect(() => {
    window.settings.betaChannel.getSettings().then((s: { allowPrerelease: boolean }) => {
      setBetaChannel(s.allowPrerelease)
    })
  }, [])

  const toggleBetaChannel = async (on: boolean) => {
    setBetaChannel(on)
    await window.settings.betaChannel.setAllowPrerelease(on)
  }

  return (
    <div>
      <SettingRow
        name="Beta updates"
        icon={'\u{1F9EA}'}
        enabled={betaChannel}
        onToggle={toggleBetaChannel}
        onClick={() => {}}
        subtitle={<>Receive pre-release builds (marked as pre-release on GitHub) alongside stable.</>}
      />
    </div>
  )
}
