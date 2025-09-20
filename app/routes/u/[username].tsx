import type { PropsWithChildren } from 'react'

interface UserPageProps extends PropsWithChildren {
  params: {
    username: string
  }
}

export default function UserPage({ params }: UserPageProps) {
  const { username } = params

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">ユーザープロフィール</h1>
            <a href="/" className="text-primary-600 hover:text-primary-700">
              ホームに戻る
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* User Profile */}
        <div className="card p-8 mb-8">
          <div className="flex items-start space-x-6">
            <div className="w-20 h-20 bg-gray-300 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {username}
              </h2>
              <p className="text-gray-600 mb-4">
                AIコンテンツクリエイター
              </p>
              <div className="flex items-center space-x-6 text-sm text-gray-500">
                <span>登録日: 2024年1月1日</span>
                <span>作品数: 25</span>
                <span>総ダウンロード数: 1,234</span>
              </div>
            </div>
          </div>
        </div>

        {/* User's Items */}
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-6">
            作品一覧
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="card p-4">
                <div className="aspect-video bg-gray-200 rounded-lg mb-4"></div>
                <h4 className="font-semibold text-gray-900 mb-2">
                  作品タイトル {index + 1}
                </h4>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>2024年1月1日</span>
                  <span>100 DL</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">
                    #タグ1
                  </span>
                  <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">
                    #タグ2
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-8 flex justify-center">
            <div className="flex items-center space-x-2">
              <button className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                前のページ
              </button>
              <button className="px-3 py-2 text-sm font-medium text-white bg-primary-600 border border-primary-600 rounded-md">
                1
              </button>
              <button className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                2
              </button>
              <button className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                3
              </button>
              <button className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                次のページ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
