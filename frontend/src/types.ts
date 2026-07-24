export type Environment = 'SIT' | 'UAT' | 'Online'
export type Status = '未測試' | 'Pending' | 'Pass' | 'Fail' | 'Fixed' | 'Retest'
export type StatusFilter = Status | 'all'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'
export type CategoryFilter = string | 'all'
export type IssueResolutionStatus = '未解決' | '已解決'

export type IssueReport = {
  id: number
  environment: Environment
  issue_description: string
  reported_at: string
  resolution_status: IssueResolutionStatus
  vendor_response: string
  responded_at: string | null
  created_at: string
  updated_at: string
}

export type IssueReportInput = {
  environment: Environment
  issue_description: string
  reported_at: string
  resolution_status: IssueResolutionStatus
  vendor_response: string
  responded_at: string | null
}

export type TestImage = {
  id: number
  item_id: number
  path: string
  created_at: string
}

export type TestItem = {
  id: number
  environment: Environment
  module: string
  priority: Priority
  owner: string
  sort_order: number
  title: string
  scenario: string
  test_method: string
  expected_result: string
  status: Status
  tester: string
  note: string
  images: TestImage[]
  image_urls: string[]
  image_url: string | null
  tested_at: string | null
}

export type FormState = {
  id: number | null
  environment: Environment
  module: string
  priority: Priority
  owner: string
  sort_order: number
  title: string
  scenario: string
  test_method: string
  expected_result: string
  status: Status
  tester: string
  note: string
  images: File[]
}

export type IssueType = 'Bug' | 'Task' | 'Feature'
export type IssueStatus = 'Open' | 'In Progress' | 'Fixed' | 'Closed'
export type IssuePriority = 'Blocker' | 'High' | 'Medium' | 'Low'

export type IssueItem = {
  id: number
  issue_key: string
  title: string
  description: string
  type: IssueType
  status: IssueStatus
  priority: IssuePriority
  assignee: string
  due_date: string | null
  related_test_item_id: number | null
  created_at: string
  updated_at: string
}

export type IssueInput = {
  title?: string
  description?: string
  type?: IssueType
  status?: IssueStatus
  priority?: IssuePriority
  assignee?: string
  due_date?: string | null
  related_test_item_id?: number | null
}
