<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const form = reactive({ email: '', password: '', nickname: '' })
const loading = ref(false)

async function submit() {
  if (!form.email || !form.password || !form.nickname) return
  loading.value = true
  try {
    await auth.register(form.email, form.password, form.nickname)
    router.push({ name: 'study' })
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card els-card fade-up">
      <h1 class="auth-title">{{ t('register.title') }}</h1>
      <p class="auth-sub">{{ t('register.subtitle') }}</p>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('register.nickname')">
          <el-input v-model="form.nickname" size="large" maxlength="24" />
        </el-form-item>
        <el-form-item :label="t('register.email')">
          <el-input v-model="form.email" type="email" size="large" autocomplete="email" />
        </el-form-item>
        <el-form-item :label="t('register.password')">
          <el-input v-model="form.password" type="password" size="large" show-password autocomplete="new-password" @keyup.enter="submit" />
        </el-form-item>
        <el-button type="primary" size="large" class="auth-submit" :loading="loading" @click="submit">
          {{ t('register.submit') }}
        </el-button>
      </el-form>
      <RouterLink :to="{ name: 'login' }" class="auth-switch">{{ t('register.toLogin') }}</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: calc(100vh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px 16px;
  background:
    radial-gradient(ellipse 60% 50% at 80% 10%, rgba(0, 184, 148, 0.12), transparent),
    radial-gradient(ellipse 50% 40% at 10% 90%, rgba(108, 92, 231, 0.1), transparent);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 36px 32px;
}

.auth-title {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 800;
}

.auth-sub {
  color: var(--els-text-secondary);
  margin: 0 0 24px;
  font-size: 14px;
}

.auth-submit {
  width: 100%;
  border-radius: 999px;
  height: 44px;
  font-size: 15px;
  font-weight: 700;
  background: var(--els-gradient);
  border: none;
}

.auth-switch {
  display: block;
  text-align: center;
  margin-top: 18px;
  color: var(--els-primary);
  text-decoration: none;
  font-size: 14px;
}
</style>
