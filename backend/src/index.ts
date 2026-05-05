import { Database } from 'bun:sqlite'
import { Elysia, status, t, type Static } from 'elysia'
import { mkdir, unlink } from 'node:fs/promises'
import { basename, extname } from 'node:path'

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
    module TEXT NOT NULL DEFAULT '',
    feature TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'P2' CHECK(priority IN ('P0', 'P1', 'P2', 'P3')),
    owner TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    scenario TEXT NOT NULL DEFAULT '',
    test_method TEXT NOT NULL DEFAULT '',
    expected_result TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '未測試' CHECK(status IN ('未測試', 'Pass', 'Fail', 'Fixed', 'Retest')),
    tester TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    image_path TEXT,
    tested_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)
db.run(`
  CREATE TABLE IF NOT EXISTS test_item_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT '',
    from_status TEXT,
    to_status TEXT,
    note TEXT NOT NULL DEFAULT '',
    changes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES test_items(id) ON DELETE CASCADE
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

function tableColumns(table: string) {
  return new Set(db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((column) => column.name))
}

const itemColumns = tableColumns('test_items')
const migrations = [
  ['module', "ALTER TABLE test_items ADD COLUMN module TEXT NOT NULL DEFAULT ''"],
  ['feature', "ALTER TABLE test_items ADD COLUMN feature TEXT NOT NULL DEFAULT ''"],
  ['priority', "ALTER TABLE test_items ADD COLUMN priority TEXT NOT NULL DEFAULT 'P2'"],
  ['owner', "ALTER TABLE test_items ADD COLUMN owner TEXT NOT NULL DEFAULT ''"],
  ['sort_order', 'ALTER TABLE test_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0']
] as const
for (const [column, sql] of migrations) {
  if (!itemColumns.has(column)) db.run(sql)
}

const itemTableSql =
  db.query<{ sql: string }, []>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'test_items'").get()?.sql ??
  ''
if (!itemTableSql.includes("'Fixed'") || !itemTableSql.includes("'Retest'")) {
  db.run('PRAGMA foreign_keys = OFF')
  db.transaction(() => {
    db.run(`
      CREATE TABLE test_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        environment TEXT NOT NULL CHECK(environment IN ('SIT', 'UAT', 'Online')),
        module TEXT NOT NULL DEFAULT '',
        feature TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'P2' CHECK(priority IN ('P0', 'P1', 'P2', 'P3')),
        owner TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL,
        scenario TEXT NOT NULL DEFAULT '',
        test_method TEXT NOT NULL DEFAULT '',
        expected_result TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '未測試' CHECK(status IN ('未測試', 'Pass', 'Fail', 'Fixed', 'Retest')),
        tester TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        image_path TEXT,
        tested_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    db.run(`
      INSERT INTO test_items_new
        (id, environment, module, feature, priority, owner, sort_order, title, scenario, test_method, expected_result,
         status, tester, note, image_path, tested_at, created_at, updated_at)
      SELECT
        id, environment, module, feature, priority, owner, sort_order, title, scenario, test_method, expected_result,
        status, tester, note, image_path, tested_at, created_at, updated_at
      FROM test_items
    `)
    db.run('DROP TABLE test_items')
    db.run('ALTER TABLE test_items_new RENAME TO test_items')
  })()
  db.run('PRAGMA foreign_keys = ON')
}

db.run(`
  INSERT OR IGNORE INTO test_item_images (item_id, path)
  SELECT id, image_path FROM test_items
  WHERE image_path IS NOT NULL AND image_path <> ''
`)

type TestItem = {
  id: number
  environment: 'SIT' | 'UAT' | 'Online'
  module: string
  feature: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  owner: string
  sort_order: number
  title: string
  scenario: string
  test_method: string
  expected_result: string
  status: '未測試' | 'Pass' | 'Fail' | 'Fixed' | 'Retest'
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

const environmentSet = new Set<string>(['SIT', 'UAT', 'Online'])

const environmentSchema = t.Union([t.Literal('SIT'), t.Literal('UAT'), t.Literal('Online')])
const statusSchema = t.Union([
  t.Literal('未測試'),
  t.Literal('Pass'),
  t.Literal('Fail'),
  t.Literal('Fixed'),
  t.Literal('Retest')
])
const prioritySchema = t.Union([t.Literal('P0'), t.Literal('P1'), t.Literal('P2'), t.Literal('P3')])
const itemIdParamsSchema = t.Object({ id: t.Numeric() })
const itemInputSchema = {
  environment: environmentSchema,
  module: t.Optional(t.String()),
  feature: t.Optional(t.String()),
  priority: t.Optional(prioritySchema),
  owner: t.Optional(t.String()),
  sort_order: t.Optional(t.Numeric()),
  title: t.String({ minLength: 1 }),
  scenario: t.Optional(t.String()),
  test_method: t.Optional(t.String()),
  expected_result: t.Optional(t.String()),
  status: t.Optional(statusSchema),
  tester: t.Optional(t.String()),
  note: t.Optional(t.String())
} as const
const createItemBodySchema = t.Object({
  ...itemInputSchema,
  image: t.Optional(t.File({ type: 'image/*' })),
  images: t.Optional(t.Files({ type: 'image/*' })),
  retained_image_ids: t.Optional(t.String())
})
const updateItemBodySchema = t.Partial(createItemBodySchema)
const importItemsBodySchema = t.Object({
  items: t.Array(t.Object(itemInputSchema))
})

type ItemInput = Partial<Omit<Static<typeof createItemBodySchema>, 'image' | 'images' | 'retained_image_ids'>>
type ItemPayload = Static<typeof createItemBodySchema> | Static<typeof updateItemBodySchema>

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }
}

function requireAuth({
  headers,
  query
}: {
  headers: Record<string, string | undefined>
  query?: Record<string, string | undefined>
}) {
  const authorization = headers.authorization ?? ''
  const queryToken = query?.token ?? ''
  if (authorization !== `Bearer ${appToken}` && queryToken !== appToken) {
    return status(401, 'Unauthorized')
  }
}

function normalizeInput(input: ItemInput, partial = false) {
  const title = input.title?.trim()
  const environment = input.environment?.trim()
  const itemStatus = input.status?.trim()
  const priority = input.priority?.trim()
  const sortOrder = input.sort_order === undefined ? undefined : Number(input.sort_order)

  return {
    environment,
    title,
    module: input.module?.trim() ?? (partial ? undefined : ''),
    feature: input.feature?.trim() ?? (partial ? undefined : ''),
    priority: priority ?? (partial ? undefined : 'P2'),
    owner: input.owner?.trim() ?? (partial ? undefined : ''),
    sort_order: sortOrder ?? (partial ? undefined : 0),
    scenario: input.scenario?.trim() ?? (partial ? undefined : ''),
    test_method: input.test_method?.trim() ?? (partial ? undefined : ''),
    expected_result: input.expected_result?.trim() ?? (partial ? undefined : ''),
    status: itemStatus ?? (partial ? undefined : '未測試'),
    tester: input.tester?.trim() ?? (partial ? undefined : ''),
    note: input.note?.trim() ?? (partial ? undefined : '')
  }
}

async function saveImage(image: unknown) {
  if (!(image instanceof File) || image.size === 0) {
    return null
  }

  if (!image.type.startsWith('image/')) {
    throw status(400, 'Only image uploads are allowed')
  }

  const extension = extname(image.name) || '.jpg'
  const safeName = `${crypto.randomUUID()}${extension.toLowerCase()}`
  const fullPath = `${uploadDir}/${safeName}`
  await Bun.write(fullPath, image)
  return `/uploads/${safeName}`
}

function collectImages(payload: ItemPayload) {
  const images = payload.images
  if (Array.isArray(images)) return images
  if (payload.image instanceof File) return [payload.image]
  return []
}

async function saveImages(payload: ItemPayload) {
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

function parseRetainedImageIds(value: string | undefined) {
  if (value === undefined) return null
  const normalized = value.trim()
  if (!normalized) return []

  if (normalized.startsWith('[')) {
    try {
      const ids = JSON.parse(normalized)
      if (Array.isArray(ids)) {
        return ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      }
    } catch {
      return []
    }
  }

  return normalized
    .split(',')
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
}

async function removeImagesNotIn(itemId: number, retainedIds: number[] | null) {
  if (retainedIds === null) return

  const existingImages = getImages(itemId)
  const retained = new Set(retainedIds)
  const removedImages = existingImages.filter((image) => !retained.has(image.id))
  if (removedImages.length === 0) return

  const deleteImage = db.query('DELETE FROM test_item_images WHERE id = ? AND item_id = ?')
  for (const image of removedImages) {
    deleteImage.run(image.id, itemId)
    await unlink(`${uploadDir}/${basename(image.path)}`).catch(() => undefined)
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
  .headers(corsHeaders())
  .onError(({ code }) => {
    if (code === 'VALIDATION') {
      return status(400, 'Invalid request')
    }
  })
  .options('/*', ({ set }) => {
    set.status = 204
  })
  .post(
    '/api/login',
    ({ body }) => {
      if (body.password !== password) {
        return status(401, 'Invalid password')
      }
      return { token: appToken }
    },
    {
      body: t.Object({
        password: t.String()
      })
    }
  )
  .group('/api/items', (items) =>
    items.guard({ beforeHandle: requireAuth }, (items) =>
      items
        .get(
          '/',
          ({ query }) => {
            const items =
              query.environment && environmentSet.has(query.environment)
                ? db
                    .query<TestItem, [string]>(
                      'SELECT * FROM test_items WHERE environment = ? ORDER BY sort_order ASC, id DESC'
                    )
                    .all(query.environment)
                : db.query<TestItem, []>('SELECT * FROM test_items ORDER BY environment ASC, sort_order ASC, id DESC').all()
            return items.map(mapItem)
          },
          {
            query: t.Object({
              environment: t.Optional(environmentSchema)
            })
          }
        )
        .post(
          '/',
          async ({ body }) => {
            const input = normalizeInput(body)
            const imagePaths = await saveImages(body)
            const testedAt = input.status === '未測試' ? null : new Date().toISOString()

            const result = db
              .query(
                `INSERT INTO test_items
                  (environment, module, feature, priority, owner, sort_order, title, scenario, test_method, expected_result, status, tester, note, image_path, tested_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
              )
              .run(
                input.environment!,
                input.module!,
                input.feature!,
                input.priority!,
                input.owner!,
                input.sort_order!,
                input.title!,
                input.scenario!,
                input.test_method!,
                input.expected_result!,
                input.status!,
                input.tester!,
                input.note!,
                imagePaths[0] ?? null,
                testedAt
              )

            const itemId = Number(result.lastInsertRowid)
            insertImages(itemId, imagePaths)
            const item = db.query<TestItem, [number]>('SELECT * FROM test_items WHERE id = ?').get(itemId)
            return mapItem(item!)
          },
          {
            body: createItemBodySchema
          }
        )
        .post(
          '/import',
          ({ body }) => {
            const insert = db.query(
              `INSERT INTO test_items
                (environment, module, feature, priority, owner, sort_order, title, scenario, test_method, expected_result, status, tester, note, tested_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
            )
            let imported = 0
            db.transaction(() => {
              for (const rawItem of body.items) {
                const input = normalizeInput(rawItem)
                const testedAt = input.status === '未測試' ? null : new Date().toISOString()
                insert.run(
                  input.environment!,
                  input.module!,
                  input.feature!,
                  input.priority!,
                  input.owner!,
                  input.sort_order!,
                  input.title!,
                  input.scenario!,
                  input.test_method!,
                  input.expected_result!,
                  input.status!,
                  input.tester!,
                  input.note!,
                  testedAt
                )
                imported += 1
              }
            })()

            return { imported }
          },
          {
            body: importItemsBodySchema
          }
        )
        .put(
          '/:id',
          async ({ params, body }) => {
            const existing = db.query<TestItem, [number]>('SELECT * FROM test_items WHERE id = ?').get(params.id)
            if (!existing) {
              return status(404, 'Not found')
            }

            const input = normalizeInput(body, true)
            const newImagePaths = await saveImages(body)
            await removeImagesNotIn(params.id, parseRetainedImageIds(body.retained_image_ids))
            if (newImagePaths.length > 0) {
              insertImages(params.id, newImagePaths)
            }
            const images = getImages(params.id)
            const firstImagePath = images[0]?.path ?? null
            const statusChanged = input.status !== undefined && input.status !== existing.status
            const testedAt = statusChanged ? (input.status === '未測試' ? null : new Date().toISOString()) : existing.tested_at

            db.query(
              `UPDATE test_items SET
                environment = ?,
                module = ?,
                feature = ?,
                priority = ?,
                owner = ?,
                sort_order = ?,
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
              input.module ?? existing.module,
              input.feature ?? existing.feature,
              input.priority ?? existing.priority,
              input.owner ?? existing.owner,
              input.sort_order ?? existing.sort_order,
              input.title ?? existing.title,
              input.scenario ?? existing.scenario,
              input.test_method ?? existing.test_method,
              input.expected_result ?? existing.expected_result,
              input.status ?? existing.status,
              input.tester ?? existing.tester,
              input.note ?? existing.note,
              firstImagePath,
              testedAt,
              params.id
            )

            const item = db.query<TestItem, [number]>('SELECT * FROM test_items WHERE id = ?').get(params.id)
            return mapItem(item!)
          },
          {
            params: itemIdParamsSchema,
            body: updateItemBodySchema
          }
        )
        .delete(
          '/:id',
          ({ params }) => {
            db.query('DELETE FROM test_items WHERE id = ?').run(params.id)
            return { ok: true }
          },
          {
            params: itemIdParamsSchema
          }
        )
    )
  )
  .group('/uploads', (uploads) =>
    uploads.guard({ beforeHandle: requireAuth }, (uploads) =>
      uploads.get(
        '/:file',
        ({ params }) => {
          const file = Bun.file(`${uploadDir}/${params.file}`)
          if (!file.size) {
            return status(404, 'Not found')
          }
          return file
        },
        {
          params: t.Object({
            file: t.String({ minLength: 1 })
          })
        }
      )
    )
  )
  .listen(port)

console.log(`API server running on http://localhost:${app.server?.port}`)
