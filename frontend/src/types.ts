export type Environment = 'SIT' | 'UAT' | 'Online'
export type Status = '未測試' | 'Pass' | 'Fail' | 'Fixed' | 'Retest'
export type StatusFilter = Status | 'all'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'
export type CategoryFilter = string | 'all'

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
