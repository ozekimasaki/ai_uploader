import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAuth } from '../../../middleware/auth'
import { Database } from '../../../utils/db'
import { ValidationError, NotFoundError } from '../../../middleware/error-handler'
import type { CreateItemRequest, UpdateItemRequest, ItemsQuery } from '../../../types'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// Get items list
app.get('/', async (c) => {
  const db = new Database(c.env.DB)

  const query: ItemsQuery = {
    page: parseInt(c.req.query('page') || '1'),
    limit: parseInt(c.req.query('limit') || '20'),
    category: c.req.query('category') as any,
    tag: c.req.query('tag'),
    q: c.req.query('q'),
    sort: (c.req.query('sort') as 'popular' | 'new') || 'new',
    visibility: (c.req.query('visibility') as 'public' | 'private') || 'public',
  }

  // Validate query parameters
  if (query.page < 1) query.page = 1
  if (query.limit < 1 || query.limit > 100) query.limit = 20

  try {
    const result = await db.getItems(query)
    return c.json(result)
  } catch (error) {
    console.error('Get items error:', error)
    throw new ValidationError('アイテム一覧の取得に失敗しました')
  }
})

// Create item
app.post('/', requireAuth, async (c) => {
  const db = new Database(c.env.DB)
  const user = c.get('user')

  if (!user) {
    throw new ValidationError('認証が必要です')
  }

  try {
    const body = await c.req.json<CreateItemRequest>()

    // Validate required fields
    if (!body.title || !body.category) {
      throw new ValidationError('タイトルとカテゴリーは必須です')
    }

    // TODO: Validate file upload completion
    // For now, assume file upload is handled separately

    const item = await db.createItem({
      ownerUserId: user.id,
      title: body.title,
      category: body.category,
      description: body.description,
      prompt: body.prompt,
      visibility: body.visibility || 'private',
      fileKey: '', // TODO: Get from upload completion
      originalFilename: '', // TODO: Get from upload
      contentType: '', // TODO: Get from upload
      sizeBytes: 0, // TODO: Get from upload
      sha256: '', // TODO: Calculate from uploaded file
      extension: '', // TODO: Extract from filename
      thumbnailKey: undefined,
    }, body.tags)

    return c.json({ item }, 201)
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error
    }
    console.error('Create item error:', error)
    throw new ValidationError('アイテムの作成に失敗しました')
  }
})

// Get item by ID
app.get('/:id', async (c) => {
  const db = new Database(c.env.DB)
  const id = c.req.param('id')

  try {
    const item = await db.getItemById(id, true, true)

    if (!item) {
      throw new NotFoundError('アイテムが見つかりません')
    }

    // Increment view count
    await db.incrementViewCount(id)

    return c.json({ item })
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error
    }
    console.error('Get item error:', error)
    throw new ValidationError('アイテムの取得に失敗しました')
  }
})

// Update item
app.put('/:id', requireAuth, async (c) => {
  const db = new Database(c.env.DB)
  const user = c.get('user')
  const id = c.req.param('id')

  if (!user) {
    throw new ValidationError('認証が必要です')
  }

  try {
    const body = await c.req.json<UpdateItemRequest>()

    // Check ownership
    const existingItem = await db.getItemById(id)
    if (!existingItem) {
      throw new NotFoundError('アイテムが見つかりません')
    }

    if (existingItem.ownerUserId !== user.id) {
      throw new ValidationError('このアイテムを編集する権限がありません')
    }

    const updatedItem = await db.updateItem(id, body)

    return c.json({ item: updatedItem })
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error
    }
    console.error('Update item error:', error)
    throw new ValidationError('アイテムの更新に失敗しました')
  }
})

// Delete item
app.delete('/:id', requireAuth, async (c) => {
  const db = new Database(c.env.DB)
  const user = c.get('user')
  const id = c.req.param('id')

  if (!user) {
    throw new ValidationError('認証が必要です')
  }

  try {
    // Check ownership
    const existingItem = await db.getItemById(id)
    if (!existingItem) {
      throw new NotFoundError('アイテムが見つかりません')
    }

    if (existingItem.ownerUserId !== user.id) {
      throw new ValidationError('このアイテムを削除する権限がありません')
    }

    await db.deleteItem(id)

    return c.json({ message: 'アイテムを削除しました' })
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error
    }
    console.error('Delete item error:', error)
    throw new ValidationError('アイテムの削除に失敗しました')
  }
})

// Publish/unpublish item
app.post('/:id/publish', requireAuth, async (c) => {
  const db = new Database(c.env.DB)
  const user = c.get('user')
  const id = c.req.param('id')

  if (!user) {
    throw new ValidationError('認証が必要です')
  }

  try {
    // Check ownership
    const existingItem = await db.getItemById(id)
    if (!existingItem) {
      throw new NotFoundError('アイテムが見つかりません')
    }

    if (existingItem.ownerUserId !== user.id) {
      throw new ValidationError('このアイテムを公開する権限がありません')
    }

    const newVisibility = existingItem.visibility === 'public' ? 'private' : 'public'
    const publishedAt = newVisibility === 'public' ? new Date().toISOString() : undefined

    const updatedItem = await db.updateItem(id, {
      visibility: newVisibility,
      // TODO: Set publishedAt if publishing
    })

    return c.json({ item: updatedItem })
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error
    }
    console.error('Publish item error:', error)
    throw new ValidationError('アイテムの公開設定に失敗しました')
  }
})

// Get download URL
app.post('/:id/download-url', requireAuth, async (c) => {
  const db = new Database(c.env.DB)
  const user = c.get('user')
  const id = c.req.param('id')

  if (!user) {
    throw new ValidationError('認証が必要です')
  }

  try {
    const item = await db.getItemById(id)
    if (!item) {
      throw new NotFoundError('アイテムが見つかりません')
    }

    if (item.visibility === 'private' && item.ownerUserId !== user.id) {
      throw new ValidationError('このアイテムをダウンロードする権限がありません')
    }

    // TODO: Generate presigned URL for R2
    const downloadUrl = `https://your-r2-bucket-url/${item.fileKey}`

    // Increment download count
    await db.incrementDownloadCount(id)

    return c.json({ downloadUrl })
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error
    }
    console.error('Get download URL error:', error)
    throw new ValidationError('ダウンロードURLの生成に失敗しました')
  }
})

export default app
