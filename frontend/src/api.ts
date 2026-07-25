import type { IssueInput, IssueItem, IssueReport, IssueReportInput, TestItem } from './types'

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

type ImportItemInput = {
  environment: string
  module: string
  priority: string
  owner: string
  sort_order: number
  title: string
  scenario: string
  test_method: string
  expected_result: string
  status: string
  tester: string
  note: string
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`
  }
}

export async function login(password: string) {
  const response = await fetch(`${apiBaseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })

  if (!response.ok) throw new Error('密碼錯誤')

  const data = (await response.json()) as { token: string }
  return data.token
}

export async function fetchItems(token: string) {
  const response = await fetch(`${apiBaseUrl}/api/items`, {
    headers: authHeaders(token)
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) throw new Error('讀取測試清單失敗')
  return (await response.json()) as TestItem[]
}

export async function importItems(token: string, items: ImportItemInput[]) {
  const response = await fetch(`${apiBaseUrl}/api/items/import`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  })
  if (!response.ok) throw new Error('匯入失敗')
}

export async function saveItem(token: string, itemId: number | null, data: FormData) {
  const url = itemId ? `${apiBaseUrl}/api/items/${itemId}` : `${apiBaseUrl}/api/items`
  const method = itemId ? 'PUT' : 'POST'
  const response = await fetch(url, {
    method,
    headers: authHeaders(token),
    body: data
  })
  if (!response.ok) throw new Error('儲存失敗')
}

export async function updateItem(token: string, itemId: number, data: FormData) {
  const response = await fetch(`${apiBaseUrl}/api/items/${itemId}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: data
  })
  if (!response.ok) throw new Error('儲存失敗')
}

export async function deleteItem(token: string, itemId: number) {
  const response = await fetch(`${apiBaseUrl}/api/items/${itemId}`, {
    method: 'DELETE',
    headers: authHeaders(token)
  })
  if (!response.ok) throw new Error('刪除失敗')
}

export async function deleteAllItems(token: string) {
  const response = await fetch(`${apiBaseUrl}/api/items/all`, {
    method: 'DELETE',
    headers: authHeaders(token)
  })
  if (!response.ok) throw new Error('刪除所有資料失敗')
}

export async function fetchIssueReports(token: string) {
  const response = await fetch(`${apiBaseUrl}/api/issue-reports`, {
    headers: authHeaders(token)
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) throw new Error('讀取問題紀錄失敗')
  return (await response.json()) as IssueReport[]
}

export async function saveIssueReport(token: string, reportId: number | null, data: IssueReportInput) {
  const url = reportId ? `${apiBaseUrl}/api/issue-reports/${reportId}` : `${apiBaseUrl}/api/issue-reports`
  const method = reportId ? 'PUT' : 'POST'
  const response = await fetch(url, {
    method,
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('儲存問題紀錄失敗')
}

export async function importIssueReports(token: string, reports: IssueReportInput[]) {
  const response = await fetch(`${apiBaseUrl}/api/issue-reports/import`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ reports })
  })
  if (!response.ok) throw new Error('匯入問題紀錄失敗')
}

export async function deleteIssueReport(token: string, reportId: number) {
  const response = await fetch(`${apiBaseUrl}/api/issue-reports/${reportId}`, {
    method: 'DELETE',
    headers: authHeaders(token)
  })
  if (!response.ok) throw new Error('刪除問題紀錄失敗')
}

export async function fetchIssues(token: string, params?: { status?: string; type?: string; priority?: string; search?: string }) {
  const url = new URL(`${apiBaseUrl}/api/issues`, window.location.origin)
  if (params?.status) url.searchParams.set('status', params.status)
  if (params?.type) url.searchParams.set('type', params.type)
  if (params?.priority) url.searchParams.set('priority', params.priority)
  if (params?.search) url.searchParams.set('search', params.search)

  const response = await fetch(url.toString(), {
    headers: authHeaders(token)
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) throw new Error('讀取 Issue 列表失敗')
  return (await response.json()) as IssueItem[]
}

export async function saveIssue(token: string, issueId: number | null, data: IssueInput) {
  const url = issueId ? `${apiBaseUrl}/api/issues/${issueId}` : `${apiBaseUrl}/api/issues`
  const method = issueId ? 'PUT' : 'POST'
  const response = await fetch(url, {
    method,
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) throw new Error('儲存 Issue 失敗')
  return (await response.json()) as IssueItem
}

export async function deleteIssue(token: string, issueId: number) {
  const response = await fetch(`${apiBaseUrl}/api/issues/${issueId}`, {
    method: 'DELETE',
    headers: authHeaders(token)
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) throw new Error('刪除 Issue 失敗')
}

export async function importIssues(token: string, issues: IssueInput[]) {
  const response = await fetch(`${apiBaseUrl}/api/issues/import`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ issues })
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) throw new Error('匯入 Issue 失敗')
  return (await response.json()) as { imported: number }
}

export async function deleteAllIssues(token: string) {
  const response = await fetch(`${apiBaseUrl}/api/issues/all`, {
    method: 'DELETE',
    headers: authHeaders(token)
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) throw new Error('清空 Issue 失敗')
}

