import type { IssueInput, IssueItem, IssuePriority, IssueStatus, IssueType } from './types'

const issueHeaders = ['Key', '標題', '描述', '類型', '狀態', '優先級', '指派人', '預計完成日', '建立時間'] as const

const types: IssueType[] = ['Feature', 'Bug', 'Task']
const statuses: IssueStatus[] = ['Open', 'In Progress', 'Fixed', 'Closed']
const priorities: IssuePriority[] = ['Blocker', 'High', 'Medium', 'Low']

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
  const endHeader = new Uint8Array(22)
  const endView = new DataView(endHeader.buffer)
  writeUint32(endView, 0, 0x06054b50)
  writeUint16(endView, 4, 0)
  writeUint16(endView, 6, 0)
  writeUint16(endView, 8, files.length)
  writeUint16(endView, 10, files.length)
  writeUint32(endView, 12, centralSize)
  writeUint32(endView, 16, offset)
  writeUint16(endView, 20, 0)

  const allParts = [...localParts, ...centralParts, endHeader]
  const totalLength = allParts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(totalLength)
  let currentOffset = 0
  for (const part of allParts) {
    result.set(part, currentOffset)
    currentOffset += part.length
  }
  return result
}

export function buildIssuesXlsxBlob(issues: IssueItem[]) {
  const rows = [
    [...issueHeaders],
    ...issues.map((item) => [
      item.issue_key,
      item.title,
      item.description,
      item.type,
      item.status,
      item.priority,
      item.assignee,
      item.due_date ?? '',
      item.created_at
    ])
  ]

  const sheetData = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">` +
        row
          .map((value, colIndex) => {
            const cellRef = `${worksheetColumnName(colIndex + 1)}${rowIndex + 1}`
            return `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
          })
          .join('') +
        '</row>'
    )
    .join('')

  const worksheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${sheetData}</sheetData>` +
    '</worksheet>'

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Issues" sheetId="1" r:id="rId1"/></sheets>' +
    '</workbook>'

  const workbookRlsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>'

  const rootRlsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>'

  const zipBytes = createZip([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRlsXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRlsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml }
  ])

  return new Blob([toArrayBuffer(zipBytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

function parseCsv(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ''
  let inQuotes = false

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i]
    const nextChar = normalized[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentValue += '"'
        i += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        currentValue += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      currentRow.push(currentValue)
      currentValue = ''
    } else if (char === '\n') {
      currentRow.push(currentValue)
      rows.push(currentRow)
      currentRow = []
      currentValue = ''
    } else {
      currentValue += char
    }
  }

  if (currentValue || currentRow.length > 0) {
    currentRow.push(currentValue)
    rows.push(currentRow)
  }

  return rows.filter((row) => row.some((cell) => cell.trim()))
}

async function readZipEntries(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const decoder = new TextDecoder('utf-8')
  let endOffset = -1

  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endOffset = i
      break
    }
  }
  if (endOffset === -1) throw new Error('請上傳合法的 Excel (.xlsx) 或 CSV 檔案')

  const centralCount = view.getUint16(endOffset + 10, true)
  const centralOffset = view.getUint32(endOffset + 16, true)
  let currentOffset = centralOffset
  const entries = new Map<string, string>()

  for (let i = 0; i < centralCount; i += 1) {
    if (view.getUint32(currentOffset, true) !== 0x02014b50) break
    const compression = view.getUint16(currentOffset + 10, true)
    const nameLength = view.getUint16(currentOffset + 28, true)
    const extraLength = view.getUint16(currentOffset + 30, true)
    const commentLength = view.getUint16(currentOffset + 32, true)
    const localOffset = view.getUint32(currentOffset + 42, true)

    const nameBytes = bytes.subarray(currentOffset + 46, currentOffset + 46 + nameLength)
    const fileName = decoder.decode(nameBytes)

    if (view.getUint32(localOffset, true) === 0x04034b50) {
      const localNameLen = view.getUint16(localOffset + 26, true)
      const localExtraLen = view.getUint16(localOffset + 28, true)
      const dataStart = localOffset + 30 + localNameLen + localExtraLen
      const dataLen = view.getUint32(localOffset + 18, true)

      if (compression === 0) {
        entries.set(fileName, decoder.decode(bytes.subarray(dataStart, dataStart + dataLen)))
      }
    }

    currentOffset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

function parseSharedStrings(xml: string) {
  return Array.from(xml.matchAll(/<t[^>]*>(.*?)<\/t>/g)).map((match) =>
    match[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
  )
}

function parseSheetRows(xml: string, sharedStrings: string[]) {
  const rowMatches = xml.matchAll(/<row[^>]*>(.*?)<\/row>/g)
  const rows: string[][] = []

  for (const rowMatch of rowMatches) {
    const rowContent = rowMatch[1]
    const cellMatches = rowContent.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(.*?)<\/c>/g)
    const row: string[] = []

    for (const cellMatch of cellMatches) {
      const colName = cellMatch[1]
      const attributes = cellMatch[2]
      const body = cellMatch[3]
      const typeMatch = attributes.match(/t="([^"]+)"/)
      const type = typeMatch ? typeMatch[1] : ''

      let columnIndex = 0
      for (let i = 0; i < colName.length; i += 1) {
        columnIndex = columnIndex * 26 + (colName.charCodeAt(i) - 64)
      }
      columnIndex -= 1

      let value = ''
      if (type === 's') {
        const valMatch = body.match(/<v>(.*?)<\/v>/)
        const index = valMatch ? Number(valMatch[1]) : NaN
        value = Number.isInteger(index) ? sharedStrings[index] ?? '' : ''
      } else if (type === 'inlineStr') {
        const strMatch = body.match(/<t[^>]*>(.*?)<\/t>/)
        value = strMatch
          ? strMatch[1]
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .replace(/&amp;/g, '&')
          : ''
      } else {
        const valMatch = body.match(/<v>(.*?)<\/v>/)
        value = valMatch ? valMatch[1] : ''
      }

      while (row.length < columnIndex) row.push('')
      row[columnIndex] = value
    }

    if (row.some((cell) => cell.trim())) rows.push(row)
  }

  return rows
}

export async function parseXlsxRows(file: File) {
  if (file.name.endsWith('.csv')) {
    return parseCsv(await file.text())
  }

  const buffer = await file.arrayBuffer()
  const entries = await readZipEntries(buffer)
  const sharedStringsXml = entries.get('xl/sharedStrings.xml') ?? ''
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : []
  const sheetXml = entries.get('xl/worksheets/sheet1.xml')

  if (!sheetXml) throw new Error('找不到工作表資料')
  return parseSheetRows(sheetXml, sharedStrings)
}

function normalizeHeader(header: string) {
  return header.trim().replace(/^\uFEFF/, '')
}

function normalizeType(value: string): IssueType {
  const normalized = value.trim()
  if (normalized === 'Bug' || normalized === '缺陷') return 'Bug'
  if (normalized === 'Task' || normalized === '任務') return 'Task'
  return 'Feature'
}

function normalizeStatus(value: string): IssueStatus {
  const normalized = value.trim()
  if (normalized === 'In Progress' || normalized === '處理中') return 'In Progress'
  if (normalized === 'Fixed' || normalized === '已修復') return 'Fixed'
  if (normalized === 'Closed' || normalized === '已關閉') return 'Closed'
  return 'Open'
}

function normalizePriority(value: string): IssuePriority {
  const normalized = value.trim()
  if (normalized === 'Blocker' || normalized === '緊急' || normalized === '阻擋') return 'Blocker'
  if (normalized === 'High' || normalized === '高') return 'High'
  if (normalized === 'Low' || normalized === '低') return 'Low'
  return 'Medium'
}

function excelSerialToDate(value: string) {
  const serial = Number(value)
  if (!Number.isFinite(serial) || serial <= 0) return value
  const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)))
  return date.toISOString().slice(0, 10)
}

function normalizeDate(value: string) {
  const normalized = value.trim()
  if (!normalized) return null
  if (/^\d+(\.\d+)?$/.test(normalized)) return excelSerialToDate(normalized)
  return normalized.replace(/\//g, '-')
}

export async function parseIssuesXlsx(file: File) {
  const [headerRow, ...dataRows] = await parseXlsxRows(file)
  if (!headerRow || dataRows.length === 0) {
    throw new Error('XLSX 沒有可匯入的 Issue 資料')
  }

  const headerIndex = new Map(headerRow.map((header, index) => [normalizeHeader(header), index]))
  const read = (row: string[], names: string[], fallback = '') => {
    for (const name of names) {
      const index = headerIndex.get(name)
      if (index !== undefined) return row[index]?.trim() ?? fallback
    }
    return fallback
  }

  return dataRows
    .map<IssueInput>((row) => ({
      title: read(row, ['標題', 'Title', '主旨']),
      description: read(row, ['描述', 'Description', '內容']),
      type: normalizeType(read(row, ['類型', 'Type'])),
      status: normalizeStatus(read(row, ['狀態', 'Status'])),
      priority: normalizePriority(read(row, ['優先級', 'Priority', '優先順序'])),
      assignee: read(row, ['指派人', 'Assignee', '負責人']),
      due_date: normalizeDate(read(row, ['預計完成日', '預計完成日期', 'Due Date']))
    }))
    .filter((issue) => issue.title && issue.title.trim())
}
