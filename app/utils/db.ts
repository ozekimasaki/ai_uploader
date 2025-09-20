import { D1Database } from '@cloudflare/workers-types'
import type { User, Tag, Item, Report, CreateItemRequest, UpdateItemRequest, ItemsQuery, PaginationMeta } from '../types'

export class Database {
  constructor(private db: D1Database) {}

  // User operations
  async getUserById(id: string): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>()
    return result || null
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').bind(username).first<User>()
    return result || null
  }

  async createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const result = await this.db.prepare(`
      INSERT INTO users (id, username, display_name, avatar_url)
      VALUES (?, ?, ?, ?)
    `).bind(user.id, user.username, user.displayName, user.avatarUrl).run()

    if (!result.success) {
      throw new Error('Failed to create user')
    }

    return this.getUserById(user.id) as Promise<User>
  }

  // Tag operations
  async getTagById(id: string): Promise<Tag | null> {
    const result = await this.db.prepare('SELECT * FROM tags WHERE id = ?').bind(id).first<Tag>()
    return result || null
  }

  async getTagsByIds(ids: string[]): Promise<Tag[]> {
    if (ids.length === 0) return []

    const placeholders = ids.map(() => '?').join(',')
    const result = await this.db.prepare(`SELECT * FROM tags WHERE id IN (${placeholders})`).bind(...ids).all<Tag>()
    return result.results || []
  }

  async createTag(tag: Omit<Tag, 'createdAt'>): Promise<Tag> {
    const result = await this.db.prepare(`
      INSERT INTO tags (id, label)
      VALUES (?, ?)
    `).bind(tag.id, tag.label).run()

    if (!result.success) {
      throw new Error('Failed to create tag')
    }

    return this.getTagById(tag.id) as Promise<Tag>
  }

  // Item operations
  async getItemById(id: string, includeOwner = false, includeTags = false): Promise<Item | null> {
    const itemQuery = `
      SELECT i.* ${includeOwner ? ', u.username, u.display_name as displayName, u.avatar_url as avatarUrl' : ''}
      FROM items i
      ${includeOwner ? 'LEFT JOIN users u ON i.owner_user_id = u.id' : ''}
      WHERE i.id = ? AND i.deleted_at IS NULL
    `

    const item = await this.db.prepare(itemQuery).bind(id).first<Item & { username?: string; displayName?: string; avatarUrl?: string }>()

    if (!item) return null

    let tags: Tag[] = []
    if (includeTags) {
      const tagsResult = await this.db.prepare(`
        SELECT t.* FROM tags t
        JOIN item_tags it ON t.id = it.tag_id
        WHERE it.item_id = ?
      `).bind(id).all<Tag>()
      tags = tagsResult.results || []
    }

    const result: Item = {
      ...item,
      owner: includeOwner && item.username ? {
        id: item.ownerUserId,
        username: item.username,
        displayName: item.displayName,
        avatarUrl: item.avatarUrl,
        createdAt: item.createdAt
      } : undefined,
      tags
    }

    return result
  }

  async getItems(query: ItemsQuery = {}): Promise<{ items: Item[]; meta: PaginationMeta }> {
    const {
      page = 1,
      limit = 20,
      category,
      tag,
      q,
      sort = 'new',
      visibility = 'public'
    } = query

    const offset = (page - 1) * limit

    // Build WHERE clause
    const conditions: string[] = ['i.deleted_at IS NULL']
    const bindValues: any[] = []

    if (category) {
      conditions.push('i.category = ?')
      bindValues.push(category)
    }

    if (tag) {
      conditions.push('EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON it.tag_id = t.id WHERE it.item_id = i.id AND t.id = ?)')
      bindValues.push(tag)
    }

    if (q) {
      conditions.push('(i.title LIKE ? OR i.description LIKE ?)')
      bindValues.push(`%${q}%`, `%${q}%`)
    }

    if (visibility) {
      conditions.push('i.visibility = ?')
      bindValues.push(visibility)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Build ORDER BY clause
    let orderBy = 'i.published_at DESC'
    if (sort === 'popular') {
      orderBy = 'i.download_count DESC, i.published_at DESC'
    }

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM items i ${whereClause}`
    const countResult = await this.db.prepare(countQuery).bind(...bindValues).first<{ total: number }>()
    const total = countResult?.total || 0
    const totalPages = Math.ceil(total / limit)

    // Items query
    const itemsQuery = `
      SELECT i.*,
             u.username, u.display_name as displayName, u.avatar_url as avatarUrl
      FROM items i
      LEFT JOIN users u ON i.owner_user_id = u.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `

    const itemsResult = await this.db.prepare(itemsQuery).bind(...bindValues, limit, offset).all<Item & { username?: string; displayName?: string; avatarUrl?: string }>()

    const items: Item[] = (itemsResult.results || []).map(item => ({
      ...item,
      owner: item.username ? {
        id: item.ownerUserId,
        username: item.username,
        displayName: item.displayName,
        avatarUrl: item.avatarUrl,
        createdAt: item.createdAt
      } : undefined
    }))

    const meta: PaginationMeta = {
      page,
      limit,
      total,
      totalPages
    }

    return { items, meta }
  }

  async createItem(item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'viewCount' | 'downloadCount'>, tags: string[] = []): Promise<Item> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const result = await this.db.prepare(`
      INSERT INTO items (
        id, owner_user_id, title, category, description, prompt, visibility,
        file_key, original_filename, content_type, size_bytes, sha256, extension, thumbnail_key
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, item.ownerUserId, item.title, item.category, item.description, item.prompt, item.visibility,
      item.fileKey, item.originalFilename, item.contentType, item.sizeBytes, item.sha256, item.extension, item.thumbnailKey
    ).run()

    if (!result.success) {
      throw new Error('Failed to create item')
    }

    // Add tags
    if (tags.length > 0) {
      const tagInserts = tags.map(tagId => `('${id}', '${tagId}')`).join(',')
      await this.db.prepare(`
        INSERT OR IGNORE INTO item_tags (item_id, tag_id)
        VALUES ${tagInserts}
      `).run()
    }

    return this.getItemById(id, true, true) as Promise<Item>
  }

  async updateItem(id: string, updates: UpdateItemRequest): Promise<Item> {
    const fields: string[] = []
    const bindValues: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      bindValues.push(updates.title)
    }

    if (updates.category !== undefined) {
      fields.push('category = ?')
      bindValues.push(updates.category)
    }

    if (updates.description !== undefined) {
      fields.push('description = ?')
      bindValues.push(updates.description)
    }

    if (updates.prompt !== undefined) {
      fields.push('prompt = ?')
      bindValues.push(updates.prompt)
    }

    if (updates.visibility !== undefined) {
      fields.push('visibility = ?')
      bindValues.push(updates.visibility)
    }

    if (fields.length === 0) {
      return this.getItemById(id, true, true) as Promise<Item>
    }

    fields.push('updated_at = ?')
    bindValues.push(new Date().toISOString())

    bindValues.push(id)

    const result = await this.db.prepare(`
      UPDATE items
      SET ${fields.join(', ')}
      WHERE id = ?
    `).bind(...bindValues).run()

    if (!result.success) {
      throw new Error('Failed to update item')
    }

    return this.getItemById(id, true, true) as Promise<Item>
  }

  async deleteItem(id: string): Promise<void> {
    const result = await this.db.prepare(`
      UPDATE items
      SET deleted_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), id).run()

    if (!result.success) {
      throw new Error('Failed to delete item')
    }
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.db.prepare(`
      UPDATE items
      SET view_count = view_count + 1
      WHERE id = ?
    `).bind(id).run()
  }

  async incrementDownloadCount(id: string): Promise<void> {
    await this.db.prepare(`
      UPDATE items
      SET download_count = download_count + 1
      WHERE id = ?
    `).bind(id).run()
  }
}
