<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()

const menus = [
  { name: 'admin-wordbooks', label: 'admin.wordbooks', icon: '📚' },
  { name: 'admin-articles', label: 'admin.articles', icon: '📝' },
  { name: 'admin-users', label: 'admin.users', icon: '👥' },
]
</script>

<template>
  <div class="page admin-page">
    <h1 class="page-title">{{ t('admin.title') }}</h1>
    <div class="admin-layout">
      <aside class="admin-side">
        <RouterLink
          v-for="m in menus"
          :key="m.name"
          :to="{ name: m.name }"
          class="admin-menu-item"
          :class="{ active: route.name === m.name }"
        >
          <span>{{ m.icon }}</span>{{ t(m.label) }}
        </RouterLink>
      </aside>
      <div class="admin-main">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 18px;
  align-items: start;
}

.admin-side {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: sticky;
  top: 80px;
}

.admin-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border-radius: 12px;
  text-decoration: none;
  color: var(--els-text-secondary);
  font-weight: 600;
  font-size: 14.5px;
  transition: all 0.15s;
}

.admin-menu-item:hover {
  background: rgba(108, 92, 231, 0.07);
  color: var(--els-primary);
}

.admin-menu-item.active {
  background: var(--els-gradient);
  color: #fff;
}

@media (max-width: 700px) {
  .admin-layout {
    grid-template-columns: 1fr;
  }
  .admin-side {
    flex-direction: row;
    position: static;
    overflow-x: auto;
  }
}
</style>
