import { ref } from 'vue'

/**
 * 单词发音：有道词典真人语音 mp3（Qwerty Learner 同款方案）
 *
 * 为什么不用 Web Speech API：国产安卓手机普遍缺英文 TTS 引擎（或禁用 Google 服务），
 * speechSynthesis 走 start→end 事件但无声。真人 mp3 走 <audio> 播放，任何手机必有声，
 * 且音质比机器 TTS 自然。
 *
 * 实现：
 *  - 接口 https://dict.youdao.com/dictvoice?type=1|2&audio=<word>（1=英式 2=美式）
 *  - URL 稳定 → 浏览器 HTTP 缓存自动复用，第二次播放零流量零延迟
 *  - 单例 Audio 队列：新发音打断旧的（与 TTS 行为一致）
 *  - 拉取失败（断网/接口异常）时兜底回退 Web Speech
 *  - 预热：首次用户手势内 touch 一个静音 audio 解锁移动端自动播放
 */

let currentAudio: HTMLAudioElement | null = null
let warmedUp = false

export interface SpeakHandle {
  stop(): void
  done: Promise<void>
}

function youdaoUrl(text: string, accent: 'us' | 'uk'): string {
  const type = accent === 'us' ? 1 : 2 // 有道：1=英式 2=美式
  return `https://dict.youdao.com/dictvoice?type=${type}&audio=${encodeURIComponent(text)}`
}

/** 首次用户手势内调用：解锁移动端 audio 自动播放策略 */
export function warmUpAudio() {
  if (warmedUp) return
  try {
    const a = new Audio()
    a.muted = true
    // 空数据源 touch 一次播放能力；不真正 play() 以免控制台报错
    a.play().catch(() => {
      /* 被拦也没关系，手势链内的 play 通常能过 */
    })
    a.pause()
    warmedUp = true
  } catch {
    /* 忽略 */
  }
}

/**
 * 播放单词/句子发音。
 * accent: us（有道 type=2 美音）/ uk（type=1 英音）
 */
export function playWord(text: string, accent: 'us' | 'uk' = 'us'): SpeakHandle {
  // 打断上一个
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }

  const audio = new Audio(youdaoUrl(text, accent))
  audio.preload = 'auto'
  currentAudio = audio

  const done = new Promise<void>((resolve) => {
    audio.onended = () => resolve()
    audio.onerror = () => {
      // 兜底：有道拉取失败回退 Web Speech（桌面一般有 TTS 引擎）
      fallbackSpeak(text, accent).finally(() => resolve())
    }
    // 移动端自动播放策略：非手势上下文 play() 会被拦（onerror 不触发），
    // 此时也回退 Web Speech
    audio.play().catch(() => {
      fallbackSpeak(text, accent).finally(() => resolve())
    })
  })

  return { stop: () => audio.pause(), done }
}

// ===== Web Speech 兜底（仅当有道接口不可用时） =====

function fallbackSpeak(text: string, accent: 'us' | 'uk', rate = 0.95): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') {
      resolve()
      return
    }
    try {
      speechSynthesis.resume()
      speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = accent === 'us' ? 'en-US' : 'en-GB'
      const voices = speechSynthesis.getVoices()
      const voice = voices.find((v) => v.lang === utter.lang) ?? voices.find((v) => v.lang.startsWith('en'))
      if (voice) utter.voice = voice
      utter.rate = rate
      utter.onend = () => resolve()
      utter.onerror = () => resolve()
      speechSynthesis.speak(utter)
      // 兜底超时：8s 后强制 resolve（部分安卓引擎不触发 onend）
      setTimeout(resolve, 8000)
    } catch {
      resolve()
    }
  })
}

// ===== 兼容导出：保持旧 useSpeech() 签名，所有调用方零改动 =====

export function useSpeech() {
  const speaking = ref(false)

  function speak(text: string, accent: 'us' | 'uk' = 'us', rate = 0.95): Promise<void> {
    speaking.value = true
    // 有道真人音频不支持变速；慢速跟读场景（rate<0.9）直接走 Web Speech 变速——
    // 跟读页是桌面为主的使用场景；移动端以「有声的正常语速真人音」优先于无声慢速
    if (rate < 0.9) {
      return fallbackSpeak(text, accent, rate).finally(() => (speaking.value = false))
    }
    const handle = playWord(text, accent)
    return handle.done.finally(() => (speaking.value = false))
  }

  function stop() {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    speaking.value = false
  }

  return { speaking, speak, stop, warmUp: warmUpAudio }
}
