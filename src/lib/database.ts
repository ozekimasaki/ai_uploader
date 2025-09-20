import { drizzle } from 'drizzle-orm/d1'
import { createClient } from '@supabase/supabase-js'
import * as schema from './schema'

// D1データベースの型定義
export type Database = typeof schema

// Drizzle ORMインスタンスを作成
export function createDatabase(env?: { DB: D1Database }) {
  // 開発環境ではD1が利用できないので、モックデータベースを使用
  if (!env?.DB) {
    console.warn('D1 database not available, using mock database')
    // 実際の開発ではSQLiteやインメモリデータベースを使用
    throw new Error('Database not configured for local development')
  }
  return drizzle(env.DB, { schema })
}

// ユーザー関連のデータベース操作
export class UserService {
  constructor(private db: ReturnType<typeof createDatabase>) {}

  async createUser(supabaseUserId: string, displayName?: string, avatarUrl?: string) {
    const username = generateUsername()
    await this.db.insert(schema.users).values({
      id: supabaseUserId,
      username,
      displayName: displayName || null,
      avatarUrl: avatarUrl || null,
    })
    return username
  }

  async getUserById(id: string) {
    return await this.db.select().from(schema.users).where(schema.users.id.eq(id)).limit(1)
  }

  async getUserByUsername(username: string) {
    return await this.db.select().from(schema.users).where(schema.users.username.eq(username)).limit(1)
  }
}

// アイテム関連のデータベース操作
export class ItemService {
  constructor(private db: ReturnType<typeof createDatabase>) {}

  async createItem(data: {
    id: string
    ownerUserId: string
    title: string
    category: 'IMAGE' | 'VIDEO' | 'MUSIC' | 'VOICE' | '3D' | 'OTHER'
    description?: string
    prompt?: string
    visibility: 'public' | 'private'
    fileKey: string
    originalFilename?: string
    contentType?: string
    sizeBytes?: number
    sha256?: string
    extension?: string
    thumbnailKey?: string
  }) {
    return await this.db.insert(schema.items).values({
      ...data,
      publishedAt: data.visibility === 'public' ? new Date().toISOString() : null,
    })
  }

  async getItems(options: {
    page?: number
    limit?: number
    category?: string
    tag?: string
    search?: string
    sort?: 'new' | 'popular'
    visibility?: 'public' | 'private'
  } = {}) {
    const { page = 1, limit = 20, sort = 'new' } = options
    const offset = (page - 1) * limit

    let query = this.db.select().from(schema.items)

    // 公開アイテムのみ取得（非公開は所有者のみ）
    if (options.visibility === 'public') {
      query = query.where(schema.items.visibility.eq('public'))
    }

    // カテゴリーフィルタ
    if (options.category) {
      query = query.where(schema.items.category.eq(options.category))
    }

    // タグフィルタ
    if (options.tag) {
      query = query.innerJoin(schema.itemTags, schema.items.id.eq(schema.itemTags.itemId))
        .where(schema.itemTags.tagId.eq(options.tag))
    }

    // 検索
    if (options.search) {
      query = query.where(
        schema.items.title.like(`%${options.search}%`)
          .or(schema.items.description.like(`%${options.search}%`))
      )
    }

    // 並び替え
    if (sort === 'popular') {
      query = query.orderBy(schema.items.downloadCount.desc())
    } else {
      query = query.orderBy(schema.items.createdAt.desc())
    }

    return await query.limit(limit).offset(offset)
  }

  async getItemById(id: string) {
    return await this.db.select().from(schema.items).where(schema.items.id.eq(id)).limit(1)
  }

  async getUserItems(username: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit
    return await this.db.select()
      .from(schema.items)
      .innerJoin(schema.users, schema.items.ownerUserId.eq(schema.users.id))
      .where(schema.users.username.eq(username))
      .orderBy(schema.items.createdAt.desc())
      .limit(limit)
      .offset(offset)
  }
}

// タグ関連のデータベース操作
export class TagService {
  constructor(private db: ReturnType<typeof createDatabase>) {}

  async getAllTags() {
    return await this.db.select().from(schema.tags).orderBy(schema.tags.label.asc())
  }

  async createTag(id: string, label: string) {
    return await this.db.insert(schema.tags).values({
      id: id.toLowerCase(),
      label,
    })
  }

  async getOrCreateTag(label: string) {
    const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const existing = await this.db.select().from(schema.tags).where(schema.tags.id.eq(slug)).limit(1)
    if (existing.length > 0) {
      return existing[0]
    }
    await this.db.insert(schema.tags).values({
      id: slug,
      label,
    })
    return { id: slug, label }
  }
}

// ヘルパー関数
function generateUsername() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

