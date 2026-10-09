<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminApi, type AdminUser } from '../../api/admin'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const users = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await adminApi.users(page.value)
    users.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function toggleRole(u: AdminUser) {
  const next = u.role === 'ADMIN' ? 'USER' : 'ADMIN'
  await adminApi.setRole(u.id, next)
  ElMessage.success(t('common.success'))
  await load()
}
</script>

<template>
  <div class="els-card">
    <h3>{{ t('admin.users') }}</h3>
    <el-table v-loading="loading" :data="users" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="nickname" :label="t('admin.userNickname')" />
      <el-table-column prop="email" :label="t('admin.userEmail')" min-width="190" />
      <el-table-column :label="t('admin.userWords')" width="90">
        <template #default="{ row }">{{ row._count.userWords }}</template>
      </el-table-column>
      <el-table-column :label="t('admin.userJoined')" width="110">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleDateString() }}</template>
      </el-table-column>
      <el-table-column :label="t('admin.userRole')" width="130">
        <template #default="{ row }">
          <el-tag :type="row.role === 'ADMIN' ? 'danger' : 'info'" size="small">{{ row.role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="''" width="120">
        <template #default="{ row }">
          <el-button text size="small" @click="toggleRole(row)">
            {{ row.role === 'ADMIN' ? t('admin.setUser') : t('admin.setAdmin') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager">
      <el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev, pager, next" @current-change="load" />
    </div>
  </div>
</template>

<style scoped>
h3 {
  margin: 0 0 14px;
  font-size: 16px;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}
</style>
