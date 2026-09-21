import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Supabase Auth のスタブ（Authorization ヘッダのトークンでユーザーを振り分ける）
const SUPABASE_STUB = `
const users = {
  'owner-token': { id: 'owner-user-1', email: 'owner@example.com', user_metadata: { name: 'Owner' } },
  'other-token': { id: 'other-user-2', email: 'other@example.com', user_metadata: { name: 'Other' } },
};
export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/auth/v1/user') {
      const m = /^Bearer\\s+(.+)$/.exec(req.headers.get('authorization') || '');
      const u = m && users[m[1]];
      if (u) return new Response(JSON.stringify(u), { headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
    }
    return new Response('stub: not found', { status: 404 });
  },
};
`;

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/worker.ts',
      miniflare: {
        compatibilityDate: '2025-09-20',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        r2Buckets: ['R2'],
        durableObjects: { RATE_LIMITER_DO: 'RateLimiter' },
        serviceBindings: {
          // テストでは静的アセットは 404 を返すスタブ
          ASSETS: async () => new Response('not found', { status: 404 }),
        },
        // 外向き fetch はすべて Supabase スタブが受ける
        outboundService: 'supabase-stub',
        bindings: {
          ENVIRONMENT: 'test',
          DEFAULT_DOWNLOAD_TTL_MINUTES: 15,
          MAX_DOWNLOAD_TTL_MINUTES: 120,
          RATE_LIMIT_DOWNLOAD_PER_MINUTE: 10,
          RATE_LIMIT_UPLOAD_PER_HOUR: 50,
          RATE_LIMIT_DOWNLOAD_PER_USER_PER_MINUTE: 5,
          RATE_LIMIT_GLOBAL_DOWNLOAD_PER_MINUTE: 100,
          MAX_FILE_SIZE_MB: 2048,
          ALLOWED_FILE_TYPES: 'png,jpg,jpeg,webp,mp4,webm,mp3,wav,glb,obj',
          SUPABASE_URL: 'https://supabase.test',
          SUPABASE_ANON_KEY: 'test-anon-key',
          R2_BUCKET: 'ai-uploader',
        },
        workers: [
          {
            name: 'supabase-stub',
            compatibilityDate: '2025-09-20',
            modules: true,
            script: SUPABASE_STUB,
          },
        ],
      },
    }),
  ],
});
