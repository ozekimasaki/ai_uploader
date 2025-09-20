import { useState } from 'react'

interface UploadFormProps {
  onSubmit: (data: FormData) => Promise<void>
  onCancel?: () => void
}

export function UploadForm({ onSubmit, onCancel }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    const validFiles = droppedFiles.filter(file => {
      const allowedTypes = [
        'image/png', 'image/jpeg', 'image/webp',
        'video/mp4', 'video/webm',
        'audio/mp3', 'audio/wav',
        'model/gltf-binary', 'model/obj'
      ]
      const maxSize = 2 * 1024 * 1024 * 1024 // 2GB
      return allowedTypes.includes(file.type) && file.size <= maxSize
    })

    setFiles(validFiles)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const validFiles = selectedFiles.filter(file => {
      const allowedTypes = [
        'image/png', 'image/jpeg', 'image/webp',
        'video/mp4', 'video/webm',
        'audio/mp3', 'audio/wav',
        'model/gltf-binary', 'model/obj'
      ]
      const maxSize = 2 * 1024 * 1024 * 1024 // 2GB
      return allowedTypes.includes(file.type) && file.size <= maxSize
    })

    setFiles(validFiles)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (files.length === 0) return

    setUploading(true)
    setProgress(0)

    try {
      const formData = new FormData(e.currentTarget)

      // Add files to form data
      files.forEach((file, index) => {
        formData.append(`file_${index}`, file)
      })

      await onSubmit(formData)

      // Reset form
      setFiles([])
      e.currentTarget.reset()
    } catch (error) {
      console.error('Upload error:', error)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* File Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-input"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mp3,audio/wav,model/gltf-binary,model/obj"
        />

        <div className="space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          </div>

          {files.length > 0 ? (
            <div>
              <p className="text-lg font-medium text-gray-900">
                {files.length} 個のファイルが選択されました
              </p>
              <div className="mt-4 space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <span className="text-sm text-gray-700 truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-lg font-medium text-gray-900">
                ファイルをドラッグ&ドロップ
              </p>
              <p className="text-gray-500">
                または{' '}
                <label htmlFor="file-input" className="text-primary-600 hover:text-primary-700 cursor-pointer">
                  ファイルを選択
                </label>
              </p>
            </div>
          )}

          <p className="text-sm text-gray-400">
            PNG, JPG, WebP, MP4, WebM, MP3, WAV, GLB, OBJ 形式に対応（最大2GB）
          </p>
        </div>
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-900">アップロード中...</span>
            <span className="text-sm text-blue-700">{progress}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Form Fields */}
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

      {/* Action Buttons */}
      <div className="flex justify-end space-x-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary"
            disabled={uploading}
          >
            キャンセル
          </button>
        )}
        <button
          type="submit"
          className="btn-primary"
          disabled={files.length === 0 || uploading}
        >
          {uploading ? 'アップロード中...' : 'アップロード'}
        </button>
      </div>
    </form>
  )
}
