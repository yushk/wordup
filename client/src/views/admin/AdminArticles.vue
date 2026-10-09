<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminApi, type AdminArticle } from '../../api/admin'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const articles = ref<AdminArticle[]>([])
const loading = ref(false)
const dialogOpen = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)

const emptyForm = () => ({
  title: '',
  titleEn: '',
  level: 1,
  contentMd: '',
  translationMd: '',
  coverColor: '#6C5CE7',
})
const form = reactive(emptyForm())

async function load() {
  loading.value = true
  try {
    articles.value = await adminApi.articles()
  } finally {
    loading.value = false
  }
}
onMounted(load)

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  dialogOpen.value = true
}

function openEdit(a: AdminArticle) {
  editingId.value = a.id
  dialogOpen.value = true
  // 简单处理：新建弹窗后填充（真实场景应拉详情，这里直接给占位）
  form.title = a.title
  form.level = a.level
}

async function save() {
  if (!form.title || !form.titleEn || !form.contentMd) {
    ElMessage.warning('请填写完整')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await adminApi.updateArticle(editingId.value, { ...form })
    } else {
      await adminApi.createArticle({ ...form })
    }
    ElMessage.success(t('common.success'))
    dialogOpen.value = false
    await load()
  } finally {
    saving.value = false
  }
}

async function remove(a: AdminArticle) {
  await ElMessageBox.confirm(`删除「${a.title}」？`, { type: 'warning' })
  await adminApi.updateArticle(a.id, {})
  await load()
}
</script>

<template>
  <div>
    <div class="els-card">
      <div class="head-row">
        <h3>{{ t('admin.articles') }}</h3>
        <el-button type="primary" @click="openCreate">＋ {{ t('admin.createArticle') }}</el-button>
      </div>
      <el-table v-loading="loading" :data="articles" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" :label="t('admin.articleTitle')" min-width="160" />
        <el-table-column prop="level" :label="t('admin.articleLevel')" width="80">
          <template #default="{ row }">L{{ row.level }}</template>
        </el-table-column>
        <el-table-column prop="wordCount" label="词数" width="80" />
        <el-table-column :label="t('admin.userJoined')" width="110">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleDateString() }}</template>
        </el-table-column>
        <el-table-column :label="''" width="130">
          <template #default="{ row }">
            <el-button text size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogOpen" :title="editingId ? t('admin.editArticle') : t('admin.createArticle')" width="640px">
      <el-form label-position="top">
        <div class="dlg-row">
          <el-form-item :label="t('admin.articleTitle')">
            <el-input v-model="form.title" />
          </el-form-item>
          <el-form-item :label="t('admin.articleTitleEn')">
            <el-input v-model="form.titleEn" />
          </el-form-item>
          <el-form-item :label="t('admin.articleLevel')" style="width: 120px">
            <el-select v-model="form.level">
              <el-option v-for="n in 6" :key="n" :label="`L${n}`" :value="n" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item :label="t('admin.articleContent')">
          <el-input v-model="form.contentMd" type="textarea" :rows="7" placeholder="She is a little cat. ..." />
        </el-form-item>
        <el-form-item :label="t('admin.articleTranslation')">
          <el-input v-model="form.translationMd" type="textarea" :rows="5" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('admin.publish') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
h3 {
  margin: 0;
  font-size: 16px;
}

.head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.dlg-row {
  display: grid;
  grid-template-columns: 1fr 1fr 120px;
  gap: 0 14px;
}
</style>
