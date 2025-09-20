import type { LayoutProps } from 'honox/server'

export default function Layout({ children }: LayoutProps) {
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>AI Uploader</title>
        <meta name="description" content="AIコンテンツ共有プラットフォーム" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div id="root">
          {children}
        </div>
      </body>
    </html>
  )
}
