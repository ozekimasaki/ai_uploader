'use client'

import { useSupabase } from './supabase-provider'
import { createClientComponentClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export function AuthButton() {
  const { user, loading } = useSupabase()
  const supabase = createClientComponentClient()

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${window.location.origin}/`
      }
    })
    if (error) {
      console.error('認証エラー:', error)
      alert(`認証エラー: ${error.message}`)
    }
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('ログアウトエラー:', error)
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-600">読み込み中...</div>
  }

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">
          {user.user_metadata?.full_name || user.email}
        </span>
        <button
          onClick={handleSignOut}
          className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          ログアウト
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleSignIn}
      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
    >
      Discordでログイン
    </button>
  )
}

