<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { articleApi, type ArticleDetail } from '../api/articles'
import { useSpeech } from '../composables/useSpeech'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const { speak, stop } = useSpeech()

const article = ref<ArticleDetail | null>(null)
const loading = ref(true)
const showTranslation = ref(false)
const playing = ref(false)
const savingWord = ref<string | null>(null)

// 点词弹层
const wordPopup = ref<{ word: string; x: number; y: number } | null>(null)

const savedSet = computed(() => new Set((article.value?.savedWords ?? []).map((w) => w.word)))

/** 弹层左边界（防止超出屏幕右侧） */
function popupLeft(x: number): string {
  return `${Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 260)}px`
}

async function load() {
  loading.value = true
  try {
    article.value = await articleApi.detail(Number(route.params.id))
  } finally {
    loading.value = false
  }
}

onMounted(load)
onUnmounted(stop)

/** 把正文按段落拆分，再把 token 拆成 [词, 标点]，词包上可点 span */
const paragraphs = computed(() => {
  if (!article.value) return []
  return article.value.contentMd
    .split(/\n+/)
    .filter((p) => p.trim())
    .map((p) =>
      p
        .split(/(\s+)/)
        .flatMap((token) => {
          // "garden." → [{word:"garden",isWord:true},{word:".",isWord:false}]
          const m = /^([A-Za-z][A-Za-z'’-]*)(.*)$/.exec(token)
          if (!m || !m[1]) return [{ word: token, isWord: false }]
          return [
            { word: m[1], isWord: true },
            ...(m[2] ? [{ word: m[2], isWord: false }] : []),
          ]
        }),
    )
})

function onWordClick(e: MouseEvent, word: string) {
  if (!auth.isLoggedIn) {
    ElMessage.info(t('wordbooks.needLogin'))
    return
  }
  wordPopup.value = { word, x: e.clientX, y: e.clientY }
  // 同时读一下发音
  speak(word)
}

async function saveWord(word: string, remove = false) {
  if (!article.value) return
  savingWord.value = word
  try {
    article.value.savedWords = await articleApi.saveWord(article.value.id, { word, remove })
    if (!remove) ElMessage.success(t('common.success'))
  } finally {
    savingWord.value = null
    wordPopup.value = null
  }
}

function closePopup() {
  wordPopup.value = null
}

/** 整篇朗读：按段落逐个播放 */
async function playAll() {
  if (!article.value) return
  if (playing.value) {
    stop()
    playing.value = false
    return
  }
  playing.value = true
  const text = article.value.contentMd.replace(/\n+/g, '. ')
  await speak(text, 'us', 0.9)
  playing.value = false
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div v-if="article" class="reader">
      <div class="reader-top">
        <RouterLink :to="{ name: 'reading' }" class="back-link">← {{ t('reading.back') }}</RouterLink>
        <div class="reader-actions">
          <el-button :type="playing ? 'danger' : 'primary'" round @click="playAll">
            {{ playing ? '⏹ ' + t('reading.stopPlay') : '▶ ' + t('reading.playAll') }}
          </el-button>
          <el-button round @click="showTranslation = !showTranslation">
            {{ showTranslation ? t('reading.hideTranslation') : t('reading.showTranslation') }}
          </el-button>
        </div>
      </div>

      <h1 class="reader-title">{{ article.title }}</h1>
      <div class="reader-meta">
        <span class="level-pill">L{{ article.level }}</span>
        <span>{{ article.titleEn }}</span>
        <span>· {{ t('reading.words', { n: article.wordCount }) }}</span>
      </div>

      <p class="hint">{{ t('reading.clickWordHint') }}</p>

      <div class="els-card article-content">
        <p v-for="(para, pi) in paragraphs" :key="pi">
          <template v-for="(tok, ti) in para" :key="ti">
            <span
              v-if="tok.isWord"
              class="word"
              :class="{ saved: savedSet.has(tok.word.toLowerCase()) }"
              @click="onWordClick($event, tok.word)"
            >{{ tok.word }}</span>
            <template v-else>{{ tok.word }}</template>
          </template>
        </p>
      </div>

      <div v-if="showTranslation" class="els-card translation fade-up">
        <div v-for="(para, i) in article.translation.split('\n')" :key="i">{{ para }}</div>
      </div>
    </div>

    <!-- 点词弹层 -->
    <Teleport to="body">
      <div v-if="wordPopup" class="word-popup-mask" @click="closePopup">
        <div
          class="word-popup"
          :style="{
            left: popupLeft(wordPopup.x),
            top: wordPopup.y + 'px',
          }"
          @click.stop
        >
          <div class="wp-head">
            <span class="wp-word">{{ wordPopup.word }}</span>
            <button class="wp-speak" @click="speak(wordPopup.word)">🔊</button>
          </div>
          <div class="wp-actions">
            <button
              v-if="!savedSet.has(wordPopup.word.toLowerCase())"
              class="wp-btn wp-save"
              :disabled="savingWord === wordPopup.word"
              @click="saveWord(wordPopup.word)"
            >
              ＋ {{ t('reading.saveWord') }}
            </button>
            <button v-else class="wp-btn wp-remove" @click="saveWord(wordPopup.word, true)">
              ✕ {{ t('reading.removeWord') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts">
export default { name: 'ReadingDetailView' }
</script>

<style scoped>
.reader-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  flex-wrap: wrap;
  gap: 10px;
}

.back-link {
  color: var(--els-primary);
  text-decoration: none;
  font-weight: 600;
}

.reader-title {
  font-size: 30px;
  font-weight: 900;
  margin: 0 0 8px;
}

.reader-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--els-text-secondary);
  font-size: 14px;
  margin-bottom: 10px;
}

.level-pill {
  background: var(--els-gradient);
  color: #fff;
  font-weight: 800;
  border-radius: 999px;
  padding: 2px 12px;
  font-size: 12.5px;
}

.hint {
  color: #b2b2bd;
  font-size: 13px;
  margin: 0 0 14px;
}

.translation {
  margin-top: 18px;
  color: var(--els-text-secondary);
  line-height: 2;
}

/* 点词弹层 */
.word-popup-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
}

.word-popup {
  position: fixed;
  transform: translate(-50%, calc(-100% - 14px));
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18);
  padding: 14px 18px;
  min-width: 200px;
  animation: fadeUp 0.18s ease;
}

.wp-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wp-word {
  font-size: 21px;
  font-weight: 800;
}

.wp-speak {
  border: none;
  background: rgba(108, 92, 231, 0.1);
  border-radius: 50%;
  width: 34px;
  height: 34px;
  cursor: pointer;
}

.wp-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.wp-btn {
  border: none;
  border-radius: 999px;
  padding: 7px 16px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

.wp-save {
  background: var(--els-gradient-green);
  color: #fff;
}

.wp-remove {
  background: #f0f0f5;
  color: var(--els-text);
}
</style>
