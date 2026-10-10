import { ref } from 'vue'

/**
 * 打字音效：Web Audio API 程序化合成（无音频文件，零延迟）
 *
 * 三种音效：
 *   keyClick  正确键击——短噪声脉冲 + 带通滤波，机械键盘「嗒」
 *   errorBeep 按错——低频方波短鸣
 *   wordDone  单词拼完——上行双音「叮咚」
 *
 * AudioContext 懒创建（首次发声时），符合浏览器自动播放策略。
 * 开关状态持久化 localStorage。
 */

let ctx: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  // 被浏览器挂起时（如切后台后回来）恢复
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** 白噪声 buffer（键击声用，一次生成复用） */
function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer
  const len = Math.floor(c.sampleRate * 0.05) // 50ms
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1
  }
  noiseBuffer = buf
  return buf
}

export function useSound(storageKey = 'els_sound') {
  const enabled = ref(localStorage.getItem(storageKey) !== 'off')

  function setEnabled(v: boolean) {
    enabled.value = v
    localStorage.setItem(storageKey, v ? 'on' : 'off')
  }

  /** 正确键击：短噪声 + 带通滤波（~2kHz），机械键盘手感 */
  function keyClick() {
    if (!enabled.value) return
    const c = getCtx()
    if (!c) return
    const src = c.createBufferSource()
    src.buffer = getNoiseBuffer(c)
    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2000
    filter.Q.value = 1.2
    const gain = c.createGain()
    const t = c.currentTime
    gain.gain.setValueAtTime(0.25, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
    src.connect(filter).connect(gain).connect(c.destination)
    src.start(t)
    src.stop(t + 0.05)
  }

  /** 按错：低频方波短鸣 */
  function errorBeep() {
    if (!enabled.value) return
    const c = getCtx()
    if (!c) return
    const osc = c.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 220
    const gain = c.createGain()
    const t = c.currentTime
    gain.gain.setValueAtTime(0.12, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    osc.connect(gain).connect(c.destination)
    osc.start(t)
    osc.stop(t + 0.13)
  }

  /** 单词拼完：上行双音（C5 → E5） */
  function wordDone() {
    if (!enabled.value) return
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    for (const [freq, start] of [
      [523.25, 0],
      [659.25, 0.09],
    ] as const) {
      const osc = c.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const gain = c.createGain()
      gain.gain.setValueAtTime(0.16, t + start)
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + 0.09)
      osc.connect(gain).connect(c.destination)
      osc.start(t + start)
      osc.stop(t + start + 0.1)
    }
  }

  return { enabled, setEnabled, keyClick, errorBeep, wordDone }
}
