import { createMiddleware } from 'hono/factory'
import { RateLimiter, generateRateLimitKey } from '../utils/rate-limiter'
import { RateLimitError } from './error-handler'

export const downloadRateLimitMiddleware = createMiddleware(async (c, next) => {
  const user = c.get('user')
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'

  if (!user) {
    throw new RateLimitError('ダウンロードにはログインが必要です')
  }

  const pathParts = c.req.path.split('/')
  const itemId = pathParts[pathParts.length - 1]

  const rateLimitKey = generateRateLimitKey(user.id, ip, itemId)
  const rateLimiterId = c.env.RATE_LIMITER_DO.idFromName(rateLimitKey)
  const rateLimiter = c.env.RATE_LIMITER_DO.get(rateLimiterId)

  try {
    const response = await rateLimiter.fetch('http://internal/check-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: rateLimitKey }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new RateLimitError(error.message)
    }

    const { allowed, resetIn } = await response.json()

    if (!allowed) {
      c.header('X-RateLimit-Reset', resetIn.toString())
      throw new RateLimitError('ダウンロードレート制限を超えました')
    }

    return next()
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error
    }
    throw new RateLimitError('レート制限チェックでエラーが発生しました')
  }
})
