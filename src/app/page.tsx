'use client'

import { useState } from 'react'
import { AuthButton } from '@/components/auth-button'
import { FileUpload } from '@/components/file-upload'
import { useSupabase } from '@/components/supabase-provider'
import { Upload, FileText, Users, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default function Home() {
  const { user } = useSupabase()
  const [showUpload, setShowUpload] = useState(false)

  const handleUpload = async (file: File, presignData: any) => {
    try {
      // メタデータ登録
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: presignData.itemId,
          title: file.name,
          category: getCategoryFromFileType(file.type),
          description: '',
          prompt: '',
          visibility: 'private',
          fileKey: presignData.key,
          originalFilename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          tags: []
        })
      })

      if (!response.ok) {
        throw new Error('メタデータの登録に失敗しました')
      }

      alert('アップロードが完了しました！')
      setShowUpload(false)
    } catch (error) {
      console.error('メタデータ登録エラー:', error)
      alert('アップロード後の処理に失敗しました')
    }
  }

  const getCategoryFromFileType = (contentType: string) => {
    if (contentType.startsWith('image/')) return 'IMAGE'
    if (contentType.startsWith('video/')) return 'VIDEO'
    if (contentType.startsWith('audio/')) return 'MUSIC'
    if (contentType.includes('gltf') || contentType.includes('obj')) return '3D'
    return 'OTHER'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Upload className="w-8 h-8 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">AI Uploader</h1>
            </div>
            <AuthButton />
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            クリエイティブ作品を共有しよう
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            画像、動画、音楽、3Dモデルなど、あなたの作品をアップロードして世界に発信できます
          </p>

          {user ? (
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                {showUpload ? 'アップロードをキャンセル' : '作品をアップロード'}
              </button>
              <Link
                href="/items"
                className="bg-white text-blue-600 px-6 py-3 rounded-lg border border-blue-600 hover:bg-blue-50 transition-colors font-medium"
              >
                作品一覧を見る
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-8 max-w-md mx-auto">
              <p className="text-gray-600 mb-4">
                ログインして作品をアップロードしましょう
              </p>
              <AuthButton />
            </div>
          )}
        </div>

        {/* アップロードエリア */}
        {user && showUpload && (
          <div className="mb-12">
            <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
              作品をアップロード
            </h3>
            <div className="max-w-2xl mx-auto">
              <FileUpload
                onUpload={handleUpload}
                maxSize={2 * 1024 * 1024 * 1024}
                acceptedTypes={[
                  'image/png', 'image/jpeg', 'image/webp',
                  'video/mp4', 'video/webm',
                  'audio/mp3', 'audio/wav',
                  'model/gltf-binary', 'model/obj'
                ]}
              />
            </div>
          </div>
        )}

        {/* 機能紹介 */}
        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <FileText className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              多様なファイル形式に対応
            </h3>
            <p className="text-gray-600">
              画像、動画、音楽、3Dモデルなど様々なクリエイティブ作品をアップロードできます
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <Users className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              作品を共有・公開
            </h3>
            <p className="text-gray-600">
              作品を公開設定で共有したり、プライベートで保存したりできます
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <TrendingUp className="w-12 h-12 text-purple-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              コミュニティ機能
            </h3>
            <p className="text-gray-600">
              他のクリエイターの作品を見て、タグやカテゴリで検索できます
            </p>
          </div>
        </div>

        {/* 作品一覧へのリンク */}
        {user && (
          <div className="text-center mt-12">
            <Link
              href="/items"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg"
            >
              作品一覧を見る
              <FileText className="w-5 h-5" />
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
