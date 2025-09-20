'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, File, X } from 'lucide-react'

interface FileUploadProps {
  onUpload: (file: File, presignData: any) => Promise<void>
  maxSize?: number
  acceptedTypes?: string[]
}

export function FileUpload({ onUpload, maxSize = 2 * 1024 * 1024 * 1024, acceptedTypes }: FileUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setSelectedFile(file)
    setUploading(true)
    setUploadProgress(0)

    try {
      // 署名URLを取得
      const response = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream'
        })
      })

      if (!response.ok) {
        throw new Error('署名URLの取得に失敗しました')
      }

      const { key, uploadUrl, itemId } = await response.json()

      // ファイルをアップロード
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        }
      })

      if (!uploadResponse.ok) {
        throw new Error('ファイルのアップロードに失敗しました')
      }

      setUploadProgress(100)
      await onUpload(file, { key, itemId })

    } catch (error) {
      console.error('アップロードエラー:', error)
      alert('アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedTypes ? { [acceptedTypes[0].split('/')[0] + '/*']: acceptedTypes } : undefined,
    maxSize,
    multiple: false
  })

  const removeFile = () => {
    setSelectedFile(null)
    setUploadProgress(0)
  }

  if (selectedFile) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <File className="w-8 h-8 text-blue-600" />
            <div>
              <p className="font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-sm text-gray-600">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          <button
            onClick={removeFile}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {uploading && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-1">アップロード中...</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        isDragActive
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <input {...getInputProps()} />
      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <p className="text-lg font-medium text-gray-900 mb-2">
        {isDragActive ? 'ファイルをここにドロップ' : 'ファイルをドラッグ&ドロップ'}
      </p>
      <p className="text-gray-600 mb-4">またはクリックしてファイルを選択</p>
      <p className="text-sm text-gray-500">
        対応形式: 画像、動画、音楽、3Dモデル (最大 {maxSize / 1024 / 1024 / 1024}GB)
      </p>
    </div>
  )
}

