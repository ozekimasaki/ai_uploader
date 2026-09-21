export interface Env {
  ENVIRONMENT: string;
  DEFAULT_DOWNLOAD_TTL_MINUTES: number | string;
  MAX_DOWNLOAD_TTL_MINUTES: number | string;
  RATE_LIMIT_DOWNLOAD_PER_MINUTE: number | string;
  RATE_LIMIT_UPLOAD_PER_HOUR: number | string;
  RATE_LIMIT_DOWNLOAD_PER_USER_PER_MINUTE: number | string;
  RATE_LIMIT_GLOBAL_DOWNLOAD_PER_MINUTE: number | string;
  MAX_FILE_SIZE_MB: number | string;
  ALLOWED_FILE_TYPES: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  DISCORD_WEBHOOK_URL?: string;
  R2_BUCKET: string;
  R2: R2Bucket;
  DB: D1Database;
  ASSETS: Fetcher;
  RATE_LIMITER_DO: DurableObjectNamespace;
}

/** Supabase Auth /auth/v1/user のレスポンスで利用する最小限の型 */
export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
    user_name?: string;
    avatar_url?: string;
  };
}

export type Category = 'IMAGE' | 'VIDEO' | 'MUSIC' | 'VOICE' | '3D' | 'OTHER';

export const CATEGORIES: readonly Category[] = ['IMAGE', 'VIDEO', 'MUSIC', 'VOICE', '3D', 'OTHER'];

export const CATEGORY_LABELS: Record<Category, string> = {
  IMAGE: '画像',
  VIDEO: '動画',
  MUSIC: '音楽',
  VOICE: '音声',
  '3D': '3Dモデル',
  OTHER: 'その他',
};

/** items テーブルの行（スキーマ差異を吸収して正規化した形） */
export interface ItemRow {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  prompt: string;
  category: string;
  visibility: string;
  originalFilename: string;
  sizeBytes: number;
  fileKey: string;
  thumbnailKey: string;
  contentType: string;
  extension: string;
  sha256: string;
  downloadCount: number;
  viewCount: number;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
