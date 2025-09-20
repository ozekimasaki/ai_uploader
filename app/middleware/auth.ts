import { createMiddleware } from 'hono/factory'
import { createClient } from '@supabase/supabase-js'
import { env } from '../utils/env'
import type { AuthUser } from '../types'

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser | null
  }
}

// Initialize Supabase client
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// Authentication middleware
export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    c.set('user', null)
    return next()
  }

  const token = authHeader.replace('Bearer ', '')

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      c.set('user', null)
      return next()
    }

    // Get or create user in our database
    const db = c.get('DB') as D1Database
    let dbUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first()

    if (!dbUser) {
      // Create user if not exists
      const username = user.user_metadata?.username || generateUsername()
      const displayName = user.user_metadata?.full_name || user.user_metadata?.username

      await db.prepare(`
        INSERT INTO users (id, username, display_name, avatar_url)
        VALUES (?, ?, ?, ?)
      `).bind(user.id, username, displayName, user.user_metadata?.avatar_url).run()

      dbUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first()
    }

    c.set('user', {
      id: dbUser.id,
      username: dbUser.username,
      displayName: dbUser.display_name,
      avatarUrl: dbUser.avatar_url,
    })

    return next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    c.set('user', null)
    return next()
  }
})

// Require authentication middleware
export const requireAuth = createMiddleware(async (c, next) => {
  const user = c.get('user')

  if (!user) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  return next()
})

// Admin only middleware (placeholder for future admin features)
export const requireAdmin = createMiddleware(async (c, next) => {
  // TODO: Implement admin role checking
  const user = c.get('user')

  if (!user) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  return next()
})

// Helper function to generate a random username
function generateUsername(): string {
  const adjectives = ['cool', 'smart', 'bright', 'swift', 'clever', 'bold', 'quick', 'sharp']
  const nouns = ['user', 'creator', 'maker', 'builder', 'artist', 'dev', 'coder', 'ninja']

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const number = Math.floor(Math.random() * 1000).toString().padStart(3, '0')

  return `${adjective}${noun}${number}`.substring(0, 10)
}
