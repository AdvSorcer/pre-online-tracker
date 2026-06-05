import type { Environment, IssueReport, IssueReportInput, IssueResolutionStatus } from './types'

const issueReportHeaders = ['環境', '狀態', '問題描述', '提報日期', '廠商回覆', '回覆日期'] as const
const environments: Environment[] = ['SIT', 'UAT', 'Online']
const resolutionStatuses: IssueResolutionStatus[] = ['未解決', '已解決']

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

function buildWorksheetXml(rows: unknown[][]) {
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
    <col min="1" max="2" width="14" customWidth="1"/>
    <col min="3" max="3" width="42" customWidth="1"/>
    <col min="4" max="4" width="16" customWidth="1"/>
    <col min="5" max="5" width="42" customWidth="1"/>
    <col min="6" max="6" width="16" customWidth="1"/>
  </cols>
  <sheetData>${sheetData}</sheetData>
</worksheet>`
}

export function buildIssueReportsXlsxBlob(reports: IssueReport[], sheetName: string) {
  const rows = [
    [...issueReportHeaders],
    ...reports.map((report) => [
      report.environment,
      report.resolution_status,
      report.issue_description,
      report.reported_at,
      report.vendor_response,
      report.responded_at ?? ''
    ])
  ]
  const createdAt = new Date().toISOString()
  const safeSheetName = sheetName.slice(0, 31)

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
  <dc:title>${xmlEscape(sheetName)}</dc:title>
  <dc:creator>Pre Online Tracker</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${xmlEscape(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets>
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
      content: buildWorksheetXml(rows)
    }
  ])
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
    throw new Error('此瀏覽器不支援直接解析 XLSX')
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

async function parseXlsxRows(file: File) {
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

function normalizeHeader(header: string) {
  return header.trim().replace(/^\uFEFF/, '')
}

function normalizeEnvironment(value: string, fallback: Environment): Environment {
  const normalized = value.trim()
  return environments.includes(normalized as Environment) ? (normalized as Environment) : fallback
}

function normalizeResolutionStatus(value: string): IssueResolutionStatus {
  const normalized = value.trim()
  return resolutionStatuses.includes(normalized as IssueResolutionStatus)
    ? (normalized as IssueResolutionStatus)
    : '未解決'
}

function excelSerialToDate(value: string) {
  const serial = Number(value)
  if (!Number.isFinite(serial) || serial <= 0) return value

  const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)))
  return date.toISOString().slice(0, 10)
}

function normalizeDate(value: string, fallback = '') {
  const normalized = value.trim()
  if (!normalized) return fallback
  if (/^\d+(\.\d+)?$/.test(normalized)) return excelSerialToDate(normalized)
  return normalized.replace(/\//g, '-')
}

export async function parseIssueReportsXlsx(file: File, fallbackEnvironment: Environment) {
  const [headerRow, ...dataRows] = await parseXlsxRows(file)
  if (!headerRow || dataRows.length === 0) {
    throw new Error('XLSX 沒有可匯入的問題紀錄')
  }

  const headerIndex = new Map(headerRow.map((header, index) => [normalizeHeader(header), index]))
  const read = (row: string[], names: string[], fallback = '') => {
    for (const name of names) {
      const index = headerIndex.get(name)
      if (index !== undefined) return row[index]?.trim() ?? fallback
    }
    return fallback
  }
  const today = new Date().toISOString().slice(0, 10)

  return dataRows
    .map<IssueReportInput>((row) => ({
      environment: normalizeEnvironment(read(row, ['環境'], fallbackEnvironment), fallbackEnvironment),
      resolution_status: normalizeResolutionStatus(read(row, ['狀態', '解決狀態'])),
      issue_description: read(row, ['問題描述', '問題']),
      reported_at: normalizeDate(read(row, ['提報日期']), today),
      vendor_response: read(row, ['廠商回覆']),
      responded_at: normalizeDate(read(row, ['回覆日期'])) || null
    }))
    .filter((report) => report.issue_description)
}
