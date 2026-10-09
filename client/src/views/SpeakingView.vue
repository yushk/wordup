<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { reviewApi, type StudyCard } from '../api/review'
import { useSpeech } from '../composables/useSpeech'
import { useRecorder } from '../composables/useRecorder'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const { speak } = useSpeech()
const recorder = useRecorder()

const cards = ref<StudyCard[]>([])
const index = ref(0)
const accent = ref<'us' | 'uk'>('us')
const loading = ref(true)

const current = computed(() => cards.value[index.value] ?? null)

async function load() {
  loading.value = true
  try {
    cards.value = await reviewApi.queue('new', 20)
  } catch {
    router.push({ name: 'study' })
  } finally {
    loading.value = false
  }
}

onMounted(load)

function playStandard() {
  if (current.value) speak(current.value.headword, accent.value, 0.8)
}

async function toggleRecord() {
  if (recorder.recording.value) {
    recorder.stop()
  } else {
    recorder.reset()
    await recorder.start()
    if (recorder.error.value) {
      ElMessage.error(t('speaking.needMic'))
    }
  }
}

function next() {
  recorder.reset()
  index.value = (index.value + 1) % cards.value.length
  if (current.value) {
    setTimeout(() => speak(current.value!.headword, accent.value, 0.8), 300)
  }
}
</script>

<template>
  <div class="page" v-loading="loading">
    <h1 class="page-title">{{ t('speaking.title') }}</h1>
    <p class="page-subtitle">{{ t('speaking.subtitle') }}</p>

    <div v-if="current" class="speak-session">
      <div class="accent-row">
        <el-radio-group v-model="accent">
          <el-radio-button value="us">{{ t('speaking.us') }} 🇺🇸</el-radio-button>
          <el-radio-button value="uk">{{ t('speaking.uk') }} 🇬🇧</el-radio-button>
        </el-radio-group>
      </div>

      <div class="els-card speak-card fade-up" :key="current.wordId">
        <div class="word-display">{{ current.headword }}</div>
        <div v-if="current.phoneticUs && accent === 'us'" class="phonetic">/{{ current.phoneticUs }}/</div>
        <div v-if="current.phoneticUk && accent === 'uk'" class="phonetic">/{{ current.phoneticUk }}/</div>
        <div v-if="current.definitions.length" class="word-def">
          {{ current.definitions[0].pos }} {{ current.definitions[0].cn }}
        </div>

        <div class="controls">
          <button class="ctrl-btn play-std" @click="playStandard">▶ {{ t('speaking.playStandard') }}</button>

          <button
            class="ctrl-btn record-btn"
            :class="{ recording: recorder.recording.value }"
            @click="toggleRecord"
          >
            {{ recorder.recording.value ? '⏹ ' + t('speaking.stopRecord') : '🎙 ' + t('speaking.startRecord') }}
          </button>

          <button class="ctrl-btn play-mine" :disabled="!recorder.hasRecording.value" @click="recorder.play()">
            🔊 {{ t('speaking.playMine') }}
          </button>
        </div>

        <p class="hint">{{ t('speaking.hint') }}</p>

        <div class="bottom-row">
          <button v-if="recorder.hasRecording.value" class="re-record" @click="recorder.reset(); toggleRecord()">
            ↺ {{ t('speaking.reRecord') }}
          </button>
          <button class="els-btn-gradient next-btn" @click="next">{{ t('speaking.nextWord') }} →</button>
        </div>
      </div>

      <div v-if="recorder.recording.value" class="recording-indicator">
        <span class="pulse-dot"></span> REC
      </div>
    </div>
    <div v-else-if="!loading" class="els-card no-book">
      <p>{{ t('study.noWordbook') }}</p>
      <RouterLink :to="{ name: 'study' }" class="els-btn-gradient">{{ t('study.goChoose') }} →</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.speak-session {
  max-width: 560px;
}

.accent-row {
  margin-bottom: 16px;
}

.speak-card {
  text-align: center;
  padding: 38px 28px;
}

.word-display {
  font-size: 48px;
  font-weight: 900;
}

.phonetic {
  color: var(--els-text-secondary);
  font-size: 17px;
  margin-top: 6px;
}

.word-def {
  margin-top: 8px;
  color: var(--els-text-secondary);
  font-size: 15px;
}

.controls {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 30px;
}

.ctrl-btn {
  border: none;
  border-radius: 999px;
  padding: 12px 22px;
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.play-std {
  background: var(--els-gradient);
  color: #fff;
}

.record-btn {
  background: linear-gradient(135deg, #d63031, #ff7675);
  color: #fff;
}

.record-btn.recording {
  animation: pulse 1s infinite;
}

.play-mine {
  background: var(--els-gradient-green);
  color: #fff;
}

.play-mine:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}

.hint {
  color: #b2b2bd;
  font-size: 13px;
  margin: 22px 0 0;
}

.bottom-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 22px;
}

.re-record {
  border: 2px solid var(--els-border);
  background: #fff;
  border-radius: 999px;
  padding: 9px 20px;
  font-weight: 600;
  cursor: pointer;
  font-size: 13.5px;
}

.next-btn {
  padding: 10px 24px;
}

.recording-indicator {
  text-align: center;
  margin-top: 16px;
  color: #d63031;
  font-weight: 800;
  letter-spacing: 2px;
}

.pulse-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  background: #d63031;
  border-radius: 50%;
  margin-right: 6px;
  animation: pulse 1s infinite;
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
</style>
