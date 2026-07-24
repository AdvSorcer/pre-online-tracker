import { describe, expect, it } from 'bun:test'
import { app } from './index'

const token = 'local-token'
const authHeader = { Authorization: `Bearer ${token}` }

describe('Issue Tracker API', () => {
  it('should return 401 unauthorized when request token is missing', async () => {
    const response = await app.handle(
      new Request('http://localhost/api/issues', {
        method: 'GET'
      })
    )
    expect(response.status).toBe(401)
  })

  it('should create a new issue successfully with generated key', async () => {
    const newIssue = {
      title: '測試修復登入頁面爆版問題',
      description: '在行動裝置 Chrome 瀏覽器登入按鈕遭遮擋',
      type: 'Bug',
      status: 'Open',
      priority: 'High',
      assignee: 'Alice',
      reporter: 'Bob',
      due_date: '2026-08-15'
    }

    const response = await app.handle(
      new Request('http://localhost/api/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify(newIssue)
      })
    )

    expect(response.status).toBe(200)
    const issue = await response.json()
    expect(issue.id).toBeDefined()
    expect(issue.issue_key).toMatch(/^ISSUE-\d+$/)
    expect(issue.title).toBe(newIssue.title)
    expect(issue.type).toBe('Bug')
    expect(issue.status).toBe('Open')
    expect(issue.priority).toBe('High')
    expect(issue.assignee).toBe('Alice')
    expect(issue.due_date).toBe('2026-08-15')
  })

  it('should fetch issues list and apply filter correctly', async () => {
    const response = await app.handle(
      new Request('http://localhost/api/issues?status=Open', {
        method: 'GET',
        headers: authHeader
      })
    )

    expect(response.status).toBe(200)
    const issues = await response.json()
    expect(Array.isArray(issues)).toBe(true)
    for (const item of issues) {
      expect(item.status).toBe('Open')
    }
  })

  it('should update an existing issue', async () => {
    const createRes = await app.handle(
      new Request('http://localhost/api/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({
          title: '待更新任務',
          type: 'Task',
          status: 'Open',
          priority: 'Medium'
        })
      })
    )
    const created = await createRes.json()

    const updateRes = await app.handle(
      new Request(`http://localhost/api/issues/${created.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({
          status: 'In Progress',
          assignee: 'Charlie'
        })
      })
    )

    expect(updateRes.status).toBe(200)
    const updated = await updateRes.json()
    expect(updated.id).toBe(created.id)
    expect(updated.status).toBe('In Progress')
    expect(updated.assignee).toBe('Charlie')
  })

  it('should delete an issue', async () => {
    const createRes = await app.handle(
      new Request('http://localhost/api/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({
          title: '待刪除 Issue',
          type: 'Feature'
        })
      })
    )
    const created = await createRes.json()

    const deleteRes = await app.handle(
      new Request(`http://localhost/api/issues/${created.id}`, {
        method: 'DELETE',
        headers: authHeader
      })
    )

    expect(deleteRes.status).toBe(200)

    const updateRes = await app.handle(
      new Request(`http://localhost/api/issues/${created.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({ title: 'New Title' })
      })
    )
    expect(updateRes.status).toBe(404)
  })
})
