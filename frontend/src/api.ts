import type { TestItem } from './types'

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
