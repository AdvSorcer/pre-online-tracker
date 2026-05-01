import { Database } from 'bun:sqlite'
import { Elysia } from 'elysia'
import { mkdir } from 'node:fs/promises'
import { extname } from 'node:path'

const port = Number(Bun.env.PORT ?? 3000)
const password = Bun.env.SIMPLE_PASSWORD ?? '2026'
const appToken = Bun.env.APP_TOKEN ?? 'local-token'
const dbPath = Bun.env.DB_PATH ?? './data/pre-online-tracker.db'
const uploadDir = Bun.env.UPLOAD_DIR ?? './uploads'

await mkdir(uploadDir, { recursive: true })
await mkdir(dbPath.split('/').slice(0, -1).join('/') || '.', { recursive: true })

const db = new Database(dbPath)
db.run('PRAGMA foreign_keys = ON')
db.run(`
  CREATE TABLE IF NOT EXISTS test_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    environment TEXT NOT NULL CHECK(environment IN ('SIT', 'UAT', 'Online')),
    title TEXT NOT NULL,
    scenario TEXT NOT NULL DEFAULT '',
    test_method TEXT NOT NULL DEFAULT '',
    expected_result TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '未測試' CHECK(status IN ('未測試', 'Pass', 'Fail')),
    tester TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    image_path TEXT,
    tested_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)
db.run(`
  CREATE TABLE IF NOT EXISTS test_item_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES test_items(id) ON DELETE CASCADE,
    UNIQUE(item_id, path)
  )
`)
db.run(`
  INSERT OR IGNORE INTO test_item_images (item_id, path)
  SELECT id, image_path FROM test_items
  WHERE image_path IS NOT NULL AND image_path <> ''
`)

type TestItem = {
  id: number
  environment: 'SIT' | 'UAT' | 'Online'
  title: string
  scenario: string
  test_method: string
  expected_result: string
  status: '未測試' | 'Pass' | 'Fail'
  tester: string
  note: string
  image_path: string | null
  tested_at: string | null
  created_at: string
  updated_at: string
}

type TestItemImage = {
  id: number
  item_id: number
  path: string
  created_at: string
}

type ItemInput = {
  environment?: string
  title?: string
  scenario?: string
  test_method?: string
  expected_result?: string
  status?: string
  tester?: string
  note?: string
}

const environments = new Set(['SIT', 'UAT', 'Online'])
const statuses = new Set(['未測試', 'Pass', 'Fail'])

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }
}

function requireAuth(headers: Record<string, string | undefined>) {
  const authorization = headers.authorization ?? ''
  if (authorization !== `Bearer ${appToken}`) {
    throw new Response('Unauthorized', { status: 401, headers: corsHeaders() })
  }
}

function normalizeInput(input: ItemInput, partial = false) {
  const title = input.title?.trim()
  const environment = input.environment?.trim()
  const status = input.status?.trim()

  if (!partial || environment !== undefined) {
    if (!environment || !environments.has(environment)) {
      throw new Response('Invalid environment', { status: 400, headers: corsHeaders() })
    }
  }

  if (!partial || title !== undefined) {
    if (!title) {
      throw new Response('Title is required', { status: 400, headers: corsHeaders() })
    }
  }

  if (status !== undefined && !statuses.has(status)) {
    throw new Response('Invalid status', { status: 400, headers: corsHeaders() })
  }

  return {
    environment,
    title,
    scenario: input.scenario?.trim() ?? '',
    test_method: input.test_method?.trim() ?? '',
    expected_result: input.expected_result?.trim() ?? '',
    status: status ?? '未測試',
    tester: input.tester?.trim() ?? '',
    note: input.note?.trim() ?? ''
  }
}

async function saveImage(image: unknown) {
  if (!(image instanceof File) || image.size === 0) {
    return null
  }

  if (!image.type.startsWith('image/')) {
    throw new Response('Only image uploads are allowed', { status: 400, headers: corsHeaders() })
  }

  const extension = extname(image.name) || '.jpg'
  const safeName = `${crypto.randomUUID()}${extension.toLowerCase()}`
  const fullPath = `${uploadDir}/${safeName}`
  await Bun.write(fullPath, image)
  return `/uploads/${safeName}`
}

function collectImages(payload: { image?: unknown; images?: unknown }) {
  const images = payload.images
  if (Array.isArray(images)) return images
  if (images instanceof File) return [images]
  if (payload.image instanceof File) return [payload.image]
  return []
}

async function saveImages(payload: { image?: unknown; images?: unknown }) {
  const saved = []
  for (const image of collectImages(payload)) {
    const imagePath = await saveImage(image)
    if (imagePath) saved.push(imagePath)
  }
  return saved
}

function insertImages(itemId: number, imagePaths: string[]) {
  const insert = db.query('INSERT OR IGNORE INTO test_item_images (item_id, path) VALUES (?, ?)')
  for (const imagePath of imagePaths) {
    insert.run(itemId, imagePath)
  }
}

function getImages(itemId: number) {
  return db
    .query<TestItemImage, [number]>('SELECT * FROM test_item_images WHERE item_id = ? ORDER BY id ASC')
    .all(itemId)
}

function mapItem(item: TestItem) {
  const images = getImages(item.id)
  return {
    ...item,
    images,
    image_urls: images.map((image) => image.path),
    image_url: images[0]?.path ?? item.image_path ?? null
  }
}

const app = new Elysia()
  .onRequest(({ request, set }) => {
    Object.assign(set.headers, corsHeaders())
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }
  })
  .post('/api/login', ({ body }) => {
    const payload = body as { password?: string }
    if (payload.password !== password) {
      throw new Response('Invalid password', { status: 401, headers: corsHeaders() })
    }
    return { token: appToken }
  })
  .get('/api/items', ({ headers, query }) => {
    requireAuth(headers)
    const environment = typeof query.environment === 'string' ? query.environment : undefined
    const items =
      environment && environments.has(environment)
        ? db.query<TestItem, [string]>('SELECT * FROM test_items WHERE environment = ? ORDER BY id DESC').all(environment)
        : db.query<TestItem, []>('SELECT * FROM test_items ORDER BY id DESC').all()
    return items.map(mapItem)
  })
  .post('/api/items', async ({ headers, body }) => {
    requireAuth(headers)
    const payload = body as ItemInput & { image?: unknown; images?: unknown }
    const input = normalizeInput(payload)
    const imagePaths = await saveImages(payload)
    const testedAt = input.status === '未測試' ? null : new Date().toISOString()

    const result = db
      .query(
        `INSERT INTO test_items
          (environment, title, scenario, test_method, expected_result, status, tester, note, image_path, tested_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .run(
        input.environment!,
        input.title!,
        input.scenario,
        input.test_method,
        input.expected_result,
        input.status,
        input.tester,
        input.note,
        imagePaths[0] ?? null,
        testedAt
      )

    const itemId = Number(result.lastInsertRowid)
    insertImages(itemId, imagePaths)
    const item = db.query<TestItem, [number]>('SELECT * FROM test_items WHERE id = ?').get(itemId)
    return mapItem(item!)
  })
  .put('/api/items/:id', async ({ headers, params, body }) => {
    requireAuth(headers)
    const id = Number(params.id)
    const existing = db.query<TestItem, [number]>('SELECT * FROM test_items WHERE id = ?').get(id)
    if (!existing) {
      throw new Response('Not found', { status: 404, headers: corsHeaders() })
    }

    const payload = body as ItemInput & { image?: unknown; images?: unknown }
    const input = normalizeInput(payload, true)
    const newImagePaths = await saveImages(payload)
    if (newImagePaths.length > 0) {
      insertImages(id, newImagePaths)
    }
    const images = getImages(id)
    const firstImagePath = images[0]?.path ?? newImagePaths[0] ?? existing.image_path
    const nextStatus = input.status ?? existing.status
    const testedAt = nextStatus === '未測試' ? null : new Date().toISOString()

    db.query(
      `UPDATE test_items SET
        environment = ?,
        title = ?,
        scenario = ?,
        test_method = ?,
        expected_result = ?,
        status = ?,
        tester = ?,
        note = ?,
        image_path = ?,
        tested_at = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      input.environment ?? existing.environment,
      input.title ?? existing.title,
      payload.scenario ?? existing.scenario,
      payload.test_method ?? existing.test_method,
      payload.expected_result ?? existing.expected_result,
      input.status ?? existing.status,
      payload.tester ?? existing.tester,
      payload.note ?? existing.note,
      firstImagePath,
      testedAt,
      id
    )

    const item = db.query<TestItem, [number]>('SELECT * FROM test_items WHERE id = ?').get(id)
    return mapItem(item!)
  })
  .delete('/api/items/:id', ({ headers, params }) => {
    requireAuth(headers)
    db.query('DELETE FROM test_items WHERE id = ?').run(Number(params.id))
    return { ok: true }
  })
  .get('/uploads/:file', ({ params }) => {
    const file = Bun.file(`${uploadDir}/${params.file}`)
    if (!file.size) {
      throw new Response('Not found', { status: 404, headers: corsHeaders() })
    }
    return file
  })
  .listen(port)

console.log(`API server running on http://localhost:${app.server?.port}`)
