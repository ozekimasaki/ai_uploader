import { Hono } from 'hono'

const app = new Hono()

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API status
app.get('/status', (c) => {
  return c.json({
    status: 'running',
    version: '1.0.0',
    environment: c.env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString()
  })
})

export default app
