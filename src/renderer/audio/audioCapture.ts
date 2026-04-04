/**
 * Captures microphone audio, downsamples to 16kHz mono Int16 PCM,
 * and streams chunks to a callback for forwarding to the main process.
 */

const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._ratio = sampleRate / 16000
    this._phase = 0
    this._buf = []
  }

  process(inputs) {
    const ch = inputs[0]?.[0]
    if (!ch) return true

    for (let i = 0; i < ch.length; i++) {
      this._phase += 1
      if (this._phase >= this._ratio) {
        this._phase -= this._ratio
        const s = Math.max(-1, Math.min(1, ch[i]))
        this._buf.push(s < 0 ? s * 0x8000 : s * 0x7FFF)
      }
    }

    // Flush ~100ms of 16kHz audio (1600 samples)
    if (this._buf.length >= 1600) {
      const int16 = new Int16Array(this._buf)
      this.port.postMessage(int16.buffer, [int16.buffer])
      this._buf = []
    }
    return true
  }
}
registerProcessor('pcm-processor', PCMProcessor)
`

let audioContext: AudioContext | null = null
let mediaStream: MediaStream | null = null
let workletNode: AudioWorkletNode | null = null
let sourceNode: MediaStreamAudioSourceNode | null = null

export type AudioChunkCallback = (pcmData: ArrayBuffer) => void

export async function startAudioCapture(onChunk: AudioChunkCallback): Promise<void> {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })

  audioContext = new AudioContext()

  const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  await audioContext.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)

  sourceNode = audioContext.createMediaStreamSource(mediaStream)
  workletNode = new AudioWorkletNode(audioContext, 'pcm-processor')

  workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    onChunk(event.data)
  }

  sourceNode.connect(workletNode)
  // Don't connect to destination — no playback of mic audio
}

export async function stopAudioCapture(): Promise<void> {
  if (workletNode) {
    workletNode.port.onmessage = null
    workletNode.disconnect()
    workletNode = null
  }
  if (sourceNode) {
    sourceNode.disconnect()
    sourceNode = null
  }
  if (audioContext) {
    await audioContext.close()
    audioContext = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }
}
