import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/study',
      name: 'study',
      component: () => import('../views/StudyView.vue'),
      // 无 requiresAuth：游客免登录体验（组件内 isGuest 分支处理）
    },
    {
      path: '/wordbooks',
      redirect: '/study',
    },
    {
      path: '/quiz',
      name: 'quiz',
      component: () => import('../views/QuizView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/reading',
      name: 'reading',
      component: () => import('../views/ReadingListView.vue'),
    },
    {
      path: '/reading/:id',
      name: 'reading-detail',
      component: () => import('../views/ReadingDetailView.vue'),
    },
    {
      path: '/speaking',
      name: 'speaking',
      component: () => import('../views/SpeakingView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/stats',
      name: 'stats',
      component: () => import('../views/StatsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/admin/AdminView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
      children: [
        { path: '', redirect: '/admin/wordbooks' },
        {
          path: 'wordbooks',
          name: 'admin-wordbooks',
          component: () => import('../views/admin/AdminWordbooks.vue'),
        },
        {
          path: 'articles',
          name: 'admin-articles',
          component: () => import('../views/admin/AdminArticles.vue'),
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('../views/admin/AdminUsers.vue'),
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && auth.isLoggedIn) {
    return { name: 'home' }
  }
  if (to.meta.requiresAdmin && auth.user?.role !== 'ADMIN') {
    return { name: 'home' }
  }
})

/** SEO：按路由动态设置页面标题 */
const TITLES: Record<string, string> = {
  home: 'WordUp · 打字背单词 - 免费在线英语学习（SM-2 记忆算法）',
  study: '学单词 · 打字练习背单词 - WordUp',
  quiz: '单词测验 · 四种题型检验学习成果 - WordUp',
  reading: '分级阅读听力 · 边读边听 - WordUp',
  'reading-detail': '文章阅读 - WordUp',
  speaking: '口语跟读练习 - WordUp',
  stats: '学习统计 · 打卡与学习曲线 - WordUp',
  login: '登录 - WordUp 英语学习',
  register: '免费注册 · 开始英语学习之旅 - WordUp',
}
router.afterEach((to) => {
  document.title = TITLES[to.name as string] ?? 'WordUp · 英语学习'
})

export default router
