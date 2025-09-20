import type { PropsWithChildren } from 'react'

export default function HomePage({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              AIコンテンツを
              <span className="text-primary-600">共有</span>
              しよう
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              画像、動画、音楽、3Dモデルなど、あなたのAI生成コンテンツを安全にアップロード・共有できるプラットフォームです。
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/upload"
                className="btn-primary text-lg px-8 py-3"
              >
                アップロードする
              </a>
              <a
                href="/items"
                className="btn-secondary text-lg px-8 py-3"
              >
                コンテンツを見る
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              機能紹介
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              クリエイターのための充実した機能を提供します
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="card p-6">
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                簡単アップロード
              </h3>
              <p className="text-gray-600">
                ドラッグ&ドロップで簡単にファイルをアップロード。2GBまでの大容量ファイルにも対応。
              </p>
            </div>

            {/* Feature 2 */}
            <div className="card p-6">
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                安全な共有
              </h3>
              <p className="text-gray-600">
                公開・非公開の設定が可能。ダウンロードには認証が必要で、レート制限も適用されます。
              </p>
            </div>

            {/* Feature 3 */}
            <div className="card p-6">
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                高速配信
              </h3>
              <p className="text-gray-600">
                Cloudflareのグローバルネットワークで、世界中どこからでも高速にコンテンツを配信。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Supported Formats Section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              対応フォーマット
            </h2>
            <p className="text-lg text-gray-600">
              さまざまなAI生成コンテンツに対応しています
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {[
              { name: '画像', formats: ['PNG', 'JPG', 'WebP'] },
              { name: '動画', formats: ['MP4', 'WebM'] },
              { name: '音楽', formats: ['MP3', 'WAV'] },
              { name: '音声', formats: ['MP3', 'WAV'] },
              { name: '3Dモデル', formats: ['GLB', 'OBJ'] },
            ].map((category) => (
              <div key={category.name} className="card p-4 text-center">
                <h3 className="font-semibold text-gray-900 mb-2">{category.name}</h3>
                <div className="space-y-1">
                  {category.formats.map((format) => (
                    <div key={format} className="text-sm text-gray-600 bg-gray-100 rounded px-2 py-1">
                      {format}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16 bg-primary-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            今すぐ始めましょう
          </h2>
          <p className="text-xl text-primary-100 mb-8">
            アカウントを作成して、あなたのAIコンテンツを共有しましょう
          </p>
          <a
            href="/upload"
            className="inline-block bg-white text-primary-600 font-semibold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors duration-200"
          >
            無料で始める
          </a>
        </div>
      </div>
    </div>
  )
}
