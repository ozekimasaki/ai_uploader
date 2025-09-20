import type { Item, Tag } from '../types'

interface ItemCardProps {
  item: Item
  showOwner?: boolean
}

export function ItemCard({ item, showOwner = true }: ItemCardProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="card p-4 hover:shadow-lg transition-shadow duration-200">
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-200 rounded-lg mb-4 overflow-hidden">
        {item.thumbnailKey ? (
          <img
            src={`/api/files/${item.thumbnailKey}`}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="space-y-2">
        <h3 className="font-semibold text-gray-900 line-clamp-2">
          <a href={`/items/${item.id}`} className="hover:text-primary-600 transition-colors">
            {item.title}
          </a>
        </h3>

        {/* Category and Date */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            item.category === 'IMAGE' ? 'bg-blue-100 text-blue-800' :
            item.category === 'VIDEO' ? 'bg-purple-100 text-purple-800' :
            item.category === 'MUSIC' ? 'bg-green-100 text-green-800' :
            item.category === 'VOICE' ? 'bg-yellow-100 text-yellow-800' :
            item.category === '3D' ? 'bg-pink-100 text-pink-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {item.category === 'IMAGE' ? '画像' :
             item.category === 'VIDEO' ? '動画' :
             item.category === 'MUSIC' ? '音楽' :
             item.category === 'VOICE' ? '音声' :
             item.category === '3D' ? '3Dモデル' : 'その他'}
          </span>
          <span>{formatDate(item.createdAt)}</span>
        </div>

        {/* Description */}
        {item.description && (
          <p className="text-sm text-gray-600 line-clamp-2">
            {item.description}
          </p>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag: Tag) => (
              <span key={tag.id} className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">
                #{tag.label}
              </span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-gray-500 text-xs">
                +{item.tags.length - 3} タグ
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
          <div className="flex items-center space-x-3">
            <span>👁️ {item.viewCount.toLocaleString()}</span>
            <span>⬇️ {item.downloadCount.toLocaleString()}</span>
          </div>
          <span>{formatFileSize(item.sizeBytes)}</span>
        </div>

        {/* Owner Info */}
        {showOwner && item.owner && (
          <div className="flex items-center space-x-2 pt-2">
            <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <a
              href={`/u/${item.owner.username}`}
              className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
            >
              {item.owner.displayName || item.owner.username}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
