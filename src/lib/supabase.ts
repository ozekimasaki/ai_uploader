import { createClient } from '@supabase/supabase-js'

// 環境変数からSupabase設定を取得
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// クライアントサイド用のSupabaseクライアント
export function createClientComponentClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}

