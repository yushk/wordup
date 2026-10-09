<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from './stores/auth'
import { setLocale } from './i18n'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const mobileMenuOpen = ref(false)

onMounted(() => {
  if (auth.isLoggedIn) auth.fetchMe()
})

function toggleLocale() {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
}

function handleLogout() {
  auth.logout()
  router.push({ name: 'home' })
}

const navItems = [
  { name: 'study', label: 'nav.study' },
  { name: 'quiz', label: 'nav.quiz' },
  { name: 'reading', label: 'nav.reading' },
  { name: 'speaking', label: 'nav.speaking' },
  { name: 'stats', label: 'nav.stats' },
]
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <RouterLink :to="{ name: 'home' }" class="logo">
          <span class="logo-icon">🎯</span>
          <span class="logo-text">WordUp<span class="logo-accent">英语</span></span>
        </RouterLink>

        <nav class="nav-desktop">
          <RouterLink
            v-for="item in navItems"
            :key="item.name"
            :to="{ name: item.name }"
            class="nav-link"
            :class="{ active: route.name === item.name }"
          >
            {{ t(item.label) }}
          </RouterLink>
          <RouterLink
            v-if="auth.isAdmin"
            :to="{ name: 'admin' }"
            class="nav-link"
            :class="{ active: route.path.startsWith('/admin') }"
          >
            {{ t('nav.admin') }}
          </RouterLink>
        </nav>

        <div class="topbar-right">
          <button class="locale-btn" :title="locale === 'zh-CN' ? 'Switch to English' : '切换中文'" @click="toggleLocale">
            {{ locale === 'zh-CN' ? 'EN' : '中' }}
          </button>
          <template v-if="auth.isLoggedIn">
            <el-dropdown trigger="click">
              <span class="user-chip">
                <span class="avatar">{{ auth.user?.nickname?.charAt(0) ?? '?' }}</span>
                <span class="user-name">{{ auth.user?.nickname }}</span>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="handleLogout">{{ t('nav.logout') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
          <template v-else>
            <RouterLink :to="{ name: 'login' }" class="nav-link">{{ t('nav.login') }}</RouterLink>
            <RouterLink :to="{ name: 'register' }" class="els-btn-gradient nav-cta">{{ t('nav.register') }}</RouterLink>
          </template>

          <button class="menu-btn nav-desktop-hide" @click="mobileMenuOpen = !mobileMenuOpen">☰</button>
        </div>
      </div>

      <!-- 移动端菜单 -->
      <div v-if="mobileMenuOpen" class="mobile-menu" @click="mobileMenuOpen = false">
        <RouterLink v-for="item in navItems" :key="item.name" :to="{ name: item.name }" class="mobile-link">
          {{ t(item.label) }}
        </RouterLink>
      </div>
    </header>

    <main class="app-main">
      <RouterView />
    </main>

    <footer class="app-footer">
      WordUp · {{ new Date().getFullYear() }} · Learn English Every Day
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--els-border);
}

.topbar-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 20px;
  height: 60px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  font-weight: 800;
  font-size: 19px;
  color: var(--els-text);
  white-space: nowrap;
}

.logo-icon {
  font-size: 22px;
}

.logo-accent {
  background: var(--els-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.nav-desktop {
  display: flex;
  gap: 4px;
  flex: 1;
}

.nav-link {
  text-decoration: none;
  color: var(--els-text-secondary);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 14.5px;
  font-weight: 500;
  transition: all 0.15s;
}

.nav-link:hover {
  color: var(--els-primary);
  background: rgba(108, 92, 231, 0.08);
}

.nav-link.active {
  color: #fff;
  background: var(--els-gradient);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.locale-btn {
  border: 1.5px solid var(--els-border);
  background: #fff;
  border-radius: 999px;
  width: 34px;
  height: 34px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  color: var(--els-text);
  transition: all 0.15s;
}

.locale-btn:hover {
  border-color: var(--els-primary);
  color: var(--els-primary);
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 10px 4px 4px;
  border-radius: 999px;
  border: 1.5px solid var(--els-border);
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--els-gradient);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
}

.nav-cta {
  font-size: 13.5px;
  padding: 8px 18px;
}

.menu-btn {
  display: none;
  border: none;
  background: none;
  font-size: 22px;
  cursor: pointer;
  color: var(--els-text);
}

.app-main {
  flex: 1;
}

.app-footer {
  text-align: center;
  padding: 26px;
  color: var(--els-text-secondary);
  font-size: 13px;
}

@media (max-width: 860px) {
  .nav-desktop {
    display: none;
  }
  .menu-btn {
    display: block;
  }
  .user-name {
    display: none;
  }
}

.mobile-menu {
  display: flex;
  flex-direction: column;
  padding: 8px 20px 14px;
  background: #fff;
  border-bottom: 1px solid var(--els-border);
}

.mobile-link {
  padding: 10px 8px;
  text-decoration: none;
  color: var(--els-text);
  font-weight: 600;
  border-bottom: 1px solid var(--els-border);
}

@media (min-width: 861px) {
  .mobile-menu {
    display: none;
  }
}
</style>
