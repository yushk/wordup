<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { wordbookApi, type Wordbook } from '../../api/wordbooks'
import { adminApi } from '../../api/admin'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const books = ref<Wordbook[]>([])
const loading = ref(false)

const form = reactive({
  name: '',
  nameEn: '',
  level: '',
})
const file = ref<File | null>(null)
const importing = ref(false)

async function load() {
  loading.value = true
  try {
    books.value = await wordbookApi.list()
  } finally {
    loading.value = false
  }
}
load()

function onFileChange(f: File | null) {
  file.value = f
}

async function doImport() {
  if (!form.name || !form.level || !file.value) {
    ElMessage.warning('请填写完整并选择 JSON 文件')
    return
  }
  importing.value = true
  try {
    const fd = new FormData()
    fd.append('file', file.value)
    fd.append('name', form.name)
    fd.append('nameEn', form.nameEn || form.name)
    fd.append('level', form.level)
    const r = await adminApi.importWordbook(fd)
    ElMessage.success(t('admin.importResult', { inserted: r.inserted, total: r.wordCount }))
    await load()
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div>
    <div class="els-card import-card" v-loading="importing">
      <h3>{{ t('admin.importWordbook') }}</h3>
      <el-form label-position="top">
        <div class="form-row">
          <el-form-item :label="t('admin.importName')">
            <el-input v-model="form.name" placeholder="大学英语四级" />
          </el-form-item>
          <el-form-item :label="t('admin.importNameEn')">
            <el-input v-model="form.nameEn" placeholder="CET-4" />
          </el-form-item>
          <el-form-item :label="t('admin.importLevel')">
            <el-select v-model="form.level" style="width: 100%">
              <el-option v-for="lv in ['starter','primary','junior','senior','cet4','cet6','kaoyan','ielts','toefl','custom1','custom2']" :key="lv" :label="lv" :value="lv" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item :label="t('admin.importFile')">
          <input type="file" accept=".json" @change="onFileChange(($event.target as HTMLInputElement).files?.[0] ?? null)" />
        </el-form-item>
        <p class="format-hint">
          JSON 格式：<code>[{"{'{'"}headword, phoneticUs?, phoneticUk?, definitions:[{"{'{'}pos,cn{'}'}"], exampleSentence?{'}'}"}]</code>
          或扇贝格式 <code>[{"{'{'"}word, usphone, ukphone, trans:[]{'}'}"}]</code>
        </p>
        <el-button type="primary" :loading="importing" @click="doImport">{{ t('admin.importSubmit') }}</el-button>
      </el-form>
    </div>

    <div class="els-card list-card" v-loading="loading">
      <h3>{{ t('admin.wordbooks') }}</h3>
      <el-table :data="books" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" :label="t('admin.importName')" />
        <el-table-column prop="nameEn" :label="t('admin.importNameEn')" />
        <el-table-column prop="level" :label="t('admin.importLevel')" width="100" />
        <el-table-column prop="wordCount" label="词数" width="90" />
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.import-card {
  margin-bottom: 18px;
}

.import-card h3,
.list-card h3 {
  margin: 0 0 14px;
  font-size: 16px;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0 14px;
}

.format-hint {
  color: var(--els-text-secondary);
  font-size: 12.5px;
  background: #f7f7fb;
  border-radius: 8px;
  padding: 10px 12px;
  word-break: break-all;
}
</style>
