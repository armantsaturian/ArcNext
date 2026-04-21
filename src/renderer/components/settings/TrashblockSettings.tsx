import { useState, useEffect, useRef, useCallback } from 'react'
import type { TrashblockData } from '../../../extensions/trashblock/types'

declare global {
  interface Window {
    settings: {
      trashblock: {
        getState: () => Promise<TrashblockData>
        setEnabled: (enabled: boolean) => Promise<void>
        addSite: (domain: string) => Promise<boolean>
        removeSite: (domain: string) => Promise<{ needsChallenge: boolean }>
        savePhrase: (phrase: string) => Promise<{ saved?: boolean; needsChallenge?: boolean }>
        saveDays: (days: number[]) => Promise<{ saved?: boolean; needsChallenge?: boolean }>
        onChanged: (cb: () => void) => () => void
      }
    }
  }
}

const DAYS = [
  { day: 1, label: 'M' },
  { day: 2, label: 'T' },
  { day: 3, label: 'W' },
  { day: 4, label: 'T' },
  { day: 5, label: 'F' },
  { day: 6, label: 'S' },
  { day: 0, label: 'S' }
]

export function TrashblockSettings(): JSX.Element {
  const [state, setState] = useState<TrashblockData | null>(null)
  const [phraseInput, setPhraseInput] = useState('')
  const [siteInput, setSiteInput] = useState('')
  const [phraseStatus, setPhraseStatus] = useState('')
  const [dayStatus, setDayStatus] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [, tick] = useState(0)

  const load = useCallback(() => {
    window.settings.trashblock.getState().then(s => {
      setState(s)
      setPhraseInput(s.unlockPhrase)
    })
  }, [])

  useEffect(() => {
    load()
    return window.settings.trashblock.onChanged(load)
  }, [load])

  useEffect(() => {
    if (!state) return
    const hasActive = Object.values(state.unlockedSites).some(exp => exp > Date.now())
    if (hasActive) {
      timerRef.current = setInterval(() => tick(n => n + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state])

  if (!state) return <div />

  const savePhrase = async () => {
    if (!phraseInput.trim()) return
    const r = await window.settings.trashblock.savePhrase(phraseInput)
    if (r.saved) { setPhraseStatus('Saved!'); setTimeout(() => setPhraseStatus(''), 2000) }
  }

  const toggleDay = async (day: number) => {
    const days = state.activeDays.includes(day)
      ? state.activeDays.filter(d => d !== day)
      : [...state.activeDays, day]
    const r = await window.settings.trashblock.saveDays(days)
    if (r.saved) {
      setState({ ...state, activeDays: days, daysConfigured: true })
      setDayStatus('Saved!')
      setTimeout(() => setDayStatus(''), 2000)
    }
  }

  const addSite = async () => {
    if (!siteInput.trim()) return
    if (await window.settings.trashblock.addSite(siteInput)) setSiteInput('')
    load()
  }

  const now = Date.now()
  const unlocks = Object.entries(state.unlockedSites).filter(([, exp]) => exp > now)

  return (
    <div>
      <Label>Unlock Phrase</Label>
      <div style={s.row}>
        <input style={s.input} value={phraseInput} onChange={e => setPhraseInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && savePhrase()} placeholder="Type your unlock phrase..." />
        <button style={s.btn} onClick={savePhrase}>Save</button>
      </div>
      {phraseStatus && <p style={s.hint}>{phraseStatus}</p>}

      <Label>Active Days</Label>
      <div style={s.dayRow}>
        {DAYS.map(({ day, label }) => (
          <button key={day} onClick={() => toggleDay(day)}
            style={{ ...s.dayBtn, ...(state.activeDays.includes(day) ? s.dayOn : {}) }}>
            {label}
          </button>
        ))}
      </div>
      {dayStatus && <p style={s.hint}>{dayStatus}</p>}

      <Label>Blocked Sites</Label>
      <div style={s.row}>
        <input style={s.input} value={siteInput} onChange={e => setSiteInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSite()} placeholder="example.com" />
        <button style={s.btn} onClick={addSite}>Add</button>
      </div>
      {state.blockedSites.length === 0
        ? <p style={s.empty}>No sites blocked yet.</p>
        : <ul style={s.list}>{state.blockedSites.map(d => (
            <li key={d} style={s.item}>
              <span style={s.domain}>{d}</span>
              <button style={s.removeBtn} onClick={() => window.settings.trashblock.removeSite(d)}>Remove</button>
            </li>
          ))}</ul>
      }

      {unlocks.length > 0 && <>
        <Label>Temporarily Unlocked</Label>
        <ul style={s.list}>{unlocks.map(([d, exp]) => (
          <li key={d} style={s.item}>
            <span style={s.domain}>{d}</span>
            <span style={s.countdown}>{fmt(exp - now)}</span>
          </li>
        ))}</ul>
      </>}
    </div>
  )
}

function Label({ children }: { children: string }) {
  return <h2 style={s.label}>{children}</h2>
}

function fmt(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

const s: Record<string, React.CSSProperties> = {
  label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '12px 0 4px', fontWeight: 600 },
  row: { display: 'flex', gap: 6 },
  input: { flex: 1, padding: '6px 8px', fontSize: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#e0e0e0', outline: 'none', fontFamily: 'inherit' },
  btn: { padding: '6px 10px', fontSize: 12, background: '#e94560', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 500 },
  hint: { fontSize: 11, color: '#4ecca3', marginTop: 2 },
  dayRow: { display: 'flex', gap: 4 },
  dayBtn: { width: 28, height: 28, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#666', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all 0.15s' },
  dayOn: { background: '#e94560', borderColor: '#e94560', color: '#fff' },
  list: { listStyle: 'none', marginTop: 4, padding: 0 },
  item: { display: 'flex', alignItems: 'center', padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 5, marginBottom: 2, fontSize: 12 },
  domain: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  removeBtn: { padding: '1px 6px', fontSize: 10, background: 'rgba(255,255,255,0.08)', color: '#888', border: 'none', borderRadius: 3, cursor: 'pointer', marginLeft: 6 },
  countdown: { color: '#4ecca3', fontSize: 11, marginLeft: 6, fontFamily: '"SF Mono", monospace' },
  empty: { fontSize: 11, color: '#555', marginTop: 4, fontStyle: 'italic' }
}
