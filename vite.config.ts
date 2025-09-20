import { defineConfig } from 'vite'
import pages from '@hono/vite-cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-cloudflare-workers'

export default defineConfig(({ mode }) => {
  if (mode === 'client') {
    return {
      build: {
        rollupOptions: {
          input: {
            client: './app/client.ts'
          }
        }
      }
    }
  }

  return {
    plugins: [
      pages(),
      devServer({
        entry: 'app/server.ts'
      }),
      adapter()
    ]
  }
})
