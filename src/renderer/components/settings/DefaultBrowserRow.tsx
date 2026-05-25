import { useEffect, useState } from 'react'

interface DefaultBrowserStatus {
  available: boolean
  isDefault: boolean
}

export function DefaultBrowserRow(): JSX.Element {
  const [status, setStatus] = useState<DefaultBrowserStatus>({ available: false, isDefault: false })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const refresh = () => {
      window.settings.defaultBrowser.getStatus().then((nextStatus) => {
        setStatus(nextStatus)
        setMessage('')
      }).catch(() => {})
    }

    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const makeDefault = async () => {
    setBusy(true)
    setMessage('')
    try {
      const result = await window.settings.defaultBrowser.setAsDefault()
      setStatus({ available: result.available, isDefault: result.isDefault })

      if (!result.available) {
        setMessage('Available in packaged macOS builds.')
      } else if (result.isDefault) {
        setMessage('ArcNext is now your default browser.')
      } else if (result.ok) {
        setMessage('If macOS asks for confirmation, choose ArcNext.')
      } else {
        setMessage('macOS did not accept the change. Try selecting ArcNext in System Settings.')
      }
    } catch {
      setMessage('Could not update the default browser setting.')
    } finally {
      setBusy(false)
    }
  }

  const disabled = !status.available || status.isDefault || busy

  return (
    <div style={styles.row}>
      <span style={styles.iconEmoji}>🌐</span>
      <div style={styles.nameCol}>
        <span style={styles.name}>Default browser</span>
        <span style={styles.subtitle}>
          {status.isDefault
            ? 'ArcNext handles HTTP and HTTPS links.'
            : status.available
              ? 'Open links from other apps as ArcNext browser workspaces.'
              : 'Available in packaged macOS builds.'}
        </span>
        {message && (
          <span style={status.isDefault ? styles.success : styles.message}>{message}</span>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={makeDefault}
        style={{
          ...styles.button,
          ...(disabled ? styles.buttonDisabled : {})
        }}
      >
        {busy ? 'Setting…' : status.isDefault ? 'Default' : 'Make Default'}
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    minHeight: 52,
    borderRadius: 6,
    gap: 8
  },
  iconEmoji: {
    width: 20,
    height: 20,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    flexShrink: 0
  },
  nameCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0
  },
  name: { fontSize: 13, color: '#e0e0e0' },
  subtitle: { fontSize: 11, color: '#888' },
  message: { fontSize: 11, color: '#ffb86c' },
  success: { fontSize: 11, color: '#4ecca3' },
  button: {
    padding: '5px 10px',
    fontSize: 12,
    background: '#4ecca3',
    color: '#101010',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    fontWeight: 600,
    flexShrink: 0
  },
  buttonDisabled: {
    opacity: 0.55,
    cursor: 'default'
  }
}
