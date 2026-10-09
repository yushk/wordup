import { ref, onUnmounted } from 'vue'

/**
 * MediaRecorder 录音封装：录跟读 → 回放
 */
export function useRecorder() {
  const recording = ref(false)
  const hasRecording = ref(false)
  const audioUrl = ref<string | null>(null)
  const error = ref<string | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let stream: MediaStream | null = null

  async function start() {
    error.value = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder = new MediaRecorder(stream)
      chunks = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
        audioUrl.value = URL.createObjectURL(blob)
        hasRecording.value = true
      }
      mediaRecorder.start()
      recording.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '无法访问麦克风'
    }
  }

  function stop() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    recording.value = false
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
  }

  function play() {
    if (audioUrl.value) {
      const audio = new Audio(audioUrl.value)
      audio.play()
    }
  }

  function reset() {
    if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = null
    hasRecording.value = false
  }

  onUnmounted(() => {
    stop()
    reset()
  })

  return { recording, hasRecording, audioUrl, error, start, stop, play, reset }
}
