'use client'

import { useState, useEffect } from 'react'
import { AuthButton } from '@/components/auth-button'
import { useSupabase } from '@/components/supabase-provider'
import { Upload, FileText, Eye, Download, User, Calendar } from 'lucide-react'
import Link from 'next/link'

interface Item {
  id: string
  title: string
  category: string
  description?: string
  visibility: 'public' | 'private'
  viewCount: number
  downloadCount: number
  createdAt: string
  owner?: {
    id: string
    username: string
    displayName?: string
  }
}

export default function ItemsPage() {
  const { user } = useSupabase()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const fetchItems = async (pageNum: number = 1) => {
    try {
      const response = await fetch(`/api/items?page=${pageNum}`)
      if (!response.ok) throw new Error('Failed to fetch items')

      const data = await response.json()
      if (pageNum === 1) {
        setItems(data.items)
      } else {
        setItems(prev => [...prev, ...data.items])
      }
      setHasMore(data.hasMore)
      setPage(pageNum)
    } catch (error) {
      console.error('Fetch items error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchItems(page + 1)
    }
  }

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      IMAGE: '画像',
      VIDEO: '動画',
      MUSIC: '音楽',
      VOICE: '音声',
      '3D': '3Dモデル',
      OTHER: 'その他'
    }
    return labels[category] || category
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Link href="/" className="flex items-center gap-2">
                <Upload className="w-8 h-8 text-blue-600" />
                <h1 className="text-xl font-bold text-gray-900">AI Uploader</h1>
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/upload"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                アップロード
              </Link>
              <AuthButton />
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">作品一覧</h2>
          <p className="text-gray-600">
            クリエイターたちの作品を閲覧・ダウンロードできます
          </p>
        </div>

        {/* アイテム一覧 */}
        {loading && items.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">作品がありません</h3>
            <p className="text-gray-600 mb-4">
              最初の作品をアップロードしてみましょう
            </p>
            {user && (
              <Link
                href="/"
                className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                作品をアップロード
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                        {item.title}
                      </h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        item.category === 'IMAGE' ? 'bg-blue-100 text-blue-800' :
                        item.category === 'VIDEO' ? 'bg-green-100 text-green-800' :
                        item.category === 'MUSIC' ? 'bg-purple-100 text-purple-800' :
                        item.category === '3D' ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {getCategoryLabel(item.category)}
                      </span>
                    </div>

                    {item.description && (
                      <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                        {item.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          <span>{item.viewCount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Download className="w-4 h-4" />
                          <span>{item.downloadCount}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(item.createdAt).toLocaleDateString('ja-JP')}</span>
                      </div>
                    </div>

                    {item.owner && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <Link
                            href={`/u/${item.owner.username}`}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {item.owner.displayName || item.owner.username}
                          </Link>
                        </div>

                        {user && (
                          <button
                            onClick={() => {
                              // ダウンロード処理
                              fetch(`/api/items/${item.id}/download`)
                                .then(res => res.json())
                                .then(data => {
                                  if (data.downloadUrl) {
                                    window.open(data.downloadUrl, '_blank')
                                  }
                                })
                                .catch(err => console.error('Download error:', err))
                            }}
                            className="bg-blue-600 text-white px-4 py-2 text-sm rounded-md hover:bg-blue-700 transition-colors"
                          >
                            ダウンロード
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* もっと見るボタン */}
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {loading ? '読み込み中...' : 'もっと見る'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

