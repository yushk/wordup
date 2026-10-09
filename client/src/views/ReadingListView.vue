<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { articleApi, type ArticleBrief } from '../api/articles'

const { t } = useI18n()
const articles = ref<ArticleBrief[]>([])
const total = ref(0)
const level = ref<number | undefined>(undefined)
const page = ref(1)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await articleApi.list({ level: level.value, page: page.value })
    articles.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(level, () => {
  page.value = 1
  load()
})
watch(page, load)

function formatDate(s: string) {
  return new Date(s).toLocaleDateString()
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">{{ t('reading.title') }}</h1>
    <p class="page-subtitle">{{ t('reading.subtitle') }}</p>

    <div class="filter-row">
      <el-radio-group v-model="level">
        <el-radio-button :value="undefined">{{ t('reading.allLevels') }}</el-radio-button>
        <el-radio-button v-for="n in 6" :key="n" :value="n">L{{ n }}</el-radio-button>
      </el-radio-group>
    </div>

    <div v-loading="loading" class="article-grid">
      <RouterLink
        v-for="a in articles"
        :key="a.id"
        :to="{ name: 'reading-detail', params: { id: a.id } }"
        class="els-card article-card fade-up"
      >
        <div class="article-cover" :style="{ background: `linear-gradient(135deg, ${a.coverColor}, ${a.coverColor}99)` }">
          <span class="level-tag">L{{ a.level }}</span>
          <span class="article-title-en">{{ a.titleEn }}</span>
        </div>
        <div class="article-body">
          <div class="article-title">{{ a.title }}</div>
          <div class="article-meta">
            <span>{{ t('reading.words', { n: a.wordCount }) }}</span>
            <span>{{ formatDate(a.createdAt) }}</span>
          </div>
        </div>
      </RouterLink>
    </div>

    <div v-if="!loading && articles.length === 0" class="empty">
      <el-empty />
    </div>

    <div v-if="total > 20" class="pager">
      <el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev, pager, next" />
    </div>
  </div>
</template>

<style scoped>
.filter-row {
  margin-bottom: 22px;
}

.article-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 18px;
  min-height: 200px;
}

.article-card {
  padding: 0;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
}

.article-cover {
  height: 110px;
  display: flex;
  align-items: flex-end;
  padding: 14px;
  position: relative;
}

.level-tag {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 800;
}

.article-title-en {
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

.article-body {
  padding: 14px 16px 16px;
}

.article-title {
  font-size: 16.5px;
  font-weight: 800;
}

.article-meta {
  display: flex;
  justify-content: space-between;
  color: var(--els-text-secondary);
  font-size: 12.5px;
  margin-top: 8px;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 26px;
}
</style>
