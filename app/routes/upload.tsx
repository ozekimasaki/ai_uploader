import type { PropsWithChildren } from 'react'

export default function UploadPage({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">コンテンツアップロード</h1>
            <a href="/" className="text-primary-600 hover:text-primary-700">
              ホームに戻る
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              ファイルをアップロード
            </h2>
            <p className="text-gray-600">
              画像、動画、音楽、3Dモデルなど、最大2GBまでのファイルをアップロードできます
            </p>
          </div>

          {/* Upload Area */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-primary-400 transition-colors duration-200">
            <div className="space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-medium text-gray-900">
                  ファイルをドラッグ&ドロップ
                </p>
                <p className="text-gray-500">
                  または{' '}
                  <label className="text-primary-600 hover:text-primary-700 cursor-pointer">
                    ファイルを選択
                    <input type="file" className="hidden" multiple />
                  </label>
                </p>
              </div>
              <p className="text-sm text-gray-400">
                PNG, JPG, WebP, MP4, WebM, MP3, WAV, GLB, OBJ 形式に対応
              </p>
            </div>
          </div>

          {/* Upload Form */}
          <div className="mt-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                  タイトル <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  required
                  className="input-field"
                  placeholder="作品のタイトルを入力"
                />
              </div>
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                  カテゴリー <span className="text-red-500">*</span>
                </label>
                <select
                  id="category"
                  name="category"
                  required
                  className="input-field"
                >
                  <option value="">選択してください</option>
                  <option value="IMAGE">画像</option>
                  <option value="VIDEO">動画</option>
                  <option value="MUSIC">音楽</option>
                  <option value="VOICE">音声</option>
                  <option value="3D">3Dモデル</option>
                  <option value="OTHER">その他</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                説明
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                className="input-field resize-none"
                placeholder="作品の説明を入力（任意）"
              />
            </div>

            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
                Prompt
              </label>
              <textarea
                id="prompt"
                name="prompt"
                rows={3}
                className="input-field resize-none"
                placeholder="AI生成に使用したプロンプト（任意）"
              />
            </div>

            <div>
              <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-2">
                タグ <span className="text-sm text-gray-500">（最大5つ）</span>
              </label>
              <input
                type="text"
                id="tags"
                name="tags"
                className="input-field"
                placeholder="カンマ区切りでタグを入力"
              />
              <p className="mt-1 text-sm text-gray-500">
                3〜20文字、半角英数字と日本語を使用可能
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="public"
                name="public"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="public" className="ml-2 block text-sm text-gray-700">
                公開する（チェックを外すと非公開）
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="thumbnail"
                name="thumbnail"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="thumbnail" className="ml-2 block text-sm text-gray-700">
                サムネイルをアップロードする
              </label>
            </div>
          </div>

          {/* Upload Button */}
          <div className="mt-8 flex justify-end">
            <button
              type="submit"
              className="btn-primary px-8 py-3"
              disabled
            >
              アップロード
            </button>
          </div>

          {/* Upload Progress */}
          <div className="mt-6 hidden">
            <div className="bg-gray-200 rounded-full h-2">
              <div className="bg-primary-600 h-2 rounded-full" style={{ width: '0%' }}></div>
            </div>
            <p className="text-sm text-gray-600 mt-2">アップロード中... 0%</p>
          </div>
        </div>

        {/* Upload Guidelines */}
        <div className="mt-8 card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            アップロードガイドライン
          </h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• 最大ファイルサイズ: 2GB</li>
            <li>• 対応形式: PNG, JPG, WebP, MP4, WebM, MP3, WAV, GLB, OBJ</li>
            <li>• アップロード前にウイルスチェックをおすすめします</li>
            <li>• 著作権侵害となるコンテンツのアップロードは禁止されています</li>
            <li>• 位置情報などの機密データが含まれている可能性があります</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
