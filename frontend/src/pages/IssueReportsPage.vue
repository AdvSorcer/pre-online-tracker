<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  UnauthorizedError,
  deleteIssueReport as deleteIssueReportRequest,
  fetchIssueReports,
  importIssueReports,
  saveIssueReport as saveIssueReportRequest
} from '../api'
import { environmentOptions } from '../constants'
import { buildIssueReportsXlsxBlob, parseIssueReportsXlsx } from '../issueReportWorkbook'
import type { Environment, IssueReport, IssueReportInput, IssueResolutionStatus } from '../types'

const props = defineProps<{
  token: string
  environments: Environment[]
  activeEnvironment: Environment
}>()

const emit = defineEmits<{
  unauthorized: []
  openEnvironment: [environment: Environment]
}>()

type IssueReportForm = {
  id: number | null
  environment: Environment
  issue_description: string
  reported_at: string
  resolution_status: IssueResolutionStatus
  vendor_response: string
  responded_at: string
}
type ResponseFilter = 'all' | 'unanswered'
type ResolutionFilter = IssueResolutionStatus | 'all'

const issueResolutionStatusOptions = [
  { label: '未解決', value: '未解決' },
  { label: '已解決', value: '已解決' }
] as const

const resolutionFilterOptions = [
  { label: '全部解決狀態', value: 'all' },
  ...issueResolutionStatusOptions
] as const

const responseFilterOptions = [
  { label: '全部回覆狀態', value: 'all' },
  { label: '廠商未回覆', value: 'unanswered' }
] as const

const today = () => new Date().toISOString().slice(0, 10)

const emptyForm = (): IssueReportForm => ({
  id: null,
  environment: props.activeEnvironment,
  issue_description: '',
  reported_at: today(),
  resolution_status: '未解決',
  vendor_response: '',
  responded_at: ''
})

const reports = ref<IssueReport[]>([])
const loading = ref(false)
const saving = ref(false)
const importing = ref(false)
const formOpen = ref(false)
const error = ref('')
const searchKeyword = ref('')
const responseFilter = ref<ResponseFilter>('all')
const resolutionFilter = ref<ResolutionFilter>('all')
const importFileInput = ref<HTMLInputElement | null>(null)
const form = reactive<IssueReportForm>(emptyForm())

const environmentReports = computed(() =>
  reports.value.filter((report) => report.environment === props.activeEnvironment)
)
const resolutionFilteredReports = computed(() => {
  if (resolutionFilter.value === 'all') return environmentReports.value

  return environmentReports.value.filter((report) => report.resolution_status === resolutionFilter.value)
})
const responseFilteredReports = computed(() => {
  if (responseFilter.value === 'all') return resolutionFilteredReports.value

  return resolutionFilteredReports.value.filter(
    (report) => !report.vendor_response.trim() && !report.responded_at
  )
})
const normalizedSearchKeyword = computed(() => searchKeyword.value.trim().toLowerCase())
const filteredReports = computed(() => {
  if (!normalizedSearchKeyword.value) return responseFilteredReports.value

  return responseFilteredReports.value.filter((report) =>
    [
      report.issue_description,
      report.resolution_status,
      report.vendor_response,
      report.reported_at,
      report.responded_at ?? ''
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearchKeyword.value)
  )
})

function resetForm() {
  Object.assign(form, emptyForm())
  error.value = ''
}

function openCreateReport() {
  resetForm()
  form.environment = props.activeEnvironment
  formOpen.value = true
}

function editReport(report: IssueReport) {
  Object.assign(form, {
    id: report.id,
    environment: report.environment,
    issue_description: report.issue_description,
    reported_at: report.reported_at,
    resolution_status: report.resolution_status,
    vendor_response: report.vendor_response,
    responded_at: report.responded_at ?? ''
  })
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  resetForm()
}

function reportPayload(): IssueReportInput {
  return {
    environment: form.environment,
    issue_description: form.issue_description,
    reported_at: form.reported_at,
    resolution_status: form.resolution_status,
    vendor_response: form.vendor_response,
    responded_at: form.responded_at || null
  }
}

async function loadReports() {
  if (!props.token) return
  loading.value = true
  error.value = ''

  try {
    reports.value = await fetchIssueReports(props.token)
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      emit('unauthorized')
      return
    }
    error.value = err instanceof Error ? err.message : '讀取問題紀錄失敗'
  } finally {
    loading.value = false
  }
}

async function saveReport() {
  if (!form.issue_description.trim()) {
    error.value = '請輸入問題描述'
    return
  }
  if (!form.reported_at) {
    error.value = '請選擇提報日期'
    return
  }

  saving.value = true
  error.value = ''

  try {
    await saveIssueReportRequest(props.token, form.id, reportPayload())
    await loadReports()
    closeForm()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '儲存問題紀錄失敗'
  } finally {
    saving.value = false
  }
}

function triggerImport() {
  importFileInput.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    error.value = '目前支援匯入 XLSX'
    return
  }

  importing.value = true
  error.value = ''

  try {
    const importedReports = await parseIssueReportsXlsx(file, props.activeEnvironment)
    if (importedReports.length === 0) {
      error.value = 'XLSX 找不到問題描述欄位或內容'
      return
    }
    await importIssueReports(props.token, importedReports)
    await loadReports()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '匯入問題紀錄失敗'
  } finally {
    importing.value = false
  }
}

function exportXlsx() {
  const blob = buildIssueReportsXlsxBlob(filteredReports.value, `${props.activeEnvironment} 問題提報紀錄`)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  link.href = url
  link.download = `${props.activeEnvironment}-問題提報紀錄-${date}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function deleteReport(report: IssueReport) {
  const confirmed = window.confirm('刪除這筆問題紀錄？')
  if (!confirmed) return

  try {
    await deleteIssueReportRequest(props.token, report.id)
    await loadReports()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '刪除問題紀錄失敗'
  }
}

watch(
  () => props.activeEnvironment,
  () => {
    searchKeyword.value = ''
    responseFilter.value = 'all'
    resolutionFilter.value = 'all'
    if (!formOpen.value) resetForm()
  }
)

onMounted(loadReports)
</script>

<template>
  <section class="issue-screen">
    <n-card class="list-panel">
      <template #header>{{ activeEnvironment }} 問題提報紀錄</template>
      <template #header-extra>
        <n-space class="list-toolbar">
          <n-button-group class="environment-switch">
            <n-button
              v-for="environment in environments"
              :key="environment"
              :type="activeEnvironment === environment ? 'primary' : 'default'"
              secondary
              @click="emit('openEnvironment', environment)"
            >
              {{ environment }}
            </n-button>
          </n-button-group>
          <n-input v-model:value="searchKeyword" clearable class="search-input" placeholder="搜尋問題或回覆" />
          <n-select v-model:value="resolutionFilter" :options="resolutionFilterOptions" class="status-filter" />
          <n-select v-model:value="responseFilter" :options="responseFilterOptions" class="status-filter" />
          <n-button type="primary" @click="openCreateReport">新增問題紀錄</n-button>
          <n-button secondary :loading="importing" @click="triggerImport">匯入 XLSX</n-button>
          <n-button secondary :disabled="filteredReports.length === 0" @click="exportXlsx">匯出 XLSX</n-button>
          <n-button secondary :loading="loading" @click="loadReports">重新整理</n-button>
        </n-space>
        <input
          ref="importFileInput"
          class="file-input"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          @change="handleImportFile"
        />
      </template>

      <n-alert v-if="error" type="error" class="form-alert">{{ error }}</n-alert>

      <div class="table-wrap">
        <n-table :bordered="false" :single-line="false">
          <thead>
            <tr>
              <th>環境</th>
              <th>問題描述</th>
              <th>提報日期</th>
              <th>狀態</th>
              <th>廠商回覆</th>
              <th>回覆日期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="report in filteredReports" :key="report.id">
              <td>{{ report.environment }}</td>
              <td class="issue-description-cell">{{ report.issue_description }}</td>
              <td>{{ report.reported_at }}</td>
              <td>
                <n-tag :type="report.resolution_status === '已解決' ? 'success' : 'warning'">
                  {{ report.resolution_status }}
                </n-tag>
              </td>
              <td class="issue-response-cell">{{ report.vendor_response || '-' }}</td>
              <td>{{ report.responded_at || '-' }}</td>
              <td>
                <n-space size="small">
                  <n-button size="small" secondary @click="editReport(report)">編輯</n-button>
                  <n-button size="small" type="error" secondary @click="deleteReport(report)">刪除</n-button>
                </n-space>
              </td>
            </tr>
            <tr v-if="filteredReports.length === 0">
              <td colspan="7" class="empty-state">
                {{ environmentReports.length === 0 ? '尚無問題紀錄' : '找不到符合篩選條件的問題紀錄' }}
              </td>
            </tr>
          </tbody>
        </n-table>
      </div>
    </n-card>

    <n-modal v-model:show="formOpen" preset="card" class="issue-modal" :title="form.id ? '編輯問題紀錄' : '新增問題紀錄'">
      <n-form label-placement="top" @submit.prevent="saveReport">
        <n-grid :cols="2" :x-gap="12" responsive="screen">
          <n-form-item-gi label="環境">
            <n-select v-model:value="form.environment" :options="environmentOptions" />
          </n-form-item-gi>
          <n-form-item-gi label="提報日期">
            <input v-model="form.reported_at" class="native-date-input" type="date" />
          </n-form-item-gi>
        </n-grid>

        <n-form-item label="狀態">
          <n-select v-model:value="form.resolution_status" :options="issueResolutionStatusOptions" />
        </n-form-item>

        <n-form-item label="問題描述">
          <n-input
            v-model:value="form.issue_description"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 8 }"
            placeholder="記錄測試過程遇到的問題"
          />
        </n-form-item>

        <n-grid :cols="2" :x-gap="12" responsive="screen">
          <n-form-item-gi label="廠商回覆">
            <n-input
              v-model:value="form.vendor_response"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 7 }"
              placeholder="廠商回覆內容"
            />
          </n-form-item-gi>
          <n-form-item-gi label="回覆日期">
            <input v-model="form.responded_at" class="native-date-input" type="date" />
          </n-form-item-gi>
        </n-grid>

        <n-alert v-if="error" type="error" class="form-alert">{{ error }}</n-alert>
        <n-space justify="end" class="form-actions">
          <n-button secondary @click="closeForm">取消</n-button>
          <n-button type="primary" attr-type="submit" :loading="saving">儲存</n-button>
        </n-space>
      </n-form>
    </n-modal>
  </section>
</template>
