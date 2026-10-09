import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../api/auth'
import type { UserInfo } from '../api/auth'

const TOKEN_KEY = 'els_token'
const USER_KEY = 'els_user'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<UserInfo | null>(
    localStorage.getItem(USER_KEY) ? JSON.parse(localStorage.getItem(USER_KEY)!) : null,
  )

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  function setAuth(newToken: string, newUser: UserInfo) {
    token.value = newToken
    user.value = newUser
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(newUser))
  }

  async function login(email: string, password: string) {
    const data = await authApi.login({ email, password })
    setAuth(data.token, data.user)
  }

  async function register(email: string, password: string, nickname: string) {
    const data = await authApi.register({ email, password, nickname })
    setAuth(data.token, data.user)
  }

  async function fetchMe() {
    if (!token.value) return
    try {
      user.value = await authApi.me()
      localStorage.setItem(USER_KEY, JSON.stringify(user.value))
    } catch {
      logout()
    }
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return { token, user, isLoggedIn, isAdmin, login, register, fetchMe, logout, setAuth }
})
