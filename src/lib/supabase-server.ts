import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// 環境変数からSupabase設定を取得
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// サーバーサイド用のSupabaseクライアント
export function createServerComponentClient() {
  const cookieStore = cookies()

  return createClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options })
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: '', ...options })
      },
    },
  })
}

// 認証セッションを取得
export async function getSession() {
  const supabase = createServerComponentClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  return { session, error }
}

// 認証チェック
export async function requireAuth() {
  const { session, error } = await getSession()
  if (error || !session) {
    throw new Error('認証が必要です')
  }
  return session
}

// 認証ユーザー情報を取得
export async function getCurrentUser() {
  try {
    const { session } = await getSession()
    return session?.user ?? null
  } catch {
    return null
  }
}
