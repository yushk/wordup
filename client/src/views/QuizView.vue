<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { quizApi, type QuizQuestion, type QuizType, type QuizResult } from '../api/quiz'
import { useSpeech } from '../composables/useSpeech'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const { speak } = useSpeech()

type Phase = 'select' | 'playing' | 'result'
const phase = ref<Phase>('select')
const selectedType = ref<QuizType | 'mixed'>('mixed')
const count = ref(10)

const questions = ref<QuizQuestion[]>([])
const currentIndex = ref(0)
const answers = reactive<Record<number, string>>({})
const answered = reactive<Record<number, boolean>>({})
const result = ref<QuizResult | null>(null)
const loading = ref(false)

const types: { key: QuizType | 'mixed'; icon: string }[] = [
  { key: 'mixed', icon: '🎲' },
  { key: 'en2cn', icon: '🔤' },
  { key: 'cn2en', icon: '🇨🇳' },
  { key: 'listening', icon: '🎧' },
  { key: 'cloze', icon: '✏️' },
]

const current = computed(() => questions.value[currentIndex.value] ?? null)

async function start() {
  loading.value = true
  try {
    questions.value = await quizApi.generate(selectedType.value, count.value)
    if (questions.value.length === 0) {
      ElMessage.warning(t('study.noWordbook'))
      return
    }
    currentIndex.value = 0
    Object.keys(answers).forEach((k) => delete answers[+k])
    Object.keys(answered).forEach((k) => delete answered[+k])
    result.value = null
    phase.value = 'playing'
    if (current.value?.type === 'listening') {
      setTimeout(() => speak(current.value!.audioText!), 400)
    }
  } catch {
    router.push({ name: 'study' })
  } finally {
    loading.value = false
  }
}

function choose(option: string) {
  if (!current.value || answered[currentIndex.value]) return
  answers[currentIndex.value] = option
  answered[currentIndex.value] = true
  // 答完自动读一遍正确词
  if (current.value.type !== 'listening') {
    speak(current.value.headword)
  }
}

function next() {
  if (currentIndex.value + 1 >= questions.value.length) {
    submit()
  } else {
    currentIndex.value++
    if (current.value?.type === 'listening') {
      setTimeout(() => speak(current.value!.audioText!), 300)
    }
  }
}

async function submit() {
  const payload = questions.value.map((q, i) => ({
    wordId: q.wordId,
    quizType: q.type,
    answer: answers[i] ?? '',
    correctAnswer: q.answer,
  }))
  result.value = await quizApi.submit(payload)
  phase.value = 'result'
}

function retry() {
  phase.value = 'select'
}

const isCorrect = (i: number) => answers[i] === questions.value[i].answer
const scorePercent = computed(() =>
  result.value && result.value.total > 0
    ? Math.round((result.value.correct / result.value.total) * 100)
    : 0,
)
</script>

<template>
  <div class="page">
    <!-- 选题型 -->
    <template v-if="phase === 'select'">
      <h1 class="page-title">{{ t('quiz.title') }}</h1>
      <p class="page-subtitle">{{ t('quiz.subtitle') }}</p>

      <div class="type-grid" v-loading="loading">
        <button
          v-for="ty in types"
          :key="ty.key"
          class="els-card type-card"
          :class="{ selected: selectedType === ty.key }"
          @click="selectedType = ty.key"
        >
          <span class="type-icon">{{ ty.icon }}</span>
          <span class="type-name">{{ t(`quiz.${ty.key}`) }}</span>
          <span class="type-desc">{{ t(`quiz.${ty.key}Desc`) }}</span>
        </button>
      </div>

      <div class="count-row els-card">
        <span class="count-label">{{ t('quiz.count') }}</span>
        <el-radio-group v-model="count">
          <el-radio-button :value="5">5</el-radio-button>
          <el-radio-button :value="10">10</el-radio-button>
          <el-radio-button :value="20">20</el-radio-button>
        </el-radio-group>
        <button class="els-btn-gradient start-btn" :disabled="loading" @click="start">
          {{ t('quiz.start') }} →
        </button>
      </div>
    </template>

    <!-- 答题 -->
    <template v-if="phase === 'playing' && current">
      <div class="quiz-session">
        <div class="session-top">
          <button class="back-btn" @click="phase = 'select'">←</button>
          <span class="session-mode">{{ t(`quiz.${current.type}`) }}</span>
          <span class="session-count">{{ currentIndex + 1 }} / {{ questions.length }}</span>
        </div>
        <el-progress :percentage="Math.round(((currentIndex + (answered[currentIndex] ? 1 : 0)) / questions.length) * 100)" :stroke-width="10" :show-text="false" class="session-progress" />

        <div class="els-card question-card fade-up" :key="currentIndex">
          <!-- 听力题：大喇叭按钮 -->
          <div v-if="current.type === 'listening'" class="listen-area">
            <button class="listen-btn" @click="speak(current.audioText!)">🔊</button>
            <span class="listen-hint">{{ t('quiz.playAgain') }}</span>
          </div>
          <!-- cloze：例句挖空 -->
          <p v-else-if="current.type === 'cloze'" class="cloze-sentence">{{ current.prompt }}</p>
          <!-- 其它：题干 -->
          <h2 v-else class="question-prompt">{{ current.prompt }}</h2>

          <div class="options">
            <button
              v-for="opt in current.options"
              :key="opt"
              class="option-btn"
              :class="{
                chosen: answers[currentIndex] === opt,
                correct: answered[currentIndex] && opt === current.answer,
                wrong: answered[currentIndex] && answers[currentIndex] === opt && opt !== current.answer,
              }"
              :disabled="answered[currentIndex]"
              @click="choose(opt)"
            >
              {{ opt }}
            </button>
          </div>

          <div v-if="answered[currentIndex]" class="feedback" :class="isCorrect(currentIndex) ? 'fb-ok' : 'fb-bad'">
            <template v-if="isCorrect(currentIndex)">✓ {{ t('quiz.correct') }}</template>
            <template v-else>✗ {{ t('quiz.wrong') }}: <b>{{ current.answer }}</b></template>
          </div>

          <div class="q-actions">
            <button v-if="answered[currentIndex]" class="els-btn-gradient" @click="next">
              {{ currentIndex + 1 >= questions.length ? t('quiz.viewResult') : t('quiz.nextQuestion') }} →
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 结果 -->
    <template v-if="phase === 'result' && result">
      <div class="result-view fade-up">
        <div class="score-ring" :style="{ background: `conic-gradient(var(--els-green) ${scorePercent * 3.6}deg, #eee 0deg)` }">
          <div class="score-inner">
            <div class="score-num">{{ scorePercent }}</div>
            <div class="score-unit">%</div>
          </div>
        </div>
        <h2>{{ t('quiz.resultTitle') }}</h2>
        <p class="result-sub">{{ result.correct }} / {{ result.total }}</p>

        <div v-if="result.results.some((r) => !r.isCorrect)" class="els-card wrong-list">
          <h3>{{ t('quiz.wrongWords') }}</h3>
          <div v-for="r in result.results.filter((x) => !x.isCorrect)" :key="r.wordId" class="wrong-word">
            <span class="ww-head">{{ r.headword }}</span>
            <button class="speak-mini" @click="speak(r.headword)">🔊</button>
          </div>
        </div>

        <div class="done-actions">
          <button class="els-btn-gradient" @click="retry">{{ t('quiz.retry') }}</button>
          <button class="ghost-btn" @click="retry">{{ t('quiz.back') }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.type-card {
  border: 2.5px solid transparent;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.type-card.selected {
  border-color: var(--els-primary);
  box-shadow: var(--els-shadow-hover);
}

.type-icon {
  font-size: 28px;
}

.type-name {
  font-weight: 800;
  font-size: 16px;
}

.type-desc {
  color: var(--els-text-secondary);
  font-size: 12.5px;
}

.count-row {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}

.count-label {
  font-weight: 700;
}

.start-btn {
  margin-left: auto;
  padding: 10px 30px;
}

.quiz-session {
  max-width: 640px;
  margin: 0 auto;
}

.session-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
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

.session-progress {
  margin-bottom: 20px;
}

.question-card {
  padding: 32px 28px;
  text-align: center;
}

.question-prompt {
  font-size: 32px;
  font-weight: 900;
  margin: 8px 0 26px;
}

.cloze-sentence {
  font-size: 21px;
  line-height: 1.8;
  margin: 8px 0 26px;
  font-style: italic;
}

.listen-area {
  margin: 12px 0 26px;
}

.listen-btn {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  border: none;
  background: var(--els-gradient);
  color: #fff;
  font-size: 34px;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: var(--els-shadow-hover);
}

.listen-btn:hover {
  transform: scale(1.08);
}

.listen-hint {
  display: block;
  margin-top: 10px;
  color: var(--els-text-secondary);
  font-size: 13px;
}

.options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.option-btn {
  border: 2px solid var(--els-border);
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 15.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.option-btn:hover:not(:disabled) {
  border-color: var(--els-primary);
  color: var(--els-primary);
}

.option-btn.correct {
  border-color: var(--els-green);
  background: rgba(0, 184, 148, 0.08);
  color: var(--els-green);
}

.option-btn.wrong {
  border-color: #d63031;
  background: rgba(214, 48, 49, 0.06);
  color: #d63031;
}

.feedback {
  margin-top: 18px;
  font-size: 15px;
  font-weight: 600;
}

.fb-ok { color: var(--els-green); }
.fb-bad { color: #d63031; }

.q-actions {
  margin-top: 20px;
}

/* 结果页 */
.result-view {
  text-align: center;
  padding: 30px 0;
}

.score-ring {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  margin: 0 auto 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.score-inner {
  width: 110px;
  height: 110px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: baseline;
  justify-content: center;
  padding-top: 32px;
}

.score-num {
  font-size: 38px;
  font-weight: 900;
}

.score-unit {
  font-size: 15px;
  color: var(--els-text-secondary);
  font-weight: 700;
}

.result-sub {
  color: var(--els-text-secondary);
  margin: 4px 0 26px;
}

.wrong-list {
  max-width: 420px;
  margin: 0 auto 26px;
  text-align: left;
}

.wrong-list h3 {
  margin: 0 0 12px;
  font-size: 16px;
}

.wrong-word {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--els-border);
}

.ww-head {
  font-weight: 700;
  font-size: 16px;
}

.speak-mini {
  border: none;
  background: rgba(108, 92, 231, 0.1);
  border-radius: 50%;
  width: 30px;
  height: 30px;
  cursor: pointer;
}

.done-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.ghost-btn {
  border: 2px solid var(--els-border);
  background: #fff;
  border-radius: 999px;
  padding: 10px 26px;
  font-weight: 600;
  cursor: pointer;
}
</style>
