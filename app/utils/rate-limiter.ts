import { DurableObject } from 'cloudflare:workers'
import { rateLimitConfig } from './env'

interface RateLimitEntry {
  count: number
  resetTime: number
}

export class RateLimiter {
  state: DurableObjectState
  rateLimits: Map<string, RateLimitEntry>

  constructor(state: DurableObjectState) {
    this.state = state
    this.rateLimits = new Map()

    // Load existing rate limits from storage
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('rateLimits') as Map<string, RateLimitEntry>
      if (stored) {
        this.rateLimits = stored
      }
    })
  }

  async checkLimit(key: string): Promise<{ allowed: boolean; resetIn: number }> {
    const now = Date.now()
    const windowMs = 60 * 1000 // 1 minute
    const resetTime = Math.floor(now / windowMs) * windowMs + windowMs

    let entry = this.rateLimits.get(key)

    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime }
    }

    const isAllowed = entry.count < rateLimitConfig.downloadsPerMinute

    if (isAllowed) {
      entry.count++
      this.rateLimits.set(key, entry)

      // Save to storage
      await this.state.storage.put('rateLimits', this.rateLimits)
    }

    return {
      allowed: isAllowed,
      resetIn: Math.max(0, resetTime - now)
    }
  }

  async cleanup() {
    const now = Date.now()
    const windowMs = 60 * 1000

    for (const [key, entry] of this.rateLimits.entries()) {
      if (entry.resetTime < now - windowMs) {
        this.rateLimits.delete(key)
      }
    }

    if (this.rateLimits.size > 0) {
      await this.state.storage.put('rateLimits', this.rateLimits)
    }
  }
}

// Helper function to generate rate limit keys
export function generateRateLimitKey(userId: string, ip: string, itemId?: string): string {
  const parts = [userId, ip]
  if (itemId) {
    parts.push(itemId)
  }
  return parts.join(':')
}
