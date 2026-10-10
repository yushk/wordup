import { ref } from 'vue'

/**
 * Web Speech API TTS 封装：播放英文单词/句子发音
 * 支持美音/英音选择
 *
 * 移动端兼容处理：
 *  - iOS Safari：speak() 必须在用户手势事件链内调用才有声；这里在首次手势时
 *    预热（播一个空 utterance），后续调用不再受手势限制
 *  - Android Chrome：speechSynthesis 长时间闲置后首次发声无声，预热同样解决；
 *    另有 paused 状态卡死问题，speak 前 resume()
 *  - voices 列表异步加载：getVoices() 首次可能为空，监听 voiceschanged 并缓存
 */
export function useSpeech() {
  const speaking = ref(false)
  let warmedUp = false
  let cachedVoice: SpeechSynthesisVoice | null = null

  if (typeof speechSynthesis !== 'undefined') {
    // voices 异步加载：一旦加载完成缓存英文 voice
    speechSynthesis.onvoiceschanged = () => {
      cachedVoice = null // 置空，下次 speak 时重新选取
    }
  }

  function getVoice(lang: 'en-US' | 'en-GB'): SpeechSynthesisVoice | null {
    if (typeof speechSynthesis === 'undefined') return null
    if (cachedVoice && cachedVoice.lang === lang) return cachedVoice
    const voices = speechSynthesis.getVoices()
    const found =
      voices.find((v) => v.lang === lang) ??
      voices.find((v) => v.lang.startsWith('en')) ??
      null
    if (found) cachedVoice = found
    return found
  }

  /** 首次用户手势时调用：解锁移动端 TTS（预热空发声） */
  function warmUp() {
    if (warmedUp || typeof speechSynthesis === 'undefined') return
    try {
      speechSynthesis.resume()
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0 // 静音预热
      u.rate = 2
      speechSynthesis.speak(u)
      warmedUp = true
    } catch {
      /* 预热失败不阻断 */
    }
  }

  function speak(text: string, accent: 'us' | 'uk' = 'us', rate = 0.95): Promise<void> {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === 'undefined') {
        resolve()
        return
      }
      // 安卓卡死修复：说话前先恢复
      speechSynthesis.resume()
      speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = accent === 'us' ? 'en-US' : 'en-GB'
      const voice = getVoice(utter.lang as 'en-US' | 'en-GB')
      if (voice) utter.voice = voice
      utter.rate = rate
      // 移动端兜底：极个别机型音量默认 0
      if (utter.volume === 0) utter.volume = 1
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

  return { speaking, speak, stop, warmUp }
}
