<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { wordbookApi, type Wordbook, type MyWordbook } from '../api/wordbooks'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const books = ref<Wordbook[]>([])
const mine = ref<MyWordbook[]>([])
const loading = ref(true)

// 筛选分组：level → 分组 key（参考 Qwerty 的分类胶囊）
const GROUPS: { key: string; levels: string[] }[] = [
  { key: 'starter', levels: ['starter'] },
  { key: 'primary', levels: ['primary'] },
  { key: 'junior', levels: ['junior'] },
  { key: 'senior', levels: ['senior'] },
  { key: 'college', levels: ['cet4', 'cet6'] },
  { key: 'kaoyan', levels: ['kaoyan'] },
  { key: 'abroad', levels: ['ielts', 'toefl'] },
]
const activeGroup = ref('all')

const mineByBookId = computed(() => new Map(mine.value.map((m) => [m.wordbook.id, m])))

const filteredBooks = computed(() =>
  activeGroup.value === 'all'
    ? books.value
    : books.value.filter((b) => GROUPS.find((g) => g.key === activeGroup.value)?.levels.includes(b.level)),
)

const groupCounts = computed(() => {
  const counts: Record<string, number> = { all: books.value.length }
  for (const g of GROUPS) {
    counts[g.key] = books.value.filter((b) => g.levels.includes(b.level)).length
  }
  return counts
})

async function load() {
  loading.value = true
  try {
    const [all, my] = await Promise.all([
      wordbookApi.list(),
      auth.isLoggedIn ? wordbookApi.mine() : Promise.resolve([]),
    ])
    books.value = all
    mine.value = my
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** 点击卡片：未加入 → 加入；已加入非主 → 设为主词书；主词书 → 无操作 */
async function onCardClick(book: Wordbook) {
  if (!auth.isLoggedIn) {
    ElMessage.info(t('wordbooks.needLogin'))
    router.push({ name: 'login' })
    return
  }
  const mine_ = mineByBookId.value.get(book.id)
  if (!mine_) {
    await wordbookApi.join({ wordbookId: book.id, dailyNewNum: 10 })
    ElMessage.success(t('common.success'))
  } else if (!mine_.isPrimary) {
    await wordbookApi.setPrimary(book.id)
    ElMessage.success(t('wordbooks.primarySet'))
  } else {
    return
  }
  await load()
}

async function leave(book: Wordbook) {
  await ElMessageBox.confirm(t('wordbooks.leaveConfirm', { name: book.name }), { type: 'warning' })
  await wordbookApi.leave(book.id)
  await load()
}
</script>

<template>
  <div class="page" v-loading="loading">
    <h1 class="page-title">{{ t('wordbooks.title') }}</h1>
    <p class="page-subtitle">{{ t('wordbooks.subtitle') }}</p>

    <!-- 分组筛选胶囊 -->
    <div class="group-chips">
      <button
        class="chip"
        :class="{ active: activeGroup === 'all' }"
        @click="activeGroup = 'all'"
      >
        {{ t('wordbooks.all') }} <span class="chip-count">{{ groupCounts.all }}</span>
      </button>
      <button
        v-for="g in GROUPS"
        :key="g.key"
        class="chip"
        :class="{ active: activeGroup === g.key }"
        @click="activeGroup = g.key"
      >
        {{ t(`wordbooks.group.${g.key}`) }} <span class="chip-count">{{ groupCounts[g.key] }}</span>
      </button>
    </div>

    <!-- 紧凑卡片网格 -->
    <div class="books-grid">
      <div
        v-for="b in filteredBooks"
        :key="b.id"
        class="book-card"
        :class="{
          'is-primary': mineByBookId.get(b.id)?.isPrimary,
          'is-joined': mineByBookId.has(b.id),
        }"
        @click="onCardClick(b)"
      >
        <!-- 退出小图标（已加入才显示） -->
        <button
          v-if="mineByBookId.has(b.id)"
          class="leave-btn"
          :title="t('wordbooks.leave')"
          @click.stop="leave(b)"
        >✕</button>

        <div class="card-row-1">
          <span class="book-name">{{ b.name }}</span>
          <span class="book-count">{{ b.wordCount }} {{ t('wordbooks.countUnit') }}</span>
        </div>
        <div class="card-row-2">
          <template v-if="mineByBookId.has(b.id)">
            <span v-if="mineByBookId.get(b.id)!.isPrimary" class="primary-star">★ {{ t('wordbooks.primary') }}</span>
            <span v-else class="joined-chip">{{ t('wordbooks.joined') }}</span>
            <div class="progress-line">
              <div
                class="progress-fill"
                :style="{ width: Math.min(100, (mineByBookId.get(b.id)!.learned / Math.max(1, b.wordCount)) * 100) + '%' }"
              ></div>
            </div>
            <span class="progress-text">
              {{ mineByBookId.get(b.id)!.learned }}/{{ b.wordCount }}
            </span>
          </template>
          <template v-else>
            <span class="level-chip">{{ t(`wordbooks.level.${b.level}`) }}</span>
            <span class="join-hint">+ {{ t('wordbooks.join') }}</span>
          </template>
        </div>
      </div>
    </div>

    <p v-if="filteredBooks.length === 0" class="empty-hint">{{ t('wordbooks.emptyGroup') }}</p>
  </div>
</template>

<style scoped>
.group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 22px;
}

.chip {
  border: 1.5px solid var(--els-border);
  background: #fff;
  border-radius: 999px;
  padding: 7px 16px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--els-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.chip:hover {
  border-color: var(--els-primary);
  color: var(--els-primary);
}

.chip.active {
  background: var(--els-gradient);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 4px 12px rgba(108, 92, 231, 0.3);
}

.chip-count {
  opacity: 0.65;
  font-size: 12px;
  margin-left: 2px;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 14px;
}

.book-card {
  position: relative;
  background: #fff;
  border: 2px solid transparent;
  border-radius: 14px;
  padding: 16px 18px;
  cursor: pointer;
  box-shadow: var(--els-shadow);
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.book-card:hover {
  border-color: var(--els-primary);
  box-shadow: var(--els-shadow-hover);
  transform: translateY(-2px);
}

.book-card.is-joined {
  border-color: rgba(108, 92, 231, 0.35);
}

.book-card.is-primary {
  border-color: var(--els-primary);
  background: linear-gradient(135deg, rgba(108, 92, 231, 0.06), rgba(162, 155, 254, 0.1));
}

.card-row-1 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.book-name {
  font-size: 16.5px;
  font-weight: 800;
}

.book-count {
  font-size: 12.5px;
  color: var(--els-text-secondary);
  white-space: nowrap;
}

.card-row-2 {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 22px;
  flex-wrap: wrap;
}

.primary-star {
  color: var(--els-primary);
  font-size: 12.5px;
  font-weight: 700;
}

.joined-chip {
  color: var(--els-green);
  font-size: 12.5px;
  font-weight: 600;
}

.progress-line {
  flex: 1;
  min-width: 60px;
  height: 6px;
  background: var(--els-border, #ececf3);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--els-gradient);
  border-radius: 999px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 11.5px;
  color: var(--els-text-secondary);
  white-space: nowrap;
}

.level-chip {
  background: rgba(108, 92, 231, 0.1);
  color: var(--els-primary);
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
  padding: 2px 10px;
}

.join-hint {
  color: var(--els-text-secondary);
  font-size: 12.5px;
  opacity: 0;
  transition: opacity 0.15s;
}

.book-card:hover:not(.is-joined) .join-hint {
  opacity: 1;
  color: var(--els-primary);
  font-weight: 700;
}

.leave-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--els-text-secondary);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.book-card:hover .leave-btn {
  opacity: 0.6;
}

.leave-btn:hover {
  opacity: 1 !important;
  background: rgba(214, 48, 49, 0.1);
  color: #d63031;
}

.empty-hint {
  text-align: center;
  color: var(--els-text-secondary);
  padding: 40px 0;
}
</style>
