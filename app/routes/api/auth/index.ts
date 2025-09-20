import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { env } from '../../utils/env'
import { authMiddleware } from '../../middleware/auth'
import type { AuthUser } from '../../types'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// Initialize Supabase client
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

// Get current user
app.get('/me', authMiddleware, async (c) => {
  const user = c.get('user')

  if (!user) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  return c.json({ user })
})

// Discord OAuth URL
app.get('/discord', async (c) => {
  const redirectTo = c.req.query('redirect_to') || '/'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: `${c.req.url.origin}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`,
    },
  })

  if (error) {
    return c.json({ error: 'OAuth URLの生成に失敗しました' }, 500)
  }

  return c.json({ url: data.url })
})

// OAuth callback (handled by Supabase)
app.get('/callback', async (c) => {
  const code = c.req.query('code')
  const redirectTo = c.req.query('redirect_to') || '/'

  if (!code) {
    return c.json({ error: '認証コードがありません' }, 400)
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return c.json({ error: '認証に失敗しました' }, 401)
  }

  // Redirect to the original page with token
  const url = new URL(redirectTo, c.req.url.origin)
  url.searchParams.set('access_token', data.access_token)
  url.searchParams.set('refresh_token', data.refresh_token)

  return c.redirect(url.toString())
})

// Logout
app.post('/logout', authMiddleware, async (c) => {
  const { error } = await supabase.auth.signOut()

  if (error) {
    return c.json({ error: 'ログアウトに失敗しました' }, 500)
  }

  return c.json({ message: 'ログアウトしました' })
})

export default app
