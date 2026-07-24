<script setup lang="ts">
import {
  NAlert,
  NButton,
  NButtonGroup,
  NCard,
  NDatePicker,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NStatistic,
  NTag
} from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { UnauthorizedError, deleteIssue, fetchIssues, saveIssue } from '../api'
import type { Environment, IssueInput, IssueItem, IssuePriority, IssueStatus, IssueType } from '../types'

const props = defineProps<{
  token: string
  environments?: Environment[]
}>()

const emit = defineEmits<{
  unauthorized: []
  selectEnvironment: [env: Environment]
}>()

const issues = ref<IssueItem[]>([])
const loading = ref(false)
const saving = ref(false)
const formOpen = ref(false)
const closedDrawerOpen = ref(false)
const error = ref('')
const searchKeyword = ref('')
const typeFilter = ref<string>('all')
const statusFilter = ref<string>('all')
const priorityFilter = ref<string>('all')

type SortByOption = 'priority_desc' | 'priority_asc' | 'due_date_asc' | 'due_date_desc' | 'id_desc'
const sortBy = ref<SortByOption>('priority_desc')

const sortOptions = [
  { label: '預設排序 (優先級：高 ➔ 低)', value: 'priority_desc' },
  { label: '優先級 (低 ➔ 高)', value: 'priority_asc' },
  { label: '預計完成日 (近 ➔ 遠)', value: 'due_date_asc' },
  { label: '預計完成日 (遠 ➔ 近)', value: 'due_date_desc' },
  { label: '依建立時間 (最新)', value: 'id_desc' }
]

const priorityRank: Record<IssuePriority, number> = {
  Blocker: 0,
  High: 1,
  Medium: 2,
  Low: 3
}

const initialForm = (): IssueInput & { id: number | null } => ({
  id: null,
  title: '',
  description: '',
  type: 'Feature',
  status: 'Open',
  priority: 'Medium',
  assignee: '',
  due_date: null
})

const form = reactive(initialForm())

const typeOptions = [
  { label: '全部類型', value: 'all' },
  { label: 'Bug (缺陷)', value: 'Bug' },
  { label: 'Task (任務)', value: 'Task' },
  { label: 'Feature (新需求)', value: 'Feature' }
]

const statusOptions = [
  { label: '全部狀態', value: 'all' },
  { label: 'Open (待處理)', value: 'Open' },
  { label: 'In Progress (處理中)', value: 'In Progress' },
  { label: 'Fixed (已修復)', value: 'Fixed' },
  { label: 'Closed (已關閉)', value: 'Closed' }
]

const priorityOptions = [
  { label: '全部優先級', value: 'all' },
  { label: 'Blocker (緊急)', value: 'Blocker' },
  { label: 'High (高)', value: 'High' },
  { label: 'Medium (中)', value: 'Medium' },
  { label: 'Low (低)', value: 'Low' }
]

const formTypeOptions = [
  { label: 'Bug (缺陷)', value: 'Bug' },
  { label: 'Task (任務)', value: 'Task' },
  { label: 'Feature (新需求)', value: 'Feature' }
]

const formStatusOptions = [
  { label: 'Open (待處理)', value: 'Open' },
  { label: 'In Progress (處理中)', value: 'In Progress' },
  { label: 'Fixed (已修復)', value: 'Fixed' },
  { label: 'Closed (已關閉)', value: 'Closed' }
]

const formPriorityOptions = [
  { label: 'Blocker (阻擋)', value: 'Blocker' },
  { label: 'High (高)', value: 'High' },
  { label: 'Medium (中)', value: 'Medium' },
  { label: 'Low (低)', value: 'Low' }
]

const stats = computed(() => {
  const total = issues.value.length
  const openCount = issues.value.filter((i) => i.status === 'Open').length
  const inProgressCount = issues.value.filter((i) => i.status === 'In Progress').length
  const fixedCount = issues.value.filter((i) => i.status === 'Fixed').length
  const closedCount = issues.value.filter((i) => i.status === 'Closed').length
  return { total, openCount, inProgressCount, fixedCount, closedCount }
})

const activeIssues = computed(() => {
  if (statusFilter.value === 'Closed') {
    return issues.value.filter((i) => i.status === 'Closed')
  }
  return issues.value.filter((i) => i.status !== 'Closed')
})

const filteredIssues = computed(() => {
  return activeIssues.value.filter((issue) => {
    const matchType = typeFilter.value === 'all' || issue.type === typeFilter.value
    const matchStatus = statusFilter.value === 'all' || issue.status === statusFilter.value
    const matchPriority = priorityFilter.value === 'all' || issue.priority === priorityFilter.value
    const kw = searchKeyword.value.trim().toLowerCase()
    const matchKw =
      !kw ||
      [issue.issue_key, issue.title, issue.description, issue.assignee, issue.due_date]
        .join(' ')
        .toLowerCase()
        .includes(kw)
    return matchType && matchStatus && matchPriority && matchKw
  })
})

const closedIssues = computed(() => {
  return [...issues.value.filter((i) => i.status === 'Closed')].sort((a, b) => b.id - a.id)
})

const sortedIssues = computed(() => {
  return [...filteredIssues.value].sort((a, b) => {
    if (sortBy.value === 'priority_desc') {
      return priorityRank[a.priority] - priorityRank[b.priority] || b.id - a.id
    }
    if (sortBy.value === 'priority_asc') {
      return priorityRank[b.priority] - priorityRank[a.priority] || b.id - a.id
    }
    if (sortBy.value === 'due_date_asc') {
      if (!a.due_date && !b.due_date) return b.id - a.id
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date) || b.id - a.id
    }
    if (sortBy.value === 'due_date_desc') {
      if (!a.due_date && !b.due_date) return b.id - a.id
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return b.due_date.localeCompare(a.due_date) || b.id - a.id
    }
    return b.id - a.id
  })
})

function togglePrioritySort() {
  if (sortBy.value === 'priority_desc') {
    sortBy.value = 'priority_asc'
  } else {
    sortBy.value = 'priority_desc'
  }
}

function toggleDueDateSort() {
  if (sortBy.value === 'due_date_asc') {
    sortBy.value = 'due_date_desc'
  } else {
    sortBy.value = 'due_date_asc'
  }
}

async function loadIssues() {
  loading.value = true
  error.value = ''
  try {
    issues.value = await fetchIssues(props.token)
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      emit('unauthorized')
      return
    }
    error.value = err instanceof Error ? err.message : '讀取 Issue 失敗'
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  Object.assign(form, initialForm())
  formOpen.value = true
}

function openEditModal(issue: IssueItem) {
  form.id = issue.id
  form.title = issue.title
  form.description = issue.description
  form.type = issue.type
  form.status = issue.status
  form.priority = issue.priority
  form.assignee = issue.assignee
  form.due_date = issue.due_date
  formOpen.value = true
}

async function handleSave() {
  if (!form.title || !form.title.trim()) {
    error.value = '請輸入 Issue 標題'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await saveIssue(props.token, form.id, {
      title: form.title,
      description: form.description,
      type: form.type,
      status: form.status,
      priority: form.priority,
      assignee: form.assignee,
      due_date: form.due_date
    })
    formOpen.value = false
    await loadIssues()
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      emit('unauthorized')
      return
    }
    error.value = err instanceof Error ? err.message : '儲存失敗'
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: number) {
  try {
    await deleteIssue(props.token, id)
    await loadIssues()
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      emit('unauthorized')
      return
    }
    error.value = err instanceof Error ? err.message : '刪除失敗'
  }
}

async function handleQuickStatusChange(issue: IssueItem, newStatus: IssueStatus) {
  try {
    await saveIssue(props.token, issue.id, { status: newStatus })
    await loadIssues()
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      emit('unauthorized')
    }
  }
}

function getTypeTagType(type: IssueType) {
  switch (type) {
    case 'Bug':
      return 'error'
    case 'Task':
      return 'info'
    case 'Feature':
      return 'success'
    default:
      return 'default'
  }
}

function getStatusTagType(status: IssueStatus) {
  switch (status) {
    case 'Open':
      return 'warning'
    case 'In Progress':
      return 'info'
    case 'Fixed':
      return 'success'
    case 'Closed':
      return 'default'
    default:
      return 'default'
  }
}

function getPriorityTagType(priority: IssuePriority) {
  switch (priority) {
    case 'Blocker':
      return 'error'
    case 'High':
      return 'warning'
    case 'Medium':
      return 'info'
    case 'Low':
      return 'default'
    default:
      return 'default'
  }
}

onMounted(() => {
  loadIssues()
})
</script>

<template>
  <div class="issue-tracker">
    <!-- Stat Cards -->
    <div class="stats-row">
      <n-card size="small" class="stat-card">
        <n-statistic label="總 Issue 數" :value="stats.total" />
      </n-card>
      <n-card size="small" class="stat-card">
        <n-statistic label="Open (待處理)" :value="stats.openCount" />
      </n-card>
      <n-card size="small" class="stat-card">
        <n-statistic label="In Progress (處理中)" :value="stats.inProgressCount" />
      </n-card>
      <n-card size="small" class="stat-card">
        <n-statistic label="Fixed (已修復)" :value="stats.fixedCount" />
      </n-card>
      <n-card size="small" class="stat-card">
        <n-statistic label="Closed (已關閉)" :value="stats.closedCount" />
      </n-card>
    </div>

    <!-- Toolbar & Filter -->
    <n-card class="main-card">
      <template #header>
        <div class="header-toolbar">
          <h2>Issue 追蹤與管理</h2>
          <n-button type="primary" @click="openCreateModal">+ 新增 Issue</n-button>
        </div>
      </template>

      <n-alert v-if="error" type="error" class="mb-4" closable @close="error = ''">
        {{ error }}
      </n-alert>

      <div class="filter-bar">
        <n-input
          v-model:value="searchKeyword"
          placeholder="搜尋 Key、標題、描述、指派人"
          clearable
          style="width: 240px;"
        />
        <n-select
          v-model:value="typeFilter"
          :options="typeOptions"
          style="width: 140px;"
        />
        <n-select
          v-model:value="statusFilter"
          :options="statusOptions"
          style="width: 160px;"
        />
        <n-select
          v-model:value="priorityFilter"
          :options="priorityOptions"
          style="width: 140px;"
        />
        <n-select
          v-model:value="sortBy"
          :options="sortOptions"
          style="width: 190px;"
        />
        <n-button secondary @click="loadIssues">重新整理</n-button>
        <n-button secondary type="warning" @click="closedDrawerOpen = true">
          已關閉 ({{ stats.closedCount }})
        </n-button>
      </div>

      <!-- Issues List Table / Card View -->
      <div v-if="loading" class="loading-state">載入中...</div>
      <div v-else-if="sortedIssues.length === 0" class="empty-state">
        沒有找到符合條件的 Issue
      </div>
      <div v-else class="table-container">
        <table class="issue-table">
          <thead>
            <tr>
              <th style="width: 100px;">Issue Key</th>
              <th style="width: 90px;">類型</th>
              <th>標題與內容描述</th>
              <th style="width: 130px;">狀態</th>
              <th style="width: 110px; cursor: pointer; user-select: none;" title="點擊切換優先級排序" @click="togglePrioritySort">
                優先級 {{ sortBy === 'priority_desc' ? '▼' : sortBy === 'priority_asc' ? '▲' : '↕' }}
              </th>
              <th style="width: 100px;">指派人</th>
              <th style="width: 130px; cursor: pointer; user-select: none;" title="點擊切換預計完成日排序" @click="toggleDueDateSort">
                預計完成日 {{ sortBy === 'due_date_asc' ? '▲' : sortBy === 'due_date_desc' ? '▼' : '↕' }}
              </th>
              <th style="width: 120px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="issue in sortedIssues" :key="issue.id">
              <td class="key-col">
                <strong>{{ issue.issue_key }}</strong>
              </td>
              <td>
                <n-tag size="small" :type="getTypeTagType(issue.type)">{{ issue.type }}</n-tag>
              </td>
              <td>
                <div class="issue-title">{{ issue.title }}</div>
                <div v-if="issue.description" class="issue-desc">{{ issue.description }}</div>
              </td>
              <td>
                <n-select
                  size="small"
                  :value="issue.status"
                  :options="formStatusOptions"
                  @update:value="(val) => handleQuickStatusChange(issue, val)"
                />
              </td>
              <td>
                <n-tag size="small" :type="getPriorityTagType(issue.priority)">{{ issue.priority }}</n-tag>
              </td>
              <td>{{ issue.assignee || '-' }}</td>
              <td>{{ issue.due_date || '-' }}</td>
              <td>
                <n-space size="small">
                  <n-button size="tiny" secondary @click="openEditModal(issue)">編輯</n-button>
                  <n-popconfirm @positive-click="handleDelete(issue.id)">
                    <template #trigger>
                      <n-button size="tiny" secondary type="error">刪除</n-button>
                    </template>
                    確定要刪除 {{ issue.issue_key }} 嗎？
                  </n-popconfirm>
                </n-space>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </n-card>

    <!-- Create / Edit Modal -->
    <n-modal v-model:show="formOpen" preset="card" :title="form.id ? `編輯 Issue (${form.title})` : '新增 Issue'" style="width: 560px;">
      <n-form label-placement="left" label-width="95">
        <n-form-item label="標題" required>
          <n-input v-model:value="form.title" placeholder="輸入 Issue 主旨或簡短摘要" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="form.description" type="textarea" placeholder="重現步驟、影響範圍或問題細節" rows="3" />
        </n-form-item>
        <n-form-item label="類型">
          <n-select v-model:value="form.type" :options="formTypeOptions" />
        </n-form-item>
        <n-form-item label="狀態">
          <n-select v-model:value="form.status" :options="formStatusOptions" />
        </n-form-item>
        <n-form-item label="優先級">
          <n-select v-model:value="form.priority" :options="formPriorityOptions" />
        </n-form-item>
        <n-form-item label="指派人">
          <n-input v-model:value="form.assignee" placeholder="例如：Alice" />
        </n-form-item>
        <n-form-item label="預計完成日">
          <n-date-picker
            v-model:formatted-value="form.due_date"
            value-format="yyyy-MM-dd"
            type="date"
            clearable
            placeholder="選擇預計完成日"
            style="width: 100%;"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="formOpen = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="handleSave">儲存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Closed Issues Drawer -->
    <n-drawer v-model:show="closedDrawerOpen" :width="780" placement="right">
      <n-drawer-content title="已關閉的 Issue 列表" closable>
        <div v-if="closedIssues.length === 0" class="empty-state">
          目前沒有已關閉的 Issue
        </div>
        <div v-else class="table-container">
          <table class="issue-table">
            <thead>
              <tr>
                <th style="width: 100px;">Issue Key</th>
                <th style="width: 90px;">類型</th>
                <th>標題</th>
                <th style="width: 130px;">狀態</th>
                <th style="width: 90px;">優先級</th>
                <th style="width: 90px;">指派人</th>
                <th style="width: 110px;">預計完成日</th>
                <th style="width: 110px;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="issue in closedIssues" :key="issue.id">
                <td class="key-col">
                  <strong>{{ issue.issue_key }}</strong>
                </td>
                <td>
                  <n-tag size="small" :type="getTypeTagType(issue.type)">{{ issue.type }}</n-tag>
                </td>
                <td>
                  <div class="issue-title">{{ issue.title }}</div>
                  <div v-if="issue.description" class="issue-desc">{{ issue.description }}</div>
                </td>
                <td>
                  <n-select
                    size="small"
                    :value="issue.status"
                    :options="formStatusOptions"
                    @update:value="(val) => handleQuickStatusChange(issue, val)"
                  />
                </td>
                <td>
                  <n-tag size="small" :type="getPriorityTagType(issue.priority)">{{ issue.priority }}</n-tag>
                </td>
                <td>{{ issue.assignee || '-' }}</td>
                <td>{{ issue.due_date || '-' }}</td>
                <td>
                  <n-space size="small">
                    <n-button size="tiny" secondary @click="openEditModal(issue)">編輯</n-button>
                    <n-popconfirm @positive-click="handleDelete(issue.id)">
                      <template #trigger>
                        <n-button size="tiny" secondary type="error">刪除</n-button>
                      </template>
                      刪除 {{ issue.issue_key }}？
                    </n-popconfirm>
                  </n-space>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.issue-tracker {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.stat-card {
  text-align: center;
  background: var(--n-color-embedded);
}

.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-toolbar h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}

.mb-4 {
  margin-bottom: 16px;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px;
  color: #888;
}

.table-container {
  overflow-x: auto;
}

.issue-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.issue-table th,
.issue-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  text-align: left;
  vertical-align: middle;
}

.issue-table th {
  background: rgba(128, 128, 128, 0.08);
  font-weight: 600;
}

.key-col {
  color: #2080f0;
  font-family: monospace;
}

.issue-title {
  font-weight: 500;
  color: var(--n-text-color);
}

.issue-desc {
  font-size: 0.8rem;
  color: #888;
  margin-top: 2px;
  white-space: pre-line;
}
</style>
