import { ref } from 'vue'

/**
 * Web Speech API TTS 封装：播放英文单词/句子发音
 * 支持美音/英音选择
 */
export function useSpeech() {
  const speaking = ref(false)

  function getVoice(lang: 'en-US' | 'en-GB'): SpeechSynthesisVoice | null {
    if (typeof speechSynthesis === 'undefined') return null
    const voices = speechSynthesis.getVoices()
    return (
      voices.find((v) => v.lang === lang) ??
      voices.find((v) => v.lang.startsWith('en')) ??
      null
    )
  }

  function speak(text: string, accent: 'us' | 'uk' = 'us', rate = 0.95): Promise<void> {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === 'undefined') {
        resolve()
        return
      }
      speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = accent === 'us' ? 'en-US' : 'en-GB'
      const voice = getVoice(utter.lang as 'en-US' | 'en-GB')
      if (voice) utter.voice = voice
      utter.rate = rate
      utter.onstart = () => (speaking.value = true)
      utter.onend = () => {
        speaking.value = false
        resolve()
      }
      utter.onerror = () => {
        speaking.value = false
        resolve()
      }
      speechSynthesis.speak(utter)
    })
  }

  function stop() {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel()
    }
    speaking.value = false
  }

  return { speaking, speak, stop }
}
