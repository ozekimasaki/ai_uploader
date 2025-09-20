import { Hono } from 'hono'

const app = new Hono()

// Simple health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default app
