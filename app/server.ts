import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-pages'
import { createMiddleware } from 'hono/factory'
import { createApp } from 'honox/server'

const app = createApp({ init: false })

// 静的ファイル配信
app.use('*', serveStatic({ root: './dist' }))

// メインアプリケーション
app.basePath('/api')
app.route('/', await import('./routes/api/_index'))
app.route('/auth', await import('./routes/api/auth'))
app.route('/items', await import('./routes/api/items'))
app.route('/upload', await import('./routes/api/upload'))
app.route('/reports', await import('./routes/api/reports'))

export default app
