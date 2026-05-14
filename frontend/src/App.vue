<script setup lang="ts">
import type { UploadFileInfo } from 'naive-ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'

type Environment = 'SIT' | 'UAT' | 'Online'
type Status = '未測試' | 'Pass' | 'Fail' | 'Fixed' | 'Retest'
type StatusFilter = Status | 'all'
type Priority = 'P0' | 'P1' | 'P2' | 'P3'
type CategoryFilter = string | 'all'

type TestImage = {
  id: number
  item_id: number
  path: string
  created_at: string
}

type TestItem = {
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

type FormState = {
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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
const environments: Environment[] = ['SIT', 'UAT', 'Online']
const statuses: Status[] = ['未測試', 'Fail', 'Fixed', 'Retest', 'Pass']
const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3']
const environmentOptions = environments.map((value) => ({ label: value, value }))
const statusOptions = statuses.map((value) => ({ label: value, value }))
const priorityOptions = priorities.map((value) => ({ label: value, value }))
const statusFilterOptions = [{ label: '全部狀態', value: 'all' }, ...statusOptions]
const sortOptions = [
  { label: '排序值 / 新到舊', value: 'sort_order' },
  { label: '優先級', value: 'priority' },
  { label: '模組', value: 'module' },
  { label: '負責人', value: 'owner' },
  { label: '狀態流程', value: 'status' }
]
const pageSizeOptions = [5, 10, 20, 50]
const xlsxHeaders = [
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

const token = ref(localStorage.getItem('pre-online-token') ?? '')
const passwordInput = ref('')
const loginError = ref('')
const activeEnvironment = ref<Environment>('SIT')
const currentView = ref<'items' | 'stats'>('items')
const items = ref<TestItem[]>([])
const loading = ref(false)
const saving = ref(false)
const deletingAll = ref(false)
const error = ref('')
const settingsError = ref('')
const uploadFileList = ref<UploadFileInfo[]>([])
const imagePreviews = ref<string[]>([])
const importFileInput = ref<HTMLInputElement | null>(null)
const itemFormOpen = ref(false)
const settingsOpen = ref(false)
const detailItem = ref<TestItem | null>(null)
const currentPage = ref(1)
const pageSize = ref(10)
const searchKeyword = ref('')
const statusFilter = ref<StatusFilter>('all')
const moduleFilter = ref<CategoryFilter>('all')
const ownerFilter = ref<CategoryFilter>('all')
const testerFilter = ref<CategoryFilter>('all')
const sortBy = ref('sort_order')
const deleteAllConfirmText = ref('')
const itemModalOpen = computed({
  get: () => itemFormOpen.value,
  set: (show: boolean) => {
    itemFormOpen.value = show
    if (!show) resetForm()
  }
})
const detailModalOpen = computed({
  get: () => detailItem.value !== null,
  set: (show: boolean) => {
    if (!show) detailItem.value = null
  }
})

const emptyForm = (): FormState => ({
  id: null,
  environment: activeEnvironment.value,
  module: '',
  priority: 'P2',
  owner: '',
  sort_order: 0,
  title: '',
  scenario: '',
  test_method: '',
  expected_result: '',
  status: '未測試',
  tester: '',
  note: '',
  images: []
})

const form = reactive<FormState>(emptyForm())

const environmentItems = computed(() => items.value.filter((item) => item.environment === activeEnvironment.value))
const moduleOptions = computed(() => [
  { label: '全部模組', value: 'all' },
  ...Array.from(new Set(environmentItems.value.map((item) => item.module).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    .map((value) => ({ label: value, value }))
])
const ownerOptions = computed(() => [
  { label: '全部負責人', value: 'all' },
  ...Array.from(new Set(environmentItems.value.map((item) => item.owner).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    .map((value) => ({ label: value, value }))
])
const testerOptions = computed(() => [
  { label: '全部測試人員', value: 'all' },
  ...Array.from(new Set(environmentItems.value.map((item) => item.tester).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    .map((value) => ({ label: value, value }))
])
const statusFilteredItems = computed(() => {
  return environmentItems.value.filter((item) => {
    const statusMatched = statusFilter.value === 'all' || item.status === statusFilter.value
    const moduleMatched = moduleFilter.value === 'all' || item.module === moduleFilter.value
    const ownerMatched = ownerFilter.value === 'all' || item.owner === ownerFilter.value
    const testerMatched = testerFilter.value === 'all' || item.tester === testerFilter.value
    return statusMatched && moduleMatched && ownerMatched && testerMatched
  })
})
const normalizedSearchKeyword = computed(() => searchKeyword.value.trim().toLowerCase())
const filteredItems = computed(() => {
  if (!normalizedSearchKeyword.value) return statusFilteredItems.value

  return statusFilteredItems.value.filter((item) =>
    [
      item.title,
      item.module,
      item.priority,
      item.owner,
      item.scenario,
      item.test_method,
      item.expected_result,
      item.status,
      item.tester,
      item.note
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearchKeyword.value)
  )
})
const sortedItems = computed(() => {
  const statusRank: Record<Status, number> = { 未測試: 0, Fail: 1, Fixed: 2, Retest: 3, Pass: 4 }
  const priorityRank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
  return [...filteredItems.value].sort((a, b) => {
    if (sortBy.value === 'priority') return priorityRank[a.priority] - priorityRank[b.priority] || a.sort_order - b.sort_order
    if (sortBy.value === 'module') return a.module.localeCompare(b.module, 'zh-Hant') || a.sort_order - b.sort_order
    if (sortBy.value === 'owner') return a.owner.localeCompare(b.owner, 'zh-Hant') || a.sort_order - b.sort_order
    if (sortBy.value === 'status') return statusRank[a.status] - statusRank[b.status] || a.sort_order - b.sort_order
    return a.sort_order - b.sort_order || b.id - a.id
  })
})
const pageCount = computed(() => Math.max(1, Math.ceil(sortedItems.value.length / pageSize.value)))
const canDeleteAllItems = computed(() => items.value.length > 0 && deleteAllConfirmText.value === 'DELETE')
const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sortedItems.value.slice(start, start + pageSize.value)
})
const paginationRange = computed(() => {
  if (sortedItems.value.length === 0) return { start: 0, end: 0 }
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(start + pageSize.value - 1, sortedItems.value.length)
  return { start, end }
})

const stats = computed(() =>
  environments.map((environment) => {
    const scoped = items.value.filter((item) => item.environment === environment)
    const pass = scoped.filter((item) => item.status === 'Pass').length
    const fail = scoped.filter((item) => item.status === 'Fail').length
    const fixed = scoped.filter((item) => item.status === 'Fixed').length
    const retest = scoped.filter((item) => item.status === 'Retest').length
    const untested = scoped.filter((item) => item.status === '未測試').length
    const completed = pass + fail + fixed + retest
    const rate = scoped.length === 0 ? 0 : Math.round((completed / scoped.length) * 100)
    return { environment, total: scoped.length, pass, fail, fixed, retest, untested, rate }
  })
)

function authHeaders() {
  return {
    Authorization: `Bearer ${token.value}`
  }
}

function fullImageUrl(path: string) {
  const separator = path.includes('?') ? '&' : '?'
  return `${apiBaseUrl}${path}${separator}token=${encodeURIComponent(token.value)}`
}

function xmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function worksheetColumnName(index: number) {
  let name = ''
  let current = index
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }
  return name
}

function formatExportDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-TW', { hour12: false })
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true)
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function createZip(files: { name: string; content: string }[]) {
  const encoder = new TextEncoder()
  const encodedFiles = files.map((file) => ({
    name: encoder.encode(file.name),
    data: encoder.encode(file.content)
  }))
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  for (const file of encodedFiles) {
    const checksum = crc32(file.data)
    const localHeader = new Uint8Array(30 + file.name.length)
    const localView = new DataView(localHeader.buffer)
    writeUint32(localView, 0, 0x04034b50)
    writeUint16(localView, 4, 20)
    writeUint16(localView, 6, 0x0800)
    writeUint16(localView, 8, 0)
    writeUint16(localView, 10, dosTime)
    writeUint16(localView, 12, dosDate)
    writeUint32(localView, 14, checksum)
    writeUint32(localView, 18, file.data.length)
    writeUint32(localView, 22, file.data.length)
    writeUint16(localView, 26, file.name.length)
    localHeader.set(file.name, 30)
    localParts.push(localHeader, file.data)

    const centralHeader = new Uint8Array(46 + file.name.length)
    const centralView = new DataView(centralHeader.buffer)
    writeUint32(centralView, 0, 0x02014b50)
    writeUint16(centralView, 4, 20)
    writeUint16(centralView, 6, 20)
    writeUint16(centralView, 8, 0x0800)
    writeUint16(centralView, 10, 0)
    writeUint16(centralView, 12, dosTime)
    writeUint16(centralView, 14, dosDate)
    writeUint32(centralView, 16, checksum)
    writeUint32(centralView, 20, file.data.length)
    writeUint32(centralView, 24, file.data.length)
    writeUint16(centralView, 28, file.name.length)
    writeUint32(centralView, 42, offset)
    centralHeader.set(file.name, 46)
    centralParts.push(centralHeader)

    offset += localHeader.length + file.data.length
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0)
  const endRecord = new Uint8Array(22)
  const endView = new DataView(endRecord.buffer)
  writeUint32(endView, 0, 0x06054b50)
  writeUint16(endView, 8, files.length)
  writeUint16(endView, 10, files.length)
  writeUint32(endView, 12, centralSize)
  writeUint32(endView, 16, offset)

  const blobParts = [...localParts, ...centralParts, endRecord].map(toArrayBuffer)
  return new Blob(blobParts, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

function buildWorksheetXml(exportItems: TestItem[]) {
  const rows = [
    xlsxHeaders,
    ...exportItems.map((item, index) => [
      index + 1,
      item.environment,
      item.module,
      item.priority,
      item.owner,
      item.sort_order,
      item.title,
      item.scenario,
      item.test_method,
      item.expected_result,
      item.status,
      item.tester,
      item.note,
      formatExportDate(item.tested_at)
    ])
  ]

  const sheetData = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${worksheetColumnName(columnIndex + 1)}${rowNumber}`
          const style = rowIndex === 0 ? ' s="1"' : ''
          return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(value)}</t></is></c>`
        })
        .join('')
      return `<row r="${rowNumber}">${cells}</row>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="8" customWidth="1"/>
    <col min="2" max="2" width="12" customWidth="1"/>
    <col min="3" max="5" width="14" customWidth="1"/>
    <col min="6" max="6" width="10" customWidth="1"/>
    <col min="7" max="10" width="28" customWidth="1"/>
    <col min="11" max="12" width="14" customWidth="1"/>
    <col min="13" max="13" width="28" customWidth="1"/>
    <col min="14" max="14" width="20" customWidth="1"/>
  </cols>
  <sheetData>${sheetData}</sheetData>
</worksheet>`
}

function buildXlsxBlob(exportItems: TestItem[]) {
  const createdAt = new Date().toISOString()
  return createZip([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
    },
    {
      name: 'docProps/app.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Pre Online Tracker</Application>
</Properties>`
    },
    {
      name: 'docProps/core.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(activeEnvironment.value)} 測試清單</dc:title>
  <dc:creator>Pre Online Tracker</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${xmlEscape(activeEnvironment.value)} 測試清單" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      name: 'xl/styles.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: buildWorksheetXml(exportItems)
    }
  ])
}

function exportXlsx() {
  const blob = buildXlsxBlob(sortedItems.value)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  link.href = url
  link.download = `${activeEnvironment.value}-測試清單-${date}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function buildExportRows(exportItems: TestItem[]) {
  return [
    [...xlsxHeaders],
    ...exportItems.map((item, index) => [
      index + 1,
      item.environment,
      item.module,
      item.priority,
      item.owner,
      item.sort_order,
      item.title,
      item.scenario,
      item.test_method,
      item.expected_result,
      item.status,
      item.tester,
      item.note,
      formatExportDate(item.tested_at)
    ])
  ]
}

function exportCsv() {
  const csv = buildExportRows(sortedItems.value).map((row) => row.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  link.href = url
  link.download = `${activeEnvironment.value}-測試清單-${date}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"' && inQuotes && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((csvRow) => csvRow.some((value) => value.trim()))
}

function normalizeHeader(header: string) {
  return header.trim().replace(/^\uFEFF/, '')
}

function parseStatus(value: string): Status {
  return statuses.includes(value.trim() as Status) ? (value.trim() as Status) : '未測試'
}

function parsePriority(value: string): Priority {
  return priorities.includes(value.trim() as Priority) ? (value.trim() as Priority) : 'P2'
}

function worksheetColumnIndex(reference: string, fallback: number) {
  const match = reference.match(/^[A-Z]+/i)
  if (!match) return fallback

  return match[0]
    .toUpperCase()
    .split('')
    .reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1
}

async function inflateRaw(data: Uint8Array) {
  if (!('DecompressionStream' in window)) {
    throw new Error('此瀏覽器不支援直接解析 XLSX，請改用 CSV 匯入')
  }

  const copy = new Uint8Array(data.length)
  copy.set(data)
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readZipTextEntries(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder()
  let endOffset = -1

  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset
      break
    }
  }
  if (endOffset === -1) throw new Error('XLSX 檔案格式不正確')

  const centralDirectoryOffset = view.getUint32(endOffset + 16, true)
  const totalEntries = view.getUint16(endOffset + 10, true)
  const entries = new Map<string, string>()
  let offset = centralDirectoryOffset

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('XLSX 檔案格式不正確')

    const compressionMethod = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const fileNameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)
    const nameStart = offset + 46
    const name = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength))

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true)
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength
    const compressed = bytes.slice(dataStart, dataStart + compressedSize)
    let content: Uint8Array

    if (compressionMethod === 0) {
      content = compressed
    } else if (compressionMethod === 8) {
      content = await inflateRaw(compressed)
    } else {
      throw new Error('XLSX 使用了目前不支援的壓縮格式')
    }

    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      entries.set(name, decoder.decode(content))
    }
    offset = nameStart + fileNameLength + extraLength + commentLength
  }

  return entries
}

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('XLSX XML 內容解析失敗')
  return document
}

function textFromElement(element: Element) {
  return Array.from(element.getElementsByTagName('t'))
    .map((node) => node.textContent ?? '')
    .join('')
}

function readSharedStrings(entries: Map<string, string>) {
  const xml = entries.get('xl/sharedStrings.xml')
  if (!xml) return []
  return Array.from(parseXml(xml).getElementsByTagName('si')).map(textFromElement)
}

function firstWorksheetPath(entries: Map<string, string>) {
  const workbook = parseXml(entries.get('xl/workbook.xml') ?? '')
  const firstSheet = workbook.getElementsByTagName('sheet')[0]
  const relationshipId = firstSheet?.getAttribute('r:id')
  if (!relationshipId) return 'xl/worksheets/sheet1.xml'

  const relationships = parseXml(entries.get('xl/_rels/workbook.xml.rels') ?? '')
  const relationship = Array.from(relationships.getElementsByTagName('Relationship')).find(
    (node) => node.getAttribute('Id') === relationshipId
  )
  const target = relationship?.getAttribute('Target') ?? 'worksheets/sheet1.xml'
  if (target.startsWith('/')) return target.slice(1)

  const parts: string[] = ['xl']
  for (const part of target.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return parts.join('/')
}

function readCellValue(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute('t')
  if (type === 'inlineStr') return textFromElement(cell)

  const value = cell.getElementsByTagName('v')[0]?.textContent ?? ''
  if (type === 's') return sharedStrings[Number(value)] ?? ''
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE'
  return value
}

async function parseXlsx(file: File) {
  const entries = await readZipTextEntries(await file.arrayBuffer())
  const sheetXml = entries.get(firstWorksheetPath(entries))
  if (!sheetXml) throw new Error('XLSX 找不到第一個工作表')

  const sharedStrings = readSharedStrings(entries)
  const sheet = parseXml(sheetXml)
  return Array.from(sheet.getElementsByTagName('row'))
    .map((row) => {
      const values: string[] = []
      Array.from(row.getElementsByTagName('c')).forEach((cell, index) => {
        const columnIndex = worksheetColumnIndex(cell.getAttribute('r') ?? '', index)
        values[columnIndex] = readCellValue(cell, sharedStrings)
      })
      return values.map((value) => value ?? '')
    })
    .filter((row) => row.some((value) => value.trim()))
}

async function importRows(rows: string[][], sourceLabel: string) {
  const [headerRow, ...dataRows] = rows
  if (!headerRow || dataRows.length === 0) {
    error.value = `${sourceLabel} 沒有可匯入的資料`
    return
  }
  const headerIndex = new Map(headerRow.map((header, index) => [normalizeHeader(header), index]))
  const read = (row: string[], names: string[], fallback = '') => {
    for (const name of names) {
      const index = headerIndex.get(name)
      if (index !== undefined) return row[index]?.trim() ?? fallback
    }
    return fallback
  }
  const importedItems = dataRows
    .map((row, index) => ({
      environment: read(row, ['環境'], activeEnvironment.value),
      module: read(row, ['模組']),
      priority: parsePriority(read(row, ['優先級'])),
      owner: read(row, ['負責人']),
      sort_order: Number(read(row, ['排序'], String(index + 1))) || index + 1,
      title: read(row, ['測試項目', '標題', 'Title']),
      scenario: read(row, ['測試情境', '測試情境說明']),
      test_method: read(row, ['測試方式']),
      expected_result: read(row, ['預期結果']),
      status: parseStatus(read(row, ['狀態'])),
      tester: read(row, ['測試人員']),
      note: read(row, ['備註'])
    }))
    .filter((item) => item.title)

  if (importedItems.length === 0) {
    error.value = `${sourceLabel} 找不到測試項目欄位或內容`
    return
  }

  const response = await fetch(`${apiBaseUrl}/api/items/import`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: importedItems })
  })
  if (!response.ok) throw new Error('匯入失敗')
  await loadItems()
}

async function importCsvFile(file: File) {
  await importRows(parseCsv(await file.text()), 'CSV')
}

async function importXlsxFile(file: File) {
  await importRows(await parseXlsx(file), 'XLSX')
}

function triggerImport() {
  importFileInput.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const fileName = file.name.toLowerCase()
  const isCsv = fileName.endsWith('.csv')
  const isXlsx = fileName.endsWith('.xlsx')
  if (!isCsv && !isXlsx) {
    error.value = '目前支援匯入 CSV 或 XLSX'
    return
  }
  loading.value = true
  error.value = ''
  try {
    if (isXlsx) {
      await importXlsxFile(file)
    } else {
      await importCsvFile(file)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '匯入失敗'
  } finally {
    loading.value = false
  }
}

function imageName(path: string) {
  return decodeURIComponent(path.split('/').pop() ?? 'uploaded-image')
}

function existingImageFileList(images: TestImage[]): UploadFileInfo[] {
  return images.map((image) => {
    const url = fullImageUrl(image.path)
    return {
      id: `existing-${image.id}`,
      name: imageName(image.path),
      status: 'finished',
      url,
      thumbnailUrl: url,
      file: null
    }
  })
}

async function login() {
  loginError.value = ''
  const response = await fetch(`${apiBaseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: passwordInput.value })
  })

  if (!response.ok) {
    loginError.value = '密碼錯誤'
    return
  }

  const data = (await response.json()) as { token: string }
  token.value = data.token
  localStorage.setItem('pre-online-token', data.token)
  passwordInput.value = ''
  await loadItems()
}

function logout() {
  token.value = ''
  localStorage.removeItem('pre-online-token')
}

async function loadItems() {
  if (!token.value) return
  loading.value = true
  error.value = ''

  try {
    const response = await fetch(`${apiBaseUrl}/api/items`, {
      headers: authHeaders()
    })
    if (response.status === 401) {
      logout()
      return
    }
    if (!response.ok) throw new Error('讀取測試清單失敗')
    items.value = await response.json()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '發生未知錯誤'
  } finally {
    loading.value = false
  }
}

function resetUploadPreviews() {
  for (const preview of imagePreviews.value) {
    URL.revokeObjectURL(preview)
  }
  uploadFileList.value = []
  imagePreviews.value = []
}

function resetForm() {
  Object.assign(form, emptyForm())
  error.value = ''
  resetUploadPreviews()
}

function openCreateItem() {
  resetForm()
  form.environment = activeEnvironment.value
  itemFormOpen.value = true
}

function editItem(item: TestItem) {
  resetUploadPreviews()
  Object.assign(form, {
    id: item.id,
    environment: item.environment,
    module: item.module,
    priority: item.priority,
    owner: item.owner,
    sort_order: item.sort_order,
    title: item.title,
    scenario: item.scenario,
    test_method: item.test_method,
    expected_result: item.expected_result,
    status: item.status,
    tester: item.tester,
    note: item.note,
    images: []
  })
  uploadFileList.value = existingImageFileList(item.images)
  activeEnvironment.value = item.environment
  itemFormOpen.value = true
}

function closeItemModal() {
  itemFormOpen.value = false
  resetForm()
}

function closeSettings() {
  settingsOpen.value = false
  settingsError.value = ''
  deleteAllConfirmText.value = ''
}

function handleUploadChange(options: { fileList: UploadFileInfo[] }) {
  resetUploadPreviews()
  uploadFileList.value = options.fileList
  form.images = options.fileList
    .map((fileInfo) => fileInfo.file)
    .filter((file): file is File => file instanceof File)
  imagePreviews.value = form.images.map((file) => URL.createObjectURL(file))
}

function buildFormData() {
  const data = new FormData()
  data.set('environment', form.environment)
  data.set('module', form.module)
  data.set('priority', form.priority)
  data.set('owner', form.owner)
  data.set('sort_order', String(form.sort_order))
  data.set('title', form.title)
  data.set('scenario', form.scenario)
  data.set('test_method', form.test_method)
  data.set('expected_result', form.expected_result)
  data.set('status', form.status)
  data.set('tester', form.tester)
  data.set('note', form.note)
  if (form.id) {
    const retainedImageIds = uploadFileList.value
      .map((fileInfo) => String(fileInfo.id ?? ''))
      .filter((id) => id.startsWith('existing-'))
      .map((id) => Number(id.replace('existing-', '')))
      .filter((id) => Number.isInteger(id) && id > 0)
    data.set('retained_image_ids', retainedImageIds.join(','))
  }
  for (const image of form.images) {
    data.append('images', image)
  }
  return data
}

async function saveItem() {
  if (!form.title.trim()) {
    error.value = '請輸入測試項目名稱'
    return
  }

  saving.value = true
  error.value = ''

  const url = form.id ? `${apiBaseUrl}/api/items/${form.id}` : `${apiBaseUrl}/api/items`
  const method = form.id ? 'PUT' : 'POST'

  try {
    const response = await fetch(url, {
      method,
      headers: authHeaders(),
      body: buildFormData()
    })
    if (!response.ok) throw new Error('儲存失敗')
    await loadItems()
    closeItemModal()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '發生未知錯誤'
  } finally {
    saving.value = false
  }
}

async function updateStatus(item: TestItem, status: Status) {
  const data = new FormData()
  data.set('environment', item.environment)
  data.set('module', item.module)
  data.set('priority', item.priority)
  data.set('owner', item.owner)
  data.set('sort_order', String(item.sort_order))
  data.set('title', item.title)
  data.set('scenario', item.scenario)
  data.set('test_method', item.test_method)
  data.set('expected_result', item.expected_result)
  data.set('status', status)
  data.set('tester', item.tester)
  data.set('note', item.note)

  const response = await fetch(`${apiBaseUrl}/api/items/${item.id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: data
  })
  if (response.ok) await loadItems()
}

function handleStatusChange(item: TestItem, value: string | number) {
  if (typeof value === 'string' && statuses.includes(value as Status)) {
    void updateStatus(item, value as Status)
  }
}

async function deleteItem(item: TestItem) {
  const confirmed = window.confirm(`刪除「${item.title}」？`)
  if (!confirmed) return

  const response = await fetch(`${apiBaseUrl}/api/items/${item.id}`, {
    method: 'DELETE',
    headers: authHeaders()
  })
  if (response.ok) await loadItems()
}

async function deleteAllItems() {
  if (!canDeleteAllItems.value) return

  const confirmed = window.confirm(`確定刪除全部 ${items.value.length} 筆測試資料？此操作無法復原。`)
  if (!confirmed) return

  deletingAll.value = true
  settingsError.value = ''
  error.value = ''

  try {
    const response = await fetch(`${apiBaseUrl}/api/items/all`, {
      method: 'DELETE',
      headers: authHeaders()
    })
    if (!response.ok) throw new Error('刪除所有資料失敗')
    detailItem.value = null
    closeItemModal()
    closeSettings()
    await loadItems()
  } catch (err) {
    settingsError.value = err instanceof Error ? err.message : '刪除所有資料失敗'
  } finally {
    deletingAll.value = false
  }
}

function openDetail(item: TestItem) {
  detailItem.value = item
}

function openEnvironment(environment: Environment) {
  activeEnvironment.value = environment
  currentView.value = 'items'
}

function statusType(status: Status) {
  if (status === 'Pass') return 'success'
  if (status === 'Fail') return 'error'
  if (status === 'Fixed' || status === 'Retest') return 'warning'
  return 'default'
}

watch(activeEnvironment, () => {
  currentPage.value = 1
})

watch(searchKeyword, () => {
  currentPage.value = 1
})

watch(statusFilter, () => {
  currentPage.value = 1
})

watch(moduleFilter, () => {
  currentPage.value = 1
})

watch(ownerFilter, () => {
  currentPage.value = 1
})

watch(testerFilter, () => {
  currentPage.value = 1
})

watch(sortBy, () => {
  currentPage.value = 1
})

watch(settingsOpen, (open) => {
  if (!open) {
    settingsError.value = ''
    deleteAllConfirmText.value = ''
  }
})

watch([filteredItems, pageSize], () => {
  if (currentPage.value > pageCount.value) {
    currentPage.value = pageCount.value
  }
})

onMounted(loadItems)
</script>

<template>
  <n-config-provider>
    <n-message-provider>
      <main v-if="!token" class="login-shell">
        <n-card class="login-panel" :bordered="false">
          <n-space vertical size="large">
            <div>
              <p class="eyebrow">Pre Online Tracker</p>
              <h1>上線前測試追蹤</h1>
            </div>
            <n-form @submit.prevent="login">
              <n-form-item label="簡易密碼" :feedback="loginError" :validation-status="loginError ? 'error' : undefined">
                <n-input
                  v-model:value="passwordInput"
                  type="password"
                  autocomplete="current-password"
                  autofocus
                  @keyup.enter="login"
                />
              </n-form-item>
              <n-button type="primary" block attr-type="submit">進入系統</n-button>
            </n-form>
          </n-space>
        </n-card>
      </main>

      <main v-else class="app-shell">
        <header class="topbar">
          <div>
            <p class="eyebrow">SIT / UAT / Online</p>
            <h1>上線前測試情境追蹤</h1>
          </div>
          <n-space>
            <n-button-group>
              <n-button :type="currentView === 'items' ? 'primary' : 'default'" secondary @click="currentView = 'items'">
                測試清單
              </n-button>
              <n-button :type="currentView === 'stats' ? 'primary' : 'default'" secondary @click="currentView = 'stats'">
                統計資訊
              </n-button>
            </n-button-group>
            <n-button secondary @click="settingsOpen = true">設定</n-button>
            <n-button secondary @click="logout">登出</n-button>
          </n-space>
        </header>

        <n-drawer v-model:show="settingsOpen" :width="360" placement="right">
          <n-drawer-content title="設定" closable>
            <n-space vertical size="large">
              <section class="settings-section">
                <h2>資料管理</h2>
                <p>目前共有 {{ items.length }} 筆測試資料。刪除後會清空所有環境的測試項目與圖片。</p>

                <n-alert v-if="settingsError" type="error" class="form-alert">{{ settingsError }}</n-alert>

                <n-form-item label="輸入 DELETE 確認刪除">
                  <n-input
                    v-model:value="deleteAllConfirmText"
                    placeholder="DELETE"
                    :disabled="items.length === 0 || deletingAll"
                  />
                </n-form-item>

                <n-button
                  type="error"
                  block
                  :disabled="!canDeleteAllItems"
                  :loading="deletingAll"
                  @click="deleteAllItems"
                >
                  刪除所有資料
                </n-button>
              </section>
            </n-space>
          </n-drawer-content>
        </n-drawer>

        <section v-if="currentView === 'stats'" class="stats-screen">
          <div class="section-heading">
            <p class="eyebrow">Overview</p>
            <h2>統計資訊</h2>
          </div>

          <div class="stats-grid">
            <n-card
              v-for="stat in stats"
              :key="stat.environment"
              class="stat-card"
              :class="{ active: activeEnvironment === stat.environment }"
              hoverable
              @click="openEnvironment(stat.environment)"
            >
              <n-space vertical size="small">
                <span>{{ stat.environment }}</span>
                <strong>{{ stat.rate }}%</strong>
                <small>
                  總數 {{ stat.total }} / Pass {{ stat.pass }} / Fail {{ stat.fail }} / Fixed {{ stat.fixed }} /
                  Retest {{ stat.retest }} / 未測試 {{ stat.untested }}
                </small>
              </n-space>
            </n-card>
          </div>
        </section>

        <section v-else class="workspace">
          <n-card class="list-panel">
            <template #header>{{ activeEnvironment }} 測試清單</template>
            <template #header-extra>
              <n-space class="list-toolbar">
                <n-button-group class="environment-switch">
                  <n-button
                    v-for="environment in environments"
                    :key="environment"
                    :type="activeEnvironment === environment ? 'primary' : 'default'"
                    secondary
                    @click="activeEnvironment = environment"
                  >
                    {{ environment }}
                  </n-button>
                </n-button-group>
                <n-input
                  v-model:value="searchKeyword"
                  clearable
                  class="search-input"
                  placeholder="搜尋測試清單"
                />
                <n-select
                  v-model:value="statusFilter"
                  :options="statusFilterOptions"
                  class="status-filter"
                />
                <n-select
                  v-model:value="moduleFilter"
                  :options="moduleOptions"
                  class="status-filter"
                />
                <n-select
                  v-model:value="ownerFilter"
                  :options="ownerOptions"
                  class="status-filter"
                />
                <n-select
                  v-model:value="testerFilter"
                  :options="testerOptions"
                  class="status-filter"
                />
                <n-select
                  v-model:value="sortBy"
                  :options="sortOptions"
                  class="sort-select"
                />
                <n-button type="primary" @click="openCreateItem">新增測試項目</n-button>
                <n-button secondary @click="triggerImport">匯入 CSV / XLSX</n-button>
                <n-button secondary :disabled="sortedItems.length === 0" @click="exportCsv">匯出 CSV</n-button>
                <n-button secondary :disabled="sortedItems.length === 0" @click="exportXlsx">匯出 XLSX</n-button>
                <n-button secondary :loading="loading" @click="loadItems">重新整理</n-button>
              </n-space>
              <input
                ref="importFileInput"
                class="file-input"
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                @change="handleImportFile"
              />
            </template>

            <n-alert v-if="error" type="error" class="form-alert">{{ error }}</n-alert>

            <div class="table-wrap">
              <n-table :bordered="false" :single-line="false">
                <thead>
                  <tr>
                    <th>模組</th>
                    <th>優先級</th>
                    <th>測試項目</th>
                    <th>測試方式</th>
                    <th>預期結果</th>
                    <th>狀態</th>
                    <th>測試人員</th>
                    <th>圖片</th>
                    <th>備註</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in paginatedItems" :key="item.id">
                    <td>
                      <strong>{{ item.module || '-' }}</strong>
                    </td>
                    <td>
                      <n-tag size="small" :type="item.priority === 'P0' || item.priority === 'P1' ? 'error' : 'default'">
                        {{ item.priority }}
                      </n-tag>
                      <small>#{{ item.sort_order }}</small>
                    </td>
                    <td>
                      <strong>{{ item.title }}</strong>
                      <small>{{ item.scenario }}</small>
                    </td>
                    <td>{{ item.test_method }}</td>
                    <td>{{ item.expected_result }}</td>
                    <td>
                      <n-select
                        :value="item.status"
                        :options="statusOptions"
                        size="small"
                        class="status-select"
                        @update:value="(value: string | number) => handleStatusChange(item, value)"
                      />
                    </td>
                    <td>{{ item.tester || '-' }}</td>
                    <td class="image-cell">
                      <img v-if="item.image_url" class="thumb" :src="fullImageUrl(item.image_url)" :alt="item.title" />
                      <span v-else class="muted">無</span>
                      <n-tag v-if="item.images.length > 0" size="small" round>{{ item.images.length }} 張</n-tag>
                    </td>
                    <td class="note-cell">
                      <n-button v-if="item.note" size="tiny" secondary @click="openDetail(item)">查看備註</n-button>
                      <span v-else class="muted">-</span>
                    </td>
                    <td>
                      <n-space size="small">
                        <n-button size="small" secondary @click="openDetail(item)">查看更多</n-button>
                        <n-button size="small" secondary @click="editItem(item)">編輯</n-button>
                        <n-button size="small" type="error" secondary @click="deleteItem(item)">刪除</n-button>
                      </n-space>
                    </td>
                  </tr>
                  <tr v-if="filteredItems.length === 0">
                    <td colspan="10" class="empty-state">
                      {{ environmentItems.length === 0 ? '尚無測試項目' : '找不到符合篩選條件的測試項目' }}
                    </td>
                  </tr>
                </tbody>
              </n-table>
            </div>

            <div v-if="filteredItems.length > 0" class="pagination-bar">
              <span class="pagination-summary">
                顯示 {{ paginationRange.start }}-{{ paginationRange.end }}，共 {{ filteredItems.length }} 筆
              </span>
              <n-pagination
                v-model:page="currentPage"
                v-model:page-size="pageSize"
                :item-count="filteredItems.length"
                :page-sizes="pageSizeOptions"
                :page-count="pageCount"
                show-size-picker
              />
            </div>
          </n-card>
        </section>

        <n-modal v-model:show="itemModalOpen" preset="card" class="item-modal" :title="form.id ? '編輯測試項目' : '新增測試項目'">
          <n-form class="item-form" label-placement="top" @submit.prevent="saveItem">
            <div class="item-form-grid">
              <div class="form-column">
                <n-grid :cols="2" :x-gap="12" responsive="screen">
                  <n-form-item-gi label="測試環境">
                    <n-select v-model:value="form.environment" :options="environmentOptions" />
                  </n-form-item-gi>
                  <n-form-item-gi label="狀態">
                    <n-select v-model:value="form.status" :options="statusOptions" />
                  </n-form-item-gi>
                </n-grid>

                <n-form-item label="測試項目">
                  <n-input v-model:value="form.title" placeholder="例如：入戶照片上傳" />
                </n-form-item>

                <n-form-item label="測試情境說明">
                  <n-input
                    v-model:value="form.scenario"
                    type="textarea"
                    :autosize="{ minRows: 1, maxRows: 3 }"
                    placeholder="例如：確認使用者可以從工單進入入戶流程"
                  />
                </n-form-item>

                <n-form-item label="測試方式">
                  <n-input
                    v-model:value="form.test_method"
                    type="textarea"
                    :autosize="{ minRows: 2, maxRows: 4 }"
                    placeholder="例如：先打開工單，點擊入戶按鈕，再點擊上傳照片"
                  />
                </n-form-item>

                <n-form-item label="預期結果">
                  <n-input
                    v-model:value="form.expected_result"
                    type="textarea"
                    :autosize="{ minRows: 1, maxRows: 3 }"
                    placeholder="例如：照片成功上傳，畫面顯示成功"
                  />
                </n-form-item>
              </div>

              <div class="form-column">
                <n-form-item label="模組">
                  <n-input v-model:value="form.module" placeholder="例如：web、app" />
                </n-form-item>

                <n-grid :cols="3" :x-gap="12" responsive="screen">
                  <n-form-item-gi label="優先級">
                    <n-select v-model:value="form.priority" :options="priorityOptions" />
                  </n-form-item-gi>
                  <n-form-item-gi label="負責人">
                    <n-input v-model:value="form.owner" placeholder="負責修正或追蹤的人" />
                  </n-form-item-gi>
                  <n-form-item-gi label="排序">
                    <n-input-number v-model:value="form.sort_order" :min="0" />
                  </n-form-item-gi>
                </n-grid>

                <n-form-item label="測試人員">
                  <n-input v-model:value="form.tester" placeholder="測試人員名稱" />
                </n-form-item>

                <n-form-item label="圖片">
                  <n-upload
                    v-model:file-list="uploadFileList"
                    multiple
                    accept="image/*"
                    list-type="image-card"
                    :default-upload="false"
                    @change="handleUploadChange"
                  >
                    選擇圖片
                  </n-upload>
                </n-form-item>

                <div v-if="form.id" class="form-hint">編輯時新選擇的圖片會追加到原本圖片後面。</div>

                <n-form-item label="備註">
                  <n-input
                    v-model:value="form.note"
                    type="textarea"
                    :autosize="{ minRows: 1, maxRows: 3 }"
                    placeholder="失敗原因、補充說明或回報狀態"
                  />
                </n-form-item>
              </div>
            </div>

            <n-alert v-if="error" type="error" class="form-alert">{{ error }}</n-alert>
            <n-space justify="end" class="form-actions">
              <n-button secondary @click="closeItemModal">取消</n-button>
              <n-button type="primary" attr-type="submit" :loading="saving">儲存</n-button>
            </n-space>
          </n-form>
        </n-modal>

        <n-modal v-model:show="detailModalOpen" preset="card" class="detail-modal" :title="detailItem?.title">
          <n-space v-if="detailItem" vertical size="large">
            <n-space>
              <n-tag>{{ detailItem.environment }}</n-tag>
              <n-tag :type="statusType(detailItem.status)">{{ detailItem.status }}</n-tag>
              <n-tag>{{ detailItem.priority }}</n-tag>
              <n-tag>{{ detailItem.images.length }} 張圖片</n-tag>
            </n-space>

            <n-descriptions bordered :column="1" size="small">
              <n-descriptions-item label="模組">
                {{ detailItem.module || '-' }}
              </n-descriptions-item>
              <n-descriptions-item label="負責人 / 排序">
                {{ detailItem.owner || '-' }} / #{{ detailItem.sort_order }}
              </n-descriptions-item>
              <n-descriptions-item label="測試情境">{{ detailItem.scenario || '-' }}</n-descriptions-item>
              <n-descriptions-item label="測試方式">{{ detailItem.test_method || '-' }}</n-descriptions-item>
              <n-descriptions-item label="預期結果">{{ detailItem.expected_result || '-' }}</n-descriptions-item>
              <n-descriptions-item label="測試人員">{{ detailItem.tester || '-' }}</n-descriptions-item>
              <n-descriptions-item label="備註">{{ detailItem.note || '-' }}</n-descriptions-item>
            </n-descriptions>

            <div v-if="detailItem.images.length > 0" class="image-grid">
              <a
                v-for="image in detailItem.images"
                :key="image.id"
                :href="fullImageUrl(image.path)"
                target="_blank"
                rel="noreferrer"
              >
                <img :src="fullImageUrl(image.path)" :alt="detailItem.title" />
              </a>
            </div>
            <n-empty v-else description="尚未上傳圖片" />

          </n-space>
        </n-modal>
      </main>
    </n-message-provider>
  </n-config-provider>
</template>
