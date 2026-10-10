<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { reviewApi, type StudyCard, type ReviewOverview, type Grade, type ChapterInfo } from '../api/review'
import { wordbookApi, type MyWordbook, type Wordbook } from '../api/wordbooks'
import { statsApi } from '../api/stats'
import { useSpeech } from '../composables/useSpeech'
import { useSound } from '../composables/useSound'
import { ElMessage } from 'element-plus'

const { t, locale } = useI18n()
const { speak } = useSpeech()
const { enabled: soundOn, setEnabled: setSoundOn, keyClick, errorBeep, wordDone } = useSound()

// 发音口音：us/uk，持久化（useSpeech 默认美音）
const accent = ref<'us' | 'uk'>((localStorage.getItem('els_accent') as 'us' | 'uk') || 'us')
function setAccent(a: 'us' | 'uk') {
  accent.value = a
  localStorage.setItem('els_accent', a)
  // 切换后立即用新口音读当前词，给用户反馈
  if (currentCard.value && phase.value === 'learning' && !wordFinishing.value) {
    speak(currentCard.value.headword, a)
  }
}
function speakWord(word: string) {
  speak(word, accent.value)
}

const overview = ref<ReviewOverview | null>(null)
const loading = ref(true)

// 章节/词书选择状态
const myBooks = ref<MyWordbook[]>([])
const allBooks = ref<Wordbook[]>([])
const chaptersInfo = ref<ChapterInfo[]>([])
const selectedChapter = ref(1)
const currentChapter = ref(1)
const pickerOpen = ref(false) // 选书选章弹窗
const pickerBookId = ref<number | null>(null) // 弹窗内正在浏览的词书
const pickerChapters = ref<ChapterInfo[]>([])
const pickerLoading = ref(false)

// 学习会话状态
type Phase = 'menu' | 'learning' | 'done'
const phase = ref<Phase>('menu')
const mode = ref<'new' | 'review'>('new')
const cards = ref<StudyCard[]>([])
const currentIndex = ref(0)

// 打字状态机
const started = ref(false) // 是否已按第一个键（开始计时）
const inputPos = ref(0) // 当前应输入的字母下标
const wrongFlash = ref(false) // 错误字母抖动红闪
const wrongCount = ref(0) // 本词错误按键数
const wordFinishing = ref(false) // 本词完成动画中（禁输入）
const finishedWord = ref<StudyCard | null>(null) // 右上角刚完成的词

// 默写模式：隐藏拼写靠记忆拼（会话中可随时切，localStorage 持久化）
const hideSpelling = ref(localStorage.getItem('els_hide_spelling') === 'on')
function setHideSpelling(v: boolean) {
  hideSpelling.value = v
  localStorage.setItem('els_hide_spelling', v ? 'on' : 'off')
}

// 本次会话已评分的词（重练同一章不重复提交 SM-2 评分，避免间隔虚高）
const gradedWords = new Set<number>()

// 实时统计
const elapsedSec = ref(0)
const correctKeys = ref(0)
const totalKeys = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const currentCard = computed(() => cards.value[currentIndex.value] ?? null)
const progressPercent = computed(() =>
  cards.value.length ? Math.round((currentIndex.value / cards.value.length) * 100) : 0,
)

const primaryBook = computed(() => myBooks.value.find((b) => b.isPrimary) ?? null)
const selectedChapterInfo = computed(
  () => chaptersInfo.value.find((c) => c.chapter === selectedChapter.value) ?? null,
)
const maxChapter = computed(() => Math.max(1, chaptersInfo.value.length))

/** 当前选中章里还有多少新词 */
const chapterNewCount = computed(
  () =>
    (selectedChapterInfo.value?.totalWords ?? 0) - (selectedChapterInfo.value?.learnedWords ?? 0),
)

/** 弹窗内浏览的词书（默认当前主词书） */
const pickerBook = computed(
  () =>
    allBooks.value.find((b) => b.id === pickerBookId.value) ??
    primaryBook.value?.wordbook,
)

async function loadOverview() {
  loading.value = true
  try {
    const [ov, ch, mine, all] = await Promise.all([
      reviewApi.overview(),
      reviewApi.chapters(),
      wordbookApi.mine(),
      wordbookApi.list(),
    ])
    overview.value = ov
    chaptersInfo.value = ch.chapters
    currentChapter.value = ov.currentChapter
    myBooks.value = mine
    allBooks.value = all
    // 未手动选章时跟随进度章
    if (!userPickedChapter.value) {
      selectedChapter.value = ov.currentChapter
    }
  } finally {
    loading.value = false
  }
}
const userPickedChapter = ref(false)

onMounted(loadOverview)

function prevChapter() {
  if (selectedChapter.value > 1) {
    selectedChapter.value--
    userPickedChapter.value = true
    void refreshActiveChapters()
  }
}
function nextChapter() {
  if (selectedChapter.value < maxChapter.value) {
    selectedChapter.value++
    userPickedChapter.value = true
    void refreshActiveChapters()
  }
}

/** 切章后刷新该章的已学统计（用于任务卡显示） */
async function refreshActiveChapters() {
  const ch = await reviewApi.chapters()
  chaptersInfo.value = ch.chapters
  currentChapter.value = ch.current
}

/** 打开选书选章弹窗（Qwerty 模式：词书列表 + 章节网格） */
async function openPicker() {
  pickerOpen.value = true
  pickerBookId.value = primaryBook.value?.wordbook.id ?? null
  await loadPickerChapters()
}

async function loadPickerChapters() {
  if (!pickerBookId.value) return
  pickerLoading.value = true
  try {
    const ch = await reviewApi.chapters(pickerBookId.value)
    pickerChapters.value = ch.chapters
  } finally {
    pickerLoading.value = false
  }
}

/** 弹窗内点词书：切换浏览目标 */
function pickBook(b: Wordbook) {
  if (pickerBookId.value === b.id) return
  pickerBookId.value = b.id
  void loadPickerChapters()
}

/** 弹窗内点章节：确定学习目标并直接开始
 *  未加入的词书先自动加入并设为主词书 */
async function pickChapter(ch: number) {
  pickerOpen.value = false
  const bookId = pickerBookId.value
  if (!bookId) return
  const joined = myBooks.value.some((m) => m.wordbook.id === bookId)
  if (!joined) {
    // 首次选的书加入并设为主（join 只在无词书时自动设主）
    await wordbookApi.join({ wordbookId: bookId, dailyNewNum: 10 })
    await wordbookApi.setPrimary(bookId)
  } else if (primaryBook.value?.wordbook.id !== bookId) {
    await wordbookApi.setPrimary(bookId)
  }
  userPickedChapter.value = true
  selectedChapter.value = ch
  await loadOverview()
  // 直接开始本章学习（带 wordbookId，确保取对书）
  await start('new', bookId)
}

const timeText = computed(() => {
  const m = Math.floor(elapsedSec.value / 60)
  const s = elapsedSec.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
const wpm = computed(() => {
  const minutes = elapsedSec.value / 60
  return minutes > 0 ? Math.round(correctKeys.value / 5 / minutes) : 0
})
const accuracy = computed(() =>
  totalKeys.value > 0 ? Math.round((correctKeys.value / totalKeys.value) * 100) : 0,
)

function startTimer() {
  if (timer) return
  timer = setInterval(() => elapsedSec.value++, 1000)
}
function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** 上报本次会话：时长（分钟）+ 打字统计（更新最佳 WPM） */
async function reportMinutes() {
  const minutes = Math.round(elapsedSec.value / 60)
  const hasKeys = totalKeys.value > 0
  if (minutes <= 0 && !hasKeys) return
  try {
    await statsApi.session({
      minutes: Math.max(0, minutes),
      ...(hasKeys ? { wpm: wpm.value, totalKeys: totalKeys.value, correctKeys: correctKeys.value } : {}),
    })
  } catch {
    /* 拦截器已提示，上报失败不阻断 */
  }
}

async function start(m: 'new' | 'review', bookId?: number) {
  mode.value = m
  try {
    // 新词从选中章取（该章全部词，支持重刷）；复习走 SM-2 到期队列
    cards.value = await reviewApi.queue(
      m,
      20,
      m === 'new' ? selectedChapter.value : undefined,
      m === 'new' ? bookId : undefined,
    )
    if (cards.value.length === 0) {
      ElMessage.info(m === 'review' ? t('study.noReview') : t('study.allDone'))
      await loadOverview()
      return
    }
    currentIndex.value = 0
    resetWordState()
    started.value = false
    elapsedSec.value = 0
    correctKeys.value = 0
    totalKeys.value = 0
    finishedWord.value = null
    gradedWords.clear() // 新会话重新计分
    phase.value = 'learning'
    // 等全屏渲染完再读新词
    await nextTick()
    if (currentCard.value) {
      speakWord(currentCard.value.headword)
    }
  } catch {
    /* 拦截器已提示 */
  }
}

/** 完成页：重练本章（保持显示模式）/ 默写本章（隐藏拼写）/ 下一章 */
async function restartPractice(target: 'same' | 'dictation' | 'next') {
  if (target === 'same') {
    // 保持当前拼写显示设置
  } else if (target === 'dictation') {
    setHideSpelling(true)
  } else if (target === 'next' && selectedChapter.value < maxChapter.value) {
    selectedChapter.value++
    userPickedChapter.value = true
    await refreshActiveChapters()
  }
  await start('new')
}

function resetWordState() {
  inputPos.value = 0
  wrongFlash.value = false
  wrongCount.value = 0
  wordFinishing.value = false
}

/** 打字行为 → SM-2 评分映射 */
function gradeFromTyping(): Grade {
  if (wrongCount.value === 0) return 'good' // 一次拼对
  return 'fuzzy' // 有错误但拼完
}

/** 完成当前词：评分（重练已评过的词跳过）→ 短暂展示 → 下一词/结束 */
async function completeWord(skipped = false) {
  if (!currentCard.value || wordFinishing.value) return
  wordFinishing.value = true
  const card = currentCard.value
  finishedWord.value = card
  if (!skipped) {
    wordDone()
  }
  try {
    let intervalDays: number | null = null
    if (gradedWords.has(card.wordId)) {
      // 重练：已评过分，不再提交（避免重复推动 SM-2 调度/重复计新词数）
      await new Promise((resolve) => setTimeout(resolve, skipped ? 400 : 700))
    } else {
      const grade: Grade = skipped ? 'forget' : gradeFromTyping()
      const r = await reviewApi.grade({ wordId: card.wordId, grade })
      gradedWords.add(card.wordId)
      intervalDays = skipped ? null : r.intervalDays
    }
    if (!skipped) {
      speakWord(card.headword)
    }
    // 展示例句与复习间隔提示
    lastInterval.value = intervalDays
    if (intervalDays !== null) {
      await new Promise((resolve) => setTimeout(resolve, 900))
    }
    lastInterval.value = null

    if (currentIndex.value + 1 >= cards.value.length) {
      stopTimer()
      await reportMinutes()
      phase.value = 'done'
      await loadOverview()
    } else {
      currentIndex.value++
      resetWordState()
      if (mode.value === 'new') {
        speakWord(cards.value[currentIndex.value].headword)
      }
    }
  } catch {
    /* 评分失败拦截器已提示；停留当前词允许重试（回退完成锁） */
    wordFinishing.value = false
  }
}

const lastInterval = ref<number | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (phase.value !== 'learning' || !currentCard.value) return
  // 修饰键组合放行给浏览器（如 Cmd+R 刷新）
  if (e.metaKey || e.ctrlKey || e.altKey) return

  if (e.key === 'Escape') {
    e.preventDefault()
    completeWord(true)
    return
  }
  if (wordFinishing.value) return
  // 只接受单个英文字符
  if (!/^[a-zA-Z]$/.test(e.key)) return
  e.preventDefault()

  if (!started.value) {
    started.value = true
    startTimer()
  }

  const target = currentCard.value.headword
  const expected = target[inputPos.value]
  totalKeys.value++
  if (e.key.toLowerCase() === expected?.toLowerCase()) {
    correctKeys.value++
    keyClick()
    wrongFlash.value = false
    inputPos.value++
    if (inputPos.value >= target.length) {
      completeWord(false)
    }
  } else {
    wrongCount.value++
    errorBeep()
    wrongFlash.value = true
    setTimeout(() => (wrongFlash.value = false), 300)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopTimer()
})

async function backToMenu() {
  stopTimer()
  await reportMinutes()
  phase.value = 'menu'
  loadOverview()
}
</script>

<template>
  <div class="page" v-loading="loading && phase === 'menu'">
    <!-- 菜单态：今日任务概览 -->
    <template v-if="phase === 'menu'">
      <h1 class="page-title">{{ t('study.title') }}</h1>
      <p class="page-subtitle">{{ new Date().toLocaleDateString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }}</p>

      <template v-if="overview && overview.joined">
        <!-- 章节切换行：词书 ▾（点击弹选书选章）| ◀ 第 N 章 ▶ -->
        <div class="chapter-bar fade-up">
          <div class="book-select" @click="openPicker">
            <span class="book-name">{{ primaryBook?.wordbook.name }}</span>
            <span class="book-caret">▾</span>
          </div>
          <div class="chapter-switch">
            <button class="ch-btn" :disabled="selectedChapter <= 1" @click="prevChapter">◀</button>
            <span class="ch-label" :class="{ 'is-progress': selectedChapter === currentChapter }">
              {{ t('study.chapterN', { n: selectedChapter }) }}
            </span>
            <button class="ch-btn" :disabled="selectedChapter >= maxChapter" @click="nextChapter">▶</button>
          </div>
        </div>

        <div class="task-grid">
          <div class="els-card task-card fade-up" @click="chapterNewCount > 0 && start('new')">
            <div class="task-icon">🌱</div>
            <div class="task-num">{{ Math.max(0, chapterNewCount) }}</div>
            <div class="task-label">{{ t('study.newWords') }}</div>
            <div class="task-sub">{{ t('study.chapterProgress', { learned: selectedChapterInfo?.learnedWords ?? 0, total: selectedChapterInfo?.totalWords ?? 0 }) }}</div>
            <button class="els-btn-gradient task-btn" :disabled="chapterNewCount === 0" @click.stop="start('new')">
              {{ t('study.startNew') }}
            </button>
          </div>
          <div class="els-card task-card fade-up" @click="overview!.reviewDue > 0 && start('review')">
            <div class="task-icon">🔁</div>
            <div class="task-num">{{ overview.reviewDue }}</div>
            <div class="task-label">{{ t('study.reviews') }}</div>
            <button class="task-btn task-btn-green" :disabled="overview.reviewDue === 0" @click.stop="start('review')">
              {{ t('study.startReview') }}
            </button>
          </div>
        </div>
        <div v-if="chapterNewCount === 0 && overview.reviewDue === 0" class="all-done fade-up">
          {{ t('study.chapterDone') }}
          <p class="all-done-sub">
            <button v-if="selectedChapter < maxChapter" class="next-ch-link" @click="nextChapter(); start('new')">
              {{ t('study.goNextChapter') }} →
            </button>
            <template v-else>{{ t('study.reviewTomorrow') }}</template>
          </p>
        </div>
      </template>
      <div v-else class="els-card no-book fade-up">
        <p>{{ t('study.noWordbook') }}</p>
        <button class="els-btn-gradient" @click="openPicker">{{ t('study.goChoose') }} →</button>
      </div>
    </template>

    <!-- 选书选章弹窗（Qwerty 模式） -->
    <Teleport to="body">
      <div v-if="pickerOpen" class="picker-mask" @click.self="pickerOpen = false">
        <div class="picker-dialog">
          <button class="picker-close" @click="pickerOpen = false">✕</button>
          <div class="picker-body">
            <!-- 左：词书列表 -->
            <div class="picker-books">
              <button
                v-for="b in allBooks"
                :key="b.id"
                class="picker-book"
                :class="{ active: b.id === pickerBookId }"
                @click="pickBook(b)"
              >
                <span class="pb-name">{{ b.name }}</span>
                <span class="pb-count">{{ b.wordCount }} {{ t('wordbooks.countUnit') }}</span>
                <span v-if="myBooks.some(m => m.wordbook.id === b.id)" class="pb-joined">✓</span>
              </button>
            </div>
            <!-- 右：章节网格 -->
            <div class="picker-chapters" v-loading="pickerLoading">
              <div v-if="pickerBook" class="picker-head">
                <h3>{{ pickerBook.name }}</h3>
                <span>{{ pickerChapters.length }} {{ t('study.chaptersUnit') }} · {{ pickerBook.wordCount }} {{ t('wordbooks.countUnit') }}</span>
              </div>
              <div class="chapter-grid">
                <button
                  v-for="c in pickerChapters"
                  :key="c.chapter"
                  class="chapter-cell"
                  :class="{
                    done: c.learnedWords >= c.totalWords,
                    current: c.learnedWords > 0 && c.learnedWords < c.totalWords,
                  }"
                  @click="pickChapter(c.chapter)"
                >
                  <span class="cc-num">{{ c.chapter }}</span>
                  <span class="cc-status">
                    {{ c.learnedWords >= c.totalWords
                      ? t('study.chapterMastered')
                      : c.learnedWords > 0
                        ? `${c.learnedWords}/${c.totalWords}`
                        : t('study.chapterNew') }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 学习态：沉浸打字会话（全屏覆盖） -->
    <Teleport to="body">
      <div v-if="phase === 'learning' && currentCard" class="typing-overlay">
        <!-- 顶栏：返回 + 进度 + 音效开关 -->
        <div class="typing-top">
          <button class="back-btn" @click="backToMenu">←</button>
          <span class="session-mode">
            {{ mode === 'new'
              ? t('study.chapterN', { n: selectedChapter }) + (chapterNewCount >= 0 ? '' : '')
              : t('study.reviews') }}
          </span>
          <span class="session-count">{{ currentIndex + 1 }} / {{ cards.length }}</span>
          <button
            class="sound-btn accent-btn"
            :class="{ active: hideSpelling }"
            :title="hideSpelling ? t('study.showSpelling') : t('study.hideSpelling')"
            @click="setHideSpelling(!hideSpelling)"
          >✍️</button>
          <button
            class="sound-btn accent-btn"
            :title="t('study.accentTip')"
            @click="setAccent(accent === 'us' ? 'uk' : 'us')"
          >{{ accent === 'us' ? '🇺🇸' : '🇬🇧' }}</button>
          <button
            class="sound-btn"
            :title="soundOn ? t('study.soundOn') : t('study.soundOff')"
            @click="setSoundOn(!soundOn)"
          >{{ soundOn ? '🔊' : '🔇' }}</button>
        </div>
        <el-progress :percentage="progressPercent" :stroke-width="6" :show-text="false" class="typing-progress" />

        <!-- 刚完成的词（Qwerty 右上角历史） -->
        <transition name="fade">
          <div v-if="finishedWord && wordFinishing" class="finished-word">
            <span class="fw-head">{{ finishedWord.headword }}</span>
            <span class="fw-cn">{{ finishedWord.definitions[0]?.cn }}</span>
          </div>
        </transition>

        <!-- 中央：单词 + 输入 -->
        <div class="typing-main">
          <div class="word-letters" :class="{ 'shake-wrong': wrongFlash }">
            <span
              v-for="(ch, i) in currentCard.headword"
              :key="i"
              class="letter"
              :class="{
                typed: i < inputPos,
                pending: i === inputPos && started && !wordFinishing,
                wrong: i === inputPos && wrongFlash,
              }"
            >{{
              // 默写模式：未输入的字母遮蔽为 •，已拼对部分正常显示；拼完展示期显示完整词
              hideSpelling && !wordFinishing && i >= inputPos ? '•' : ch
            }}</span>
          </div>

          <p v-if="!started && !wordFinishing" class="start-hint">{{ t('study.pressAnyKey') }}</p>

          <template v-if="wordFinishing">
            <p v-if="lastInterval !== null" class="interval-tip">{{ t('study.intervalInfo', { days: lastInterval }) }}</p>
            <div v-if="currentCard.exampleSentence && !lastInterval" class="finishing-example">
              <p class="example-en">“{{ currentCard.exampleSentence }}”</p>
              <p v-if="currentCard.exampleTranslation" class="example-cn">{{ currentCard.exampleTranslation }}</p>
            </div>
          </template>

          <!-- 音标 + 释义（常显） -->
          <div v-if="!wordFinishing" class="word-meta">
            <div v-if="currentCard.phoneticUs" class="phonetic">US /{{ currentCard.phoneticUs }}/</div>
            <div class="definitions">
              <div v-for="(d, i) in currentCard.definitions" :key="i" class="def-row">
                <span class="def-pos">{{ d.pos }}</span>
                <span class="def-cn">{{ d.cn }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部：跳过 + 实时统计 -->
        <div class="typing-bottom">
          <button class="skip-btn" :disabled="wordFinishing" @click="completeWord(true)">{{ t('study.skipWord') }}</button>
          <div class="stat-bar">
            <div class="stat-item">
              <div class="stat-num">{{ timeText }}</div>
              <div class="stat-label">{{ t('study.time') }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">{{ totalKeys }}</div>
              <div class="stat-label">{{ t('study.inputs') }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">{{ wpm }}</div>
              <div class="stat-label">{{ t('study.wpm') }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">{{ correctKeys }}</div>
              <div class="stat-label">{{ t('study.correct') }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">{{ accuracy }}%</div>
              <div class="stat-label">{{ t('study.accuracy') }}</div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 完成态 -->
    <template v-if="phase === 'done'">
      <div class="done-view fade-up">
        <div class="done-emoji">🎉</div>
        <h2>{{ t('study.finished') }}</h2>
        <p class="done-sub">{{ t('study.reviewTomorrow') }}</p>
        <div class="done-stats els-card">
          <div class="stat-item">
            <div class="stat-num">{{ timeText }}</div>
            <div class="stat-label">{{ t('study.time') }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-num">{{ wpm }}</div>
            <div class="stat-label">{{ t('study.wpm') }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-num">{{ accuracy }}%</div>
            <div class="stat-label">{{ t('study.accuracy') }}</div>
          </div>
        </div>
        <!-- 继续练习 -->
        <div class="next-actions">
          <button class="els-btn-gradient next-btn" @click="restartPractice('same')">
            🔁 {{ t('study.practiceAgain') }}
          </button>
          <button class="next-btn next-btn-dictation" @click="restartPractice('dictation')">
            ✍️ {{ t('study.dictation') }}
          </button>
          <button
            v-if="selectedChapter < maxChapter"
            class="next-btn next-btn-green"
            @click="restartPractice('next')"
          >
            {{ t('study.nextChapterPractice', { n: selectedChapter + 1 }) }} →
          </button>
        </div>
        <div class="done-links">
          <RouterLink :to="{ name: 'stats' }">{{ t('nav.stats') }}</RouterLink>
          <RouterLink :to="{ name: 'quiz' }">{{ t('nav.quiz') }}</RouterLink>
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
export default { name: 'StudyView' }
</script>

<style scoped>
/* ===== 章节切换行 ===== */
.chapter-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}

.book-select {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border-radius: 999px;
  padding: 8px 18px;
  box-shadow: var(--els-shadow);
  cursor: pointer;
  font-weight: 700;
  transition: box-shadow 0.15s;
}

.book-select:hover {
  box-shadow: var(--els-shadow-hover);
}

.book-caret {
  color: var(--els-text-secondary);
  font-size: 11px;
}

/* ===== 选书选章弹窗 ===== */
.picker-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(45, 52, 54, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px;
}

.picker-dialog {
  position: relative;
  background: #fff;
  border-radius: 20px;
  width: min(860px, 100%);
  max-height: min(640px, 90vh);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  display: flex;
  overflow: hidden;
}

.picker-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  border: none;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 50%;
  width: 30px;
  height: 30px;
  cursor: pointer;
  color: var(--els-text-secondary);
}

.picker-close:hover {
  background: rgba(0, 0, 0, 0.1);
  color: var(--els-text);
}

.picker-body {
  display: flex;
  width: 100%;
  min-height: 0;
}

.picker-books {
  width: 230px;
  flex-shrink: 0;
  border-right: 1px solid var(--els-border, #ececf3);
  padding: 14px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.picker-book {
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 9px 12px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.12s;
}

.picker-book:hover {
  background: rgba(108, 92, 231, 0.07);
}

.picker-book.active {
  background: var(--els-gradient);
  color: #fff;
}

.picker-book.active .pb-count {
  color: rgba(255, 255, 255, 0.8);
}

.pb-name {
  font-weight: 700;
  font-size: 13.5px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pb-count {
  font-size: 11px;
  color: var(--els-text-secondary);
  white-space: nowrap;
}

.pb-joined {
  font-size: 11px;
  color: var(--els-green);
  font-weight: 800;
}

.picker-book.active .pb-joined {
  color: #fff;
}

.picker-chapters {
  flex: 1;
  padding: 18px 20px;
  overflow-y: auto;
  min-width: 0;
}

.picker-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 14px;
  padding-right: 30px;
}

.picker-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
}

.picker-head span {
  font-size: 12.5px;
  color: var(--els-text-secondary);
}

.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
  gap: 8px;
}

.chapter-cell {
  border: 1.5px solid var(--els-border, #ececf3);
  background: #fff;
  border-radius: 10px;
  padding: 8px 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition: all 0.12s;
}

.chapter-cell:hover {
  border-color: var(--els-primary);
  box-shadow: var(--els-shadow);
}

.chapter-cell.done {
  border-color: var(--els-green);
  background: rgba(0, 184, 148, 0.06);
}

.chapter-cell.current {
  border-color: var(--els-primary);
  background: rgba(108, 92, 231, 0.07);
}

.cc-num {
  font-weight: 800;
  font-size: 14px;
}

.cc-status {
  font-size: 10.5px;
  color: var(--els-text-secondary);
  white-space: nowrap;
}

.chapter-cell.done .cc-status {
  color: var(--els-green);
}

.chapter-cell.current .cc-status {
  color: var(--els-primary);
}

.chapter-switch {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ch-btn {
  border: none;
  background: #fff;
  border-radius: 10px;
  width: 32px;
  height: 32px;
  font-size: 11px;
  cursor: pointer;
  box-shadow: var(--els-shadow);
  color: var(--els-text);
  transition: all 0.15s;
}

.ch-btn:hover:not(:disabled) {
  color: var(--els-primary);
  box-shadow: var(--els-shadow-hover);
}

.ch-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ch-label {
  font-weight: 800;
  font-size: 15px;
  min-width: 72px;
  text-align: center;
  padding: 0 4px;
}

.ch-label.is-progress {
  color: var(--els-primary);
}

.task-sub {
  font-size: 12px;
  color: var(--els-text-secondary);
  margin: -12px 0 14px;
}

.next-ch-link {
  border: none;
  background: none;
  color: var(--els-primary);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.next-ch-link:hover {
  text-decoration: underline;
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
  max-width: 560px;
}

.task-card {
  text-align: center;
  cursor: pointer;
  padding: 28px 22px;
}

.task-icon {
  font-size: 36px;
  margin-bottom: 6px;
}

.task-num {
  font-size: 44px;
  font-weight: 900;
  background: var(--els-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.task-label {
  color: var(--els-text-secondary);
  font-weight: 600;
  margin: 2px 0 16px;
}

.task-btn {
  padding: 9px 24px;
  font-size: 14px;
}

.task-btn-green {
  background: var(--els-gradient-green);
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 9px 24px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.task-btn-green:hover { opacity: 0.9; }
.task-btn:disabled,
.task-btn-green:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.all-done {
  text-align: center;
  font-size: 20px;
  font-weight: 700;
  margin-top: 40px;
}

.all-done-sub {
  font-size: 14px;
  color: var(--els-text-secondary);
  font-weight: 400;
  margin-top: 8px;
}

.no-book {
  text-align: center;
  padding: 50px 24px;
}

.no-book p {
  margin: 0 0 20px;
  color: var(--els-text-secondary);
}

.no-book .els-btn-gradient {
  text-decoration: none;
  display: inline-block;
}

/* ===== 沉浸打字会话 ===== */
.typing-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background:
    radial-gradient(1000px 500px at 50% 20%, rgba(108, 92, 231, 0.07), transparent 65%),
    var(--els-bg, #f5f6fa);
  display: flex;
  flex-direction: column;
}

.typing-top {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 26px 0;
  max-width: 760px;
  margin: 0 auto;
  width: 100%;
}

.back-btn {
  border: none;
  background: #fff;
  border-radius: 10px;
  width: 36px;
  height: 36px;
  font-size: 18px;
  cursor: pointer;
  box-shadow: var(--els-shadow);
}

.session-mode {
  font-weight: 700;
}

.session-count {
  margin-left: auto;
  color: var(--els-text-secondary);
  font-weight: 600;
}

.sound-btn {
  border: none;
  background: #fff;
  border-radius: 10px;
  width: 36px;
  height: 36px;
  font-size: 15px;
  cursor: pointer;
  box-shadow: var(--els-shadow);
  transition: transform 0.12s;
}

.sound-btn:hover {
  transform: scale(1.1);
}

.accent-btn {
  font-size: 14px;
  margin-left: 10px;
}

.accent-btn.active {
  background: var(--els-gradient);
}

.typing-progress {
  max-width: 760px;
  margin: 10px auto 0;
  width: calc(100% - 52px);
}

.finished-word {
  position: absolute;
  top: 76px;
  right: 34px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  opacity: 0.75;
}

.fw-head {
  font-weight: 700;
  color: var(--els-text-secondary);
}

.fw-cn {
  font-size: 13px;
  color: var(--els-text-secondary);
}

.typing-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
}

.word-letters {
  display: flex;
  gap: 2px;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', monospace;
  font-size: clamp(44px, 7vw, 64px);
  font-weight: 600;
  user-select: none;
}

.letter {
  padding: 0 3px;
  color: #b8b8c4; /* 未输入：灰色 */
  transition: color 0.12s;
}

.letter.typed {
  color: var(--els-primary); /* 已拼对：主题色 */
}

.letter.pending {
  color: var(--els-text, #2d3436);
  border-bottom: 4px solid var(--els-primary);
  border-radius: 2px;
  animation: pulse-cursor 1.1s ease-in-out infinite;
}

.letter.wrong {
  color: #d63031;
  border-bottom-color: #d63031;
}

@keyframes pulse-cursor {
  0%, 100% { border-bottom-color: var(--els-primary); }
  50% { border-bottom-color: transparent; }
}

.shake-wrong {
  animation: shake 0.3s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-7px); }
  50% { transform: translateX(6px); }
  75% { transform: translateX(-3px); }
}

.start-hint {
  margin-top: 26px;
  color: var(--els-text-secondary);
  font-size: 15px;
  animation: fade-breathe 1.8s ease-in-out infinite;
}

@keyframes fade-breathe {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

.word-meta {
  margin-top: 30px;
  text-align: center;
}

.phonetic {
  color: var(--els-text-secondary);
  font-size: 16px;
}

.definitions {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.def-row {
  display: flex;
  gap: 10px;
  align-items: baseline;
  justify-content: center;
}

.def-pos {
  color: var(--els-primary);
  font-weight: 700;
  font-size: 14px;
}

.def-cn {
  font-size: 19px;
  font-weight: 600;
}

.interval-tip {
  margin-top: 24px;
  color: var(--els-green);
  font-weight: 700;
  font-size: 17px;
}

.finishing-example {
  margin-top: 22px;
  text-align: center;
  max-width: 560px;
}

.example-en {
  font-size: 16px;
  font-style: italic;
  margin: 0 0 6px;
}

.example-cn {
  color: var(--els-text-secondary);
  font-size: 14px;
  margin: 0;
}

.typing-bottom {
  padding: 0 26px 26px;
  max-width: 760px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.skip-btn {
  border: 2px solid var(--els-border);
  background: #fff;
  border-radius: 999px;
  padding: 8px 22px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--els-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.skip-btn:hover:not(:disabled) {
  border-color: #d63031;
  color: #d63031;
}

.skip-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stat-bar {
  display: flex;
  gap: 40px;
  background: #fff;
  border-radius: 16px;
  padding: 14px 34px;
  box-shadow: var(--els-shadow);
}

.stat-item {
  text-align: center;
  min-width: 52px;
}

.stat-num {
  font-size: 20px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 12px;
  color: var(--els-text-secondary);
  margin-top: 2px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 完成态 */
.done-view {
  text-align: center;
  padding: 50px 20px;
}

.done-emoji {
  font-size: 60px;
  margin-bottom: 10px;
}

.done-view h2 {
  margin: 0 0 6px;
}

.done-sub {
  color: var(--els-text-secondary);
  margin: 0 0 22px;
}

.done-stats {
  display: inline-flex;
  gap: 40px;
  padding: 18px 40px;
  margin-bottom: 26px;
}

.done-actions {
  display: flex;
  gap: 14px;
  justify-content: center;
}

/* 完成页：继续练习三按钮 */
.next-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.next-btn {
  border: none;
  border-radius: 999px;
  padding: 12px 26px;
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.15s;
}

.next-btn:hover {
  transform: translateY(-2px);
}

.next-btn-dictation {
  background: #fff;
  border: 2px solid var(--els-primary);
  color: var(--els-primary);
}

.next-btn-green {
  background: var(--els-gradient-green);
  color: #fff;
}

.done-links {
  display: flex;
  gap: 20px;
  justify-content: center;
}

.done-links a {
  color: var(--els-text-secondary);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 600;
}

.done-links a:hover {
  color: var(--els-primary);
}

.done-actions .els-btn-gradient,
.cta-ghost {
  text-decoration: none;
  padding: 10px 26px;
  font-size: 14.5px;
}

.cta-ghost {
  border: 2px solid var(--els-border);
  border-radius: 999px;
  font-weight: 600;
  color: var(--els-text);
}
</style>
