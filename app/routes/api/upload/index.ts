import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { env, allowedFileTypes } from '../../../utils/env'
import { requireAuth } from '../../../middleware/auth'
import { ValidationError } from '../../../middleware/error-handler'
import type { PresignedUploadRequest, PresignedUploadResponse } from '../../../types'

const app = new Hono<{ Bindings: { R2: R2Bucket } }>()

// Presigned upload URL schema
const presignedUploadSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().min(1).max(env.MAX_FILE_SIZE),
})

// Generate presigned upload URL
app.post('/presign', requireAuth, zValidator('json', presignedUploadSchema), async (c) => {
  const { filename, contentType, size } = c.req.valid('json')

  // Validate file type
  if (!allowedFileTypes.has(contentType)) {
    throw new ValidationError(`サポートされていないファイル形式です: ${contentType}`)
  }

  // Validate file size
  if (size > env.MAX_FILE_SIZE) {
    throw new ValidationError(`ファイルサイズが上限（${env.MAX_FILE_SIZE} bytes）を超えています`)
  }

  // Generate unique key
  const extension = filename.split('.').pop()?.toLowerCase() || ''
  const timestamp = Date.now()
  const random = crypto.getRandomValues(new Uint8Array(8))
  const key = `uploads/${timestamp}-${Array.from(random, b => b.toString(16).padStart(2, '0')).join('')}.${extension}`

  try {
    // For small files, use single PUT
    if (size <= 5 * 1024 * 1024) { // 5MB
      const uploadUrl = await c.env.R2.presign({
        method: 'PUT',
        key,
        contentType,
        expiresIn: 900, // 15 minutes
      })

      const response: PresignedUploadResponse = {
        uploadUrl: uploadUrl.toString(),
        key,
      }

      return c.json(response)
    } else {
      // For large files, use multipart upload
      const multipartUpload = await c.env.R2.createMultipartUpload(key, {
        httpMetadata: {
          contentType,
        },
      })

      const response: PresignedUploadResponse = {
        uploadUrl: '', // Will be set for each part
        key,
        multipart: {
          uploadId: multipartUpload.uploadId,
          parts: [],
        },
      }

      return c.json(response)
    }
  } catch (error) {
    console.error('Presigned URL generation error:', error)
    throw new ValidationError('アップロードURLの生成に失敗しました')
  }
})

// Complete multipart upload (placeholder for future implementation)
app.post('/complete-multipart', requireAuth, async (c) => {
  // TODO: Implement multipart upload completion
  return c.json({ message: 'マルチパートアップロード完了機能は開発中です' })
})

// Abort multipart upload (placeholder for future implementation)
app.post('/abort-multipart', requireAuth, async (c) => {
  // TODO: Implement multipart upload abortion
  return c.json({ message: 'マルチパートアップロード中止機能は開発中です' })
})

export default app
