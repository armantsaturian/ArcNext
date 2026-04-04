import { useCallback, useEffect } from 'react'
import { usePaneStore } from '../store/paneStore'
import { startAudioCapture, stopAudioCapture } from '../audio/audioCapture'

interface Props {
  paneId: string
}

export default function DictationButton({ paneId }: Props) {
  const agentState = usePaneStore((s) => s.agentStates.get(paneId))
  const dictationState = usePaneStore((s) => s.dictationStates.get(paneId))
  const setDictationState = usePaneStore((s) => s.setDictationState)

  const isRecording = dictationState?.status === 'recording'
  const isDownloading = dictationState?.status === 'downloading'
  const isDenied = dictationState?.status === 'denied'

  const handleToggle = useCallback(async () => {
    if (isRecording) {
      await stopAudioCapture()
      window.arcnext.dictation.stop(paneId)
      setDictationState(paneId, null)
      return
    }

    // Request macOS mic permission (triggers OS dialog if not yet determined)
    const micStatus = await window.arcnext.dictation.checkMicPermission()
    if (micStatus === 'denied' || micStatus === 'restricted') {
      setDictationState(paneId, { status: 'denied' })
      return
    }
    if (micStatus !== 'granted') {
      const granted = await window.arcnext.dictation.requestMicPermission()
      if (!granted) {
        setDictationState(paneId, { status: 'denied' })
        return
      }
    }

    // Ensure whisper binary + model are ready
    setDictationState(paneId, { status: 'downloading' })
    const result = await window.arcnext.dictation.ensureModel()
    if (!result.ready) {
      setDictationState(paneId, { status: 'error', error: result.error })
      setTimeout(() => setDictationState(paneId, null), 5000)
      return
    }

    // Start recording
    setDictationState(paneId, { status: 'recording' })
    window.arcnext.dictation.start(paneId)

    try {
      await startAudioCapture((pcmData) => {
        window.arcnext.dictation.sendAudio(paneId, pcmData)
      })
    } catch (err: unknown) {
      window.arcnext.dictation.stop(paneId)
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setDictationState(paneId, { status: 'denied' })
      } else {
        setDictationState(paneId, { status: 'error', error: 'Audio capture failed' })
        setTimeout(() => setDictationState(paneId, null), 5000)
      }
    }
  }, [paneId, isRecording, setDictationState])

  useEffect(() => {
    return () => {
      const state = usePaneStore.getState().dictationStates.get(paneId)
      if (state?.status === 'recording') {
        stopAudioCapture()
        window.arcnext.dictation.stop(paneId)
        usePaneStore.getState().setDictationState(paneId, null)
      }
    }
  }, [paneId])

  const handleOpenSettings = useCallback(() => {
    window.arcnext.dictation.openMicSettings()
    setDictationState(paneId, null)
  }, [paneId, setDictationState])

  if (!agentState) return null

  if (isDenied) {
    return (
      <div className="dictation-denied">
        <span>Mic access denied</span>
        <button onClick={handleOpenSettings}>Open Settings</button>
        <button onClick={() => setDictationState(paneId, null)}>Dismiss</button>
      </div>
    )
  }

  if (isDownloading) {
    return (
      <div className="dictation-downloading">
        <Spinner />
        <span>Downloading voice model...</span>
      </div>
    )
  }

  return (
    <button
      className={`dictation-btn${isRecording ? ' recording' : ''}`}
      onClick={handleToggle}
      title={isRecording ? 'Stop dictation' : 'Voice dictation'}
    >
      <MicIcon recording={isRecording} />
    </button>
  )
}

function MicIcon({ recording }: { recording?: boolean }) {
  const fill = recording ? '#ff4444' : '#888'
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1C6.9 1 6 1.9 6 3v5c0 1.1.9 2 2 2s2-.9 2-2V3c0-1.1-.9-2-2-2z"
        fill={fill}
      />
      <path
        d="M12 8c0 2.21-1.79 4-4 4S4 10.21 4 8H3c0 2.72 2.02 4.93 4.5 5.23V15h1v-1.77C10.98 12.93 13 10.72 13 8h-1z"
        fill={fill}
      />
    </svg>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className="dictation-spinner">
      <circle cx="8" cy="8" r="6" fill="none" stroke="#333" strokeWidth="1.5" />
      <circle
        cx="8" cy="8" r="6" fill="none" stroke="#74c0fc" strokeWidth="1.5"
        strokeDasharray="12 26" strokeLinecap="round"
      />
    </svg>
  )
}
