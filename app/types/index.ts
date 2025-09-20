export interface User {
  id: string
  username: string
  displayName?: string
  avatarUrl?: string
  createdAt: string
}

export interface Tag {
  id: string
  label: string
  createdAt: string
}

export interface Item {
  id: string
  ownerUserId: string
  title: string
  category: ItemCategory
  description?: string
  prompt?: string
  visibility: ItemVisibility
  publishedAt?: string
  fileKey: string
  originalFilename: string
  contentType: string
  sizeBytes: number
  sha256: string
  extension: string
  thumbnailKey?: string
  viewCount: number
  downloadCount: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
  owner?: User
  tags?: Tag[]
}

export interface Report {
  id: string
  itemId: string
  reporterUserId?: string
  reason: string
  status: ReportStatus
  createdAt: string
  resolvedAt?: string
}

export type ItemCategory = 'IMAGE' | 'VIDEO' | 'MUSIC' | 'VOICE' | '3D' | 'OTHER'

export type ItemVisibility = 'public' | 'private'

export type ReportStatus = 'open' | 'resolved'

export interface CreateItemRequest {
  title: string
  category: ItemCategory
  description?: string
  prompt?: string
  tags?: string[]
  visibility?: ItemVisibility
}

export interface UpdateItemRequest {
  title?: string
  category?: ItemCategory
  description?: string
  prompt?: string
  tags?: string[]
  visibility?: ItemVisibility
}

export interface ItemsQuery {
  page?: number
  limit?: number
  category?: ItemCategory
  tag?: string
  q?: string
  sort?: 'popular' | 'new'
  visibility?: ItemVisibility
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ItemsResponse {
  items: Item[]
  meta: PaginationMeta
}

export interface AuthUser {
  id: string
  username: string
  displayName?: string
  avatarUrl?: string
}

export interface RateLimitConfig {
  downloadsPerMinute: number
  downloadsPerUserPerMinute: number
}

export interface DownloadUrlRequest {
  ttl?: number // seconds, default 15 minutes, max 120 minutes
}

export interface PresignedUploadRequest {
  filename: string
  contentType: string
  size: number
}

export interface PresignedUploadResponse {
  uploadUrl: string
  key: string
  multipart?: {
    uploadId: string
    parts: Array<{
      partNumber: number
      uploadUrl: string
    }>
  }
}
