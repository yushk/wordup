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

export default router
