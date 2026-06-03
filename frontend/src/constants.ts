import type { Environment, Priority, Status } from './types'

export const environments: Environment[] = ['SIT', 'UAT', 'Online']
export const statuses: Status[] = ['未測試', 'Fail', 'Fixed', 'Retest', 'Pass']
export const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3']

export const environmentOptions = environments.map((value) => ({ label: value, value }))
export const statusOptions = statuses.map((value) => ({ label: value, value }))
export const priorityOptions = priorities.map((value) => ({ label: value, value }))
export const statusFilterOptions = [{ label: '全部狀態', value: 'all' }, ...statusOptions]
export const sortOptions = [
  { label: '排序值 / 新到舊', value: 'sort_order' },
  { label: '優先級', value: 'priority' },
  { label: '模組', value: 'module' },
  { label: '負責人', value: 'owner' },
  { label: '狀態流程', value: 'status' }
]
export const pageSizeOptions = [5, 10, 20, 50]
export const xlsxHeaders = [
  '編號',
  '環境',
  '模組',
  '優先級',
  '負責人',
  '排序',
  '測試項目',
  '測試情境',
  '測試方式',
  '預期結果',
  '狀態',
  '測試人員',
  '備註',
  '測試時間'
] as const
