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
export const env = envSchema.parse(process.env || {})

// Helper functions
export const isProduction = env.ENVIRONMENT === 'production'
export const isDevelopment = env.ENVIRONMENT === 'development'

// Reserved usernames array (固定値)
const reservedUsernamesList = [
  'admin', 'root', 'system', 'support', 'help', 'contact',
  'login', 'logout', 'signin', 'signout', 'signup', 'register',
  'oauth', 'auth', 'api', 'graphql', 'rest', 'docs', 'assets',
  'static', 'cdn', 'cdn-cgi', 'ws', 'wss', 'items', 'item',
  'upload', 'downloads', 'search', 'tags', 'tag', 'users',
  'user', 'u', 'terms', 'privacy', 'policy', 'about',
  'status', 'health', 'metrics'
]

// Convert to lowercase manually (avoiding Array.map for Cloudflare Workers compatibility)
const reservedUsernamesLower: string[] = []
for (let i = 0; i < reservedUsernamesList.length; i++) {
  reservedUsernamesLower.push(reservedUsernamesList[i].toLowerCase())
}

export const reservedUsernames = reservedUsernamesLower

// Helper function to check if username is reserved
export const isReservedUsername = (username: string) => {
  return reservedUsernames.includes(username.toLowerCase())
}

// Allowed file types array (固定値)
export const allowedFileTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mp3',
  'audio/wav',
  'model/gltf-binary',
  'model/obj'
]

// Helper function to check if file type is allowed
export const isAllowedFileType = (fileType: string) => {
  return allowedFileTypes.includes(fileType)
}

// Rate limiting config (固定値)
export const rateLimitConfig = {
  downloadsPerMinute: 10,
  downloadsPerUserPerMinute: 5,
} as const
