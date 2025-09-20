import { z } from 'zod'

// Environment variables schema
const envSchema = z.object({
  // Supabase Auth
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),

  // Environment
  ENVIRONMENT: z.string().default('development'),
})

// Parse and validate environment variables
export const env = envSchema.parse(process.env)

// Helper functions
export const isProduction = env.ENVIRONMENT === 'production'
export const isDevelopment = env.ENVIRONMENT === 'development'

// Reserved usernames array (固定値)
export const reservedUsernames = new Set([
  'admin', 'root', 'system', 'support', 'help', 'contact',
  'login', 'logout', 'signin', 'signout', 'signup', 'register',
  'oauth', 'auth', 'api', 'graphql', 'rest', 'docs', 'assets',
  'static', 'cdn', 'cdn-cgi', 'ws', 'wss', 'items', 'item',
  'upload', 'downloads', 'search', 'tags', 'tag', 'users',
  'user', 'u', 'terms', 'privacy', 'policy', 'about',
  'status', 'health', 'metrics'
].map(username => username.toLowerCase()))

// Allowed file types array (固定値)
export const allowedFileTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mp3',
  'audio/wav',
  'model/gltf-binary',
  'model/obj'
])

// Rate limiting config (固定値)
export const rateLimitConfig = {
  downloadsPerMinute: 10,
  downloadsPerUserPerMinute: 5,
} as const
