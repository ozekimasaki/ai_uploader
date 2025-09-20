import { Hono } from 'hono'
import { RateLimiter } from '../utils/rate-limiter'

const app = new Hono<{ Bindings: { RATE_LIMITER_DO: DurableObjectNamespace } }>()

app.post('/check-limit', async (c) => {
  const { key } = await c.req.json<{ key: string }>()

  const rateLimiterId = c.env.RATE_LIMITER_DO.idFromName(key)
  const rateLimiter = c.env.RATE_LIMITER_DO.get(rateLimiterId)

  const response = await rateLimiter.fetch(c.req.url, {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.body,
  })

  return response
})

// This is the Durable Object implementation
export default {
  async fetch(request: Request, env: { RATE_LIMITER_DO: DurableObjectNamespace }) {
    const url = new URL(request.url)

    if (url.pathname === '/check-limit') {
      const { key } = await request.json<{ key: string }>()

      const rateLimiterId = env.RATE_LIMITER_DO.idFromName(key)
      const rateLimiter = env.RATE_LIMITER_DO.get(rateLimiterId)

      const response = await rateLimiter.fetch('http://internal/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })

      return response
    }

    return new Response('Not found', { status: 404 })
  }
}

// Durable Object class
export class RateLimiterDO {
  state: DurableObjectState
  rateLimits: Map<string, { count: number; resetTime: number }>

  constructor(state: DurableObjectState) {
    this.state = state
    this.rateLimits = new Map()

    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('rateLimits') as Map<string, { count: number; resetTime: number }>
      if (stored) {
        this.rateLimits = stored
      }
    })
  }

  async fetch(request: Request) {
    const url = new URL(request.url)

    if (url.pathname === '/check') {
      const { key } = await request.json<{ key: string }>()

      const now = Date.now()
      const windowMs = 60 * 1000 // 1 minute
      const resetTime = Math.floor(now / windowMs) * windowMs + windowMs

      let entry = this.rateLimits.get(key)

      if (!entry || entry.resetTime < now) {
        entry = { count: 0, resetTime }
      }

      const allowed = entry.count < 10 // 10 requests per minute

      if (allowed) {
        entry.count++
        this.rateLimits.set(key, entry)
        await this.state.storage.put('rateLimits', this.rateLimits)
      }

      return new Response(JSON.stringify({
        allowed,
        resetIn: Math.max(0, resetTime - now)
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response('Not found', { status: 404 })
  }
}
