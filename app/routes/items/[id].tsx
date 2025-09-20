import type { PageProps } from 'honox/server'

interface ItemPageProps extends PageProps {
  params: {
    id: string
  }
}

export default function ItemPage({ params }: ItemPageProps) {
  const { id } = params

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">コンテンツ詳細</h1>
            <div className="flex items-center space-x-4">
              <a href="/items" className="btn-secondary">
                一覧に戻る
              </a>
              <a href="/" className="text-primary-600 hover:text-primary-700">
                ホーム
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Content Display */}
            <div className="card p-6">
              <div className="aspect-video bg-gray-200 rounded-lg flex items-center justify-center mb-6">
                <div className="text-center">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-500">プレビュー表示領域</p>
                </div>
              </div>

              {/* Content Info */}
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    タイトルがここに表示されます
                  </h2>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span className="bg-primary-100 text-primary-800 px-2 py-1 rounded">
                      カテゴリー
                    </span>
                    <span>2024年1月1日</span>
                    <span>100回の閲覧</span>
                    <span>50回のダウンロード</span>
                  </div>
                </div>

                <div className="prose max-w-none">
                  <p className="text-gray-700">
                    このコンテンツの説明がここに表示されます。AI生成のプロセスや使用したプロンプト、
                    制作の背景など、詳細な情報が記載されます。
                  </p>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                    #タグ1
                  </span>
                  <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                    #タグ2
                  </span>
                  <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                    #タグ3
                  </span>
                </div>

                {/* Prompt */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">使用したPrompt</h4>
                  <p className="text-gray-700 text-sm">
                    この作品の生成に使用したAIプロンプトがここに表示されます。
                    プロンプトを公開することで、他のクリエイターの参考になります。
                  </p>
                </div>
              </div>
            </div>

            {/* Download Section */}
            <div className="card p-6">
              <div className="text-center">
                <button className="btn-primary text-lg px-8 py-3 mb-4">
                  ダウンロード
                </button>
                <p className="text-sm text-gray-500">
                  ダウンロードにはログインが必要です
                </p>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Author Info */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">作成者</h3>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">ユーザー名</p>
                  <p className="text-sm text-gray-500">10作品</p>
                </div>
              </div>
              <a href="/u/username" className="text-primary-600 hover:text-primary-700 text-sm">
                プロフィールを見る →
              </a>
            </div>

            {/* Related Items */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">関連作品</h3>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                    <div className="w-12 h-12 bg-gray-200 rounded"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        関連作品 {index + 1}
                      </p>
                      <p className="text-xs text-gray-500">2024年1月1日</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Report */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">このコンテンツを報告</h3>
              <p className="text-sm text-gray-600 mb-4">
                不適切なコンテンツを見つけた場合は、報告をお願いします。
              </p>
              <button className="btn-secondary w-full">
                報告する
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
