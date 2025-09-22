PRAGMA foreign_keys=OFF;
DROP TABLE IF EXISTS item_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  displayName TEXT,
  avatarUrl TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  ownerUserId TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  visibility TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  original_filename TEXT,
  size_bytes INTEGER,
  contentType TEXT,
  extension TEXT,
  file_key TEXT NOT NULL,
  thumbnail_key TEXT,
  published_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  createdAt TEXT,
  updatedAt TEXT,
  downloadCount INTEGER NOT NULL DEFAULT 0,
  viewCount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS item_tags (
  itemId TEXT NOT NULL,
  tagId TEXT NOT NULL,
  UNIQUE(itemId, tagId)
);

CREATE INDEX IF NOT EXISTS idx_items_visibility_publishedAt ON items (visibility, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_downloadCount ON items (downloadCount DESC);
CREATE INDEX IF NOT EXISTS idx_items_category_publishedAt ON items (category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag_item ON item_tags (tagId, itemId);

INSERT OR IGNORE INTO users (id, username, displayName) VALUES ('anonymous','anonymous','Anonymous');

PRAGMA foreign_keys=ON;
