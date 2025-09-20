-- D1 schema (SQLite dialect)
PRAGMA foreign_keys = ON;

-- users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- supabase user id
  username TEXT NOT NULL UNIQUE COLLATE NOCASE, -- 10 chars, [a-z0-9]
  displayName TEXT,
  avatarUrl TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- items
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY, -- uuid
  ownerUserId TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('IMAGE','VIDEO','MUSIC','VOICE','3D','OTHER')),
  description TEXT,
  prompt TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private')),
  publishedAt TEXT,
  fileKey TEXT NOT NULL,
  originalFilename TEXT,
  contentType TEXT,
  sizeBytes INTEGER,
  sha256 TEXT,
  extension TEXT,
  thumbnailKey TEXT,
  viewCount INTEGER NOT NULL DEFAULT 0,
  downloadCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT,
  deletedAt TEXT,
  FOREIGN KEY (ownerUserId) REFERENCES users(id)
);

-- tags
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY, -- slug (lowercase)
  label TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- item_tags (many-to-many)
CREATE TABLE IF NOT EXISTS item_tags (
  itemId TEXT NOT NULL,
  tagId TEXT NOT NULL,
  PRIMARY KEY (itemId, tagId),
  FOREIGN KEY (itemId) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE
);

-- reports
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  itemId TEXT NOT NULL,
  reporterUserId TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (itemId) REFERENCES items(id),
  FOREIGN KEY (reporterUserId) REFERENCES users(id)
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_items_visibility_publishedAt ON items(visibility, publishedAt DESC);
CREATE INDEX IF NOT EXISTS idx_items_downloadCount ON items(downloadCount DESC);
CREATE INDEX IF NOT EXISTS idx_items_category_publishedAt ON items(category, publishedAt DESC);
CREATE INDEX IF NOT EXISTS idx_item_tags_tagId_itemId ON item_tags(tagId, itemId);


