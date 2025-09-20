import { createMiddleware } from 'hono/factory'
import type { MiddlewareHandler } from 'hono'

interface LogEntry {
  timestamp: string
  method: string
  path: string
  status: number
  duration: number
  userId?: string
  userAgent?: string
  ip: string
  error?: string
}

export const loggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now()
  const timestamp = new Date().toISOString()
  const method = c.req.method
  const path = c.req.path
  const userAgent = c.req.header('User-Agent')
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  const user = c.get('user')

  let logEntry: Partial<LogEntry> = {
    timestamp,
    method,
    path,
    userAgent,
    ip,
    userId: user?.id,
  }

  try {
    await next()

    const duration = Date.now() - start
    const status = c.res.status

    logEntry = {
      ...logEntry,
      status,
      duration,
    }

    // Log successful requests
    console.log(JSON.stringify(logEntry))

    // Log errors
    if (status >= 400) {
      logEntry.error = c.res.statusText
      console.error(JSON.stringify(logEntry))
    }
  } catch (error) {
    const duration = Date.now() - start
    const status = c.res?.status || 500

    logEntry = {
      ...logEntry,
      status,
      duration,
      error: error instanceof Error ? error.message : String(error),
    }

    console.error(JSON.stringify(logEntry))
    throw error
  }
})
