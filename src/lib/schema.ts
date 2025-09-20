import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// usersテーブル
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('displayName'),
  avatarUrl: text('avatarUrl'),
  createdAt: text('createdAt').notNull(),
})

// itemsテーブル
export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  ownerUserId: text('ownerUserId').notNull(),
  title: text('title').notNull(),
  category: text('category', {
    enum: ['IMAGE', 'VIDEO', 'MUSIC', 'VOICE', '3D', 'OTHER']
  }).notNull(),
  description: text('description'),
  prompt: text('prompt'),
  visibility: text('visibility', {
    enum: ['public', 'private']
  }).notNull(),
  publishedAt: text('publishedAt'),
  fileKey: text('fileKey').notNull(),
  originalFilename: text('originalFilename'),
  contentType: text('contentType'),
  sizeBytes: integer('sizeBytes'),
  sha256: text('sha256'),
  extension: text('extension'),
  thumbnailKey: text('thumbnailKey'),
  viewCount: integer('viewCount').notNull().default(0),
  downloadCount: integer('downloadCount').notNull().default(0),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
  deletedAt: text('deletedAt'),
})

// tagsテーブル
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  createdAt: text('createdAt').notNull(),
})

// item_tagsテーブル（多対多）
export const itemTags = sqliteTable('item_tags', {
  itemId: text('itemId').notNull(),
  tagId: text('tagId').notNull(),
})

// reportsテーブル
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  itemId: text('itemId').notNull(),
  reporterUserId: text('reporterUserId'),
  reason: text('reason'),
  status: text('status', {
    enum: ['open', 'resolved']
  }).notNull().default('open'),
  createdAt: text('createdAt').notNull(),
})

