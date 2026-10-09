<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { statsApi, type DailyStatItem, type StatsOverview } from '../api/stats'
import * as echarts from 'echarts'

const { t } = useI18n()
const overview = ref<StatsOverview | null>(null)
const daily = ref<DailyStatItem[]>([])
const loading = ref(true)

let chart: echarts.ECharts | null = null

async function load() {
  loading.value = true
  try {
    const [ov, dl] = await Promise.all([statsApi.overview(), statsApi.daily(30)])
    overview.value = ov
    daily.value = dl
    calendarDays.value = buildCalendar()
    await nextTick()
    renderChart()
  } finally {
    loading.value = false
  }
}

function renderChart() {
  const el = document.getElementById('trend-chart')
  if (!el) return
  if (!chart) chart = echarts.init(el)
  chart.setOption({
    grid: { left: 40, right: 16, top: 36, bottom: 28 },
    tooltip: { trigger: 'axis' },
    legend: { data: [t('stats.newWords'), t('stats.reviews')], top: 0 },
    xAxis: {
      type: 'category',
      data: daily.value.map((d) => d.date.slice(5)),
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: t('stats.newWords'),
        type: 'bar',
        stack: 'total',
        data: daily.value.map((d) => d.newWords),
        itemStyle: { color: '#6C5CE7', borderRadius: [0, 0, 0, 0] },
        barMaxWidth: 22,
      },
      {
        name: t('stats.reviews'),
        type: 'bar',
        stack: 'total',
        data: daily.value.map((d) => d.reviewedWords),
        itemStyle: { color: '#00B894', borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 22,
      },
    ],
  })
}

// 简易打卡日历：近 5 周
const calendarDays = ref<{ date: string; active: boolean; isToday: boolean }[]>([])
const WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日']
const WEEKDAYS_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function buildCalendar() {
  const activeSet = new Set(
    daily.value
      .filter((d) => d.newWords + d.reviewedWords + d.quizTotal > 0)
      .map((d) => d.date),
  )
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // 本周一
  const monday = new Date(today)
  const dow = (today.getDay() + 6) % 7
  monday.setDate(today.getDate() - dow - 28) // 从 5 周前的周一开始
  return Array.from({ length: 35 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    if (d > today) return { date: '', active: false, isToday: false }
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      date: String(d.getDate()),
      active: activeSet.has(key),
      isToday: d.getTime() === today.getTime(),
    }
  })
}

function handleResize() {
  chart?.resize()
}

onMounted(() => {
  load()
  window.addEventListener('resize', handleResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})

const statCards = [
  { key: 'streak', icon: '🔥' },
  { key: 'learned', icon: '📖' },
  { key: 'mastered', icon: '🏆' },
  { key: 'activeDays', icon: '📅' },
]
</script>

<template>
  <div class="page" v-loading="loading">
    <h1 class="page-title">{{ t('stats.title') }}</h1>
    <p class="page-subtitle">{{ t('stats.subtitle') }}</p>

    <template v-if="overview">
      <!-- 指标卡 -->
      <div class="stat-grid">
        <div v-for="c in statCards" :key="c.key" class="els-card stat-card fade-up">
          <div class="stat-icon">{{ c.icon }}</div>
          <div class="stat-num">
            {{ overview[c.key as keyof StatsOverview] }}
            <span v-if="c.key === 'streak'" class="stat-unit">{{ t('stats.days') }}</span>
          </div>
          <div class="stat-label">{{ t(`stats.${c.key}`) }}</div>
        </div>
      </div>

      <!-- 学习曲线 -->
      <div class="els-card chart-card">
        <h3>{{ t('stats.chartTitle') }}</h3>
        <div id="trend-chart" class="chart-el"></div>
      </div>

      <!-- 打卡日历 -->
      <div class="els-card calendar-card">
        <h3>{{ t('stats.calendar') }}</h3>
        <div class="cal-weekdays">
          <span v-for="(w, i) in $i18n.locale === 'zh-CN' ? WEEKDAYS_ZH : WEEKDAYS_EN" :key="i">{{ w }}</span>
        </div>
        <div class="cal-grid">
          <div
            v-for="(d, i) in calendarDays"
            :key="i"
            class="cal-day"
            :class="{ active: d.active, today: d.isToday, empty: !d.date }"
          >
            {{ d.date }}
          </div>
        </div>
      </div>

      <!-- 掌握度进度 -->
      <div class="els-card mastery-card">
        <h3>{{ t('stats.mastered') }} / {{ t('stats.totalWords') }}</h3>
        <el-progress
          :percentage="Math.round((overview.mastered / Math.max(1, overview.totalWords)) * 100)"
          :stroke-width="14"
          status="success"
        />
        <span class="mastery-text">{{ overview.mastered }} / {{ overview.totalWords }}</span>
      </div>
    </template>

    <div v-else-if="!loading" class="els-card no-data">
      <p>{{ t('stats.noData') }}</p>
      <RouterLink :to="{ name: 'study' }" class="els-btn-gradient">{{ t('nav.study') }} →</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.stat-card {
  text-align: center;
  padding: 22px 14px;
}

.stat-icon {
  font-size: 26px;
}

.stat-num {
  font-size: 34px;
  font-weight: 900;
  background: var(--els-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.stat-unit {
  font-size: 14px;
}

.stat-label {
  color: var(--els-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.chart-card {
  margin-bottom: 18px;
}

.chart-card h3 {
  margin: 0 0 8px;
  font-size: 16px;
}

.chart-el {
  height: 300px;
  width: 100%;
}

.calendar-card h3 {
  margin: 0 0 12px;
  font-size: 16px;
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  color: var(--els-text-secondary);
  font-size: 12.5px;
  font-weight: 700;
  margin-bottom: 8px;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}

.cal-day {
  aspect-ratio: 1;
  max-height: 52px;
  border-radius: 10px;
  background: #f0f0f5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--els-text-secondary);
}

.cal-day.active {
  background: var(--els-gradient-green);
  color: #fff;
}

.cal-day.today {
  outline: 2.5px solid var(--els-primary);
}

.cal-day.empty {
  visibility: hidden;
}

.mastery-card h3 {
  margin: 0 0 14px;
  font-size: 16px;
}

.mastery-text {
  display: block;
  text-align: right;
  margin-top: 8px;
  color: var(--els-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.no-data {
  text-align: center;
  padding: 60px 20px;
}

.no-data p {
  margin: 0 0 18px;
  color: var(--els-text-secondary);
}

.no-data .els-btn-gradient {
  text-decoration: none;
  display: inline-block;
}
</style>
