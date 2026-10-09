<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { wordbookApi, type Wordbook } from '../api/wordbooks'
import { statsApi, type LeaderboardType, type LeaderboardRow } from '../api/stats'

const { t } = useI18n()
const auth = useAuthStore()
const books = ref<Wordbook[]>([])

onMounted(async () => {
  try {
    books.value = (await wordbookApi.list()).slice(0, 6)
  } catch {
    /* 首页容错 */
  }
  loadLeaderboard()
})

// ===== 挑战榜单 =====
const boardTabs: { key: LeaderboardType; icon: string }[] = [
  { key: 'today', icon: '🔥' },
  { key: 'streak', icon: '📅' },
  { key: 'total', icon: '📚' },
  { key: 'wpm', icon: '⌨️' },
]
const boardType = ref<LeaderboardType>('today')
const boardRows = ref<LeaderboardRow[]>([])
const boardLoading = ref(false)

async function loadLeaderboard() {
  boardLoading.value = true
  try {
    boardRows.value = await statsApi.leaderboard(boardType.value)
  } catch {
    boardRows.value = []
  } finally {
    boardLoading.value = false
  }
}

function switchBoard(type: LeaderboardType) {
  if (boardType.value === type) return
  boardType.value = type
  loadLeaderboard()
}

const medals = ['🥇', '🥈', '🥉']
function valueText(type: LeaderboardType, v: number): string {
  if (type === 'streak') return t('leaderboard.streakDays', { n: v })
  if (type === 'wpm') return `${v} WPM`
  if (type === 'today') return t('leaderboard.todayWords', { n: v })
  return t('leaderboard.totalWords', { n: v })
}

const bookColors = ['var(--els-gradient)', 'var(--els-gradient-green)', 'var(--els-gradient-orange)', 'linear-gradient(135deg,#0984e3,#74b9ff)', 'linear-gradient(135deg,#e84393,#fd79a8)', 'linear-gradient(135deg,#fdcb6e,#ffeaa7)']
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="hero">
      <div class="hero-inner">
        <h1 class="hero-title fade-up">{{ t('home.heroTitle') }}</h1>
        <p class="hero-sub fade-up">{{ t('home.heroSubtitle') }}</p>
        <div class="hero-cta fade-up">
          <RouterLink v-if="!auth.isLoggedIn" :to="{ name: 'register' }" class="els-btn-gradient cta-main">
            {{ t('home.ctaStart') }} →
          </RouterLink>
          <RouterLink v-else :to="{ name: 'study' }" class="els-btn-gradient cta-main">
            {{ t('nav.study') }} →
          </RouterLink>
          <RouterLink :to="{ name: 'study' }" class="cta-ghost">{{ t('home.ctaBrowse') }}</RouterLink>
        </div>
        <div class="hero-cards fade-up">
          <div class="hero-card hc1">apple /ˈæpl/ 🍎</div>
          <div class="hero-card hc2">1 天后复习 ⏰</div>
          <div class="hero-card hc3">已掌握 128 词 🎉</div>
        </div>
      </div>
    </section>

    <!-- Leaderboard -->
    <section class="page">
      <h2 class="section-title">🏆 {{ t('leaderboard.title') }}</h2>
      <div class="board-tabs">
        <button
          v-for="tb in boardTabs"
          :key="tb.key"
          class="board-tab"
          :class="{ active: boardType === tb.key }"
          @click="switchBoard(tb.key)"
        >
          {{ tb.icon }} {{ t(`leaderboard.${tb.key}`) }}
        </button>
      </div>

      <div class="els-card board-card" v-loading="boardLoading">
        <template v-if="boardRows.length > 0">
          <div
            v-for="row in boardRows"
            :key="row.rank"
            class="board-row"
            :class="{ me: auth.user?.nickname === row.nickname && auth.isLoggedIn }"
          >
            <span class="row-rank">{{ medals[row.rank - 1] ?? row.rank }}</span>
            <span class="row-name">{{ row.nickname }}</span>
            <span class="row-value">{{ valueText(boardType, row.value) }}</span>
          </div>
        </template>
        <p v-else-if="!boardLoading" class="board-empty">{{ t('leaderboard.empty') }}</p>
      </div>
    </section>

    <!-- Wordbooks -->
    <section class="page" style="padding-top: 0">
      <h2 class="section-title">{{ t('home.wordbookTitle') }}</h2>
      <div class="books-grid">
        <RouterLink
          v-for="(b, i) in books"
          :key="b.id"
          :to="{ name: 'study' }"
          class="book-card"
          :style="{ background: bookColors[i % bookColors.length] }"
        >
          <div class="book-name">{{ b.name }}</div>
          <div class="book-name-en">{{ b.nameEn }}</div>
          <div class="book-count">{{ t('home.joinCount', { count: b.wordCount }) }}</div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  background:
    radial-gradient(ellipse 80% 60% at 70% -10%, rgba(108, 92, 231, 0.18), transparent),
    radial-gradient(ellipse 60% 50% at 10% 110%, rgba(0, 184, 148, 0.14), transparent);
  padding: 70px 20px 50px;
}

.hero-inner {
  max-width: 860px;
  margin: 0 auto;
  text-align: center;
}

.hero-title {
  font-size: clamp(30px, 6vw, 48px);
  font-weight: 900;
  margin: 0 0 14px;
  background: linear-gradient(135deg, #6c5ce7, #e84393);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-sub {
  font-size: 17px;
  color: var(--els-text-secondary);
  margin: 0 0 30px;
}

.hero-cta {
  display: flex;
  gap: 14px;
  justify-content: center;
  margin-bottom: 44px;
}

.cta-main {
  font-size: 16px;
  padding: 13px 32px;
}

.cta-ghost {
  border: 2px solid var(--els-border);
  color: var(--els-text);
  border-radius: 999px;
  padding: 12px 30px;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.2s;
}

.cta-ghost:hover {
  border-color: var(--els-primary);
  color: var(--els-primary);
}

.hero-cards {
  display: flex;
  gap: 14px;
  justify-content: center;
  flex-wrap: wrap;
}

.hero-card {
  background: #fff;
  border-radius: 14px;
  padding: 12px 20px;
  font-weight: 700;
  box-shadow: var(--els-shadow);
  animation: float 4s ease-in-out infinite;
}

.hc2 { animation-delay: 0.7s; }
.hc3 { animation-delay: 1.4s; }

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.section-title {
  font-size: 24px;
  font-weight: 800;
  margin: 0 0 22px;
}

/* ===== 挑战榜单 ===== */
.board-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.board-tab {
  border: 1.5px solid var(--els-border);
  background: #fff;
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--els-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.board-tab:hover {
  border-color: var(--els-primary);
  color: var(--els-primary);
}

.board-tab.active {
  background: var(--els-gradient);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 4px 12px rgba(108, 92, 231, 0.3);
}

.board-card {
  max-width: 560px;
  padding: 10px 22px;
}

.board-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 8px;
  border-bottom: 1px dashed var(--els-border);
}

.board-row:last-child {
  border-bottom: none;
}

.board-row.me {
  background: rgba(108, 92, 231, 0.07);
  border-radius: 10px;
}

.row-rank {
  width: 34px;
  font-size: 17px;
  font-weight: 800;
  color: var(--els-text-secondary);
  text-align: center;
}

.row-name {
  flex: 1;
  font-weight: 700;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-value {
  font-weight: 800;
  font-size: 14.5px;
  color: var(--els-primary);
  white-space: nowrap;
}

.board-empty {
  text-align: center;
  color: var(--els-text-secondary);
  padding: 26px 0;
  margin: 0;
  font-size: 14px;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.book-card {
  border-radius: var(--els-radius);
  padding: 22px;
  color: #fff;
  text-decoration: none;
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.book-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--els-shadow-hover);
}

.book-name {
  font-size: 18px;
  font-weight: 800;
}

.book-name-en {
  font-size: 13px;
  opacity: 0.85;
}

.book-count {
  margin-top: 10px;
  font-size: 13px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  padding: 3px 12px;
  align-self: flex-start;
}
</style>
