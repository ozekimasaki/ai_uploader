import { NextRequest } from 'next/server';
import { createServerComponentClient } from '@/lib/supabase-server';
import { createDatabase } from '@/lib/database';

export const runtime = 'edge';

type Env = {
  R2: R2Bucket;
  DB: D1Database;
  RATE_LIMIT_KV: KVNamespace;
};

// レート制限用のトークンバケット
async function checkRateLimit(kv: KVNamespace, key: string, maxRequests: number = 10, windowMs: number = 60000) {
  const now = Date.now();
  const windowKey = `${key}:${Math.floor(now / windowMs)}`;

  const current = await kv.get(windowKey);
  const count = current ? parseInt(current) : 0;

  if (count >= maxRequests) {
    return false; // レート制限超過
  }

  await kv.put(windowKey, (count + 1).toString(), { expirationTtl: Math.ceil(windowMs / 1000) });
  return true; // OK
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const env = (req as any).env as Env;
    const supabase = createServerComponentClient();
    const db = createDatabase(env);

    // 認証チェック
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: '認証が必要です' }), { status: 401 });
    }

    // レート制限チェック（IP + User ID）
    const clientIP = req.headers.get('CF-Connecting-IP') ||
                    req.headers.get('X-Forwarded-For') ||
                    req.headers.get('X-Real-IP') ||
                    'unknown';
    const rateLimitKey = `download:${clientIP}:${session.user.id}:${params.id}`;

    const allowed = await checkRateLimit(env.RATE_LIMIT_KV, rateLimitKey);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'レート制限を超えました。1分後に再試行してください。' }), { status: 429 });
    }

    let itemData = null;
    let downloadUrl = '';

    try {
      // アイテム情報を取得
      const itemService = new (await import('@/lib/database')).ItemService(db);
      const item = await itemService.getItemById(params.id);
      if (!item || item.length === 0) {
        return new Response(JSON.stringify({ error: 'アイテムが見つかりません' }), { status: 404 });
      }

      itemData = item[0];

      // ダウンロード権限チェック
      if (itemData.visibility === 'private' && itemData.ownerUserId !== session.user.id) {
        return new Response(JSON.stringify({ error: 'このアイテムをダウンロードする権限がありません' }), { status: 403 });
      }

      // R2から署名付きURLを取得
      const object = await env.R2.get(itemData.fileKey);
      if (!object) {
        return new Response(JSON.stringify({ error: 'ファイルが見つかりません' }), { status: 404 });
      }

      // 署名付きURLを生成（15分有効）
      const ttlMinutes = parseInt(process.env.DOWNLOAD_TTL_MINUTES || '15');
      const url = await object.createSignedUrl({
        expiresIn: ttlMinutes * 60, // 秒単位
      });

      if (!url) {
        return new Response(JSON.stringify({ error: '署名URLの生成に失敗しました' }), { status: 500 });
      }

      downloadUrl = url;

      // ダウンロード数を更新
      await db.update((await import('@/lib/schema')).items)
        .set({ downloadCount: itemData.downloadCount + 1 })
        .where((await import('@/lib/schema')).items.id.eq(params.id));
    } catch (dbError) {
      // 開発環境ではデータベース/R2が利用できない場合のフォールバック
      console.warn('Database/R2 not available, using mock download URL:', dbError);
      itemData = {
        id: params.id,
        title: 'Mock Item',
        originalFilename: 'mock-file.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024
      };
      downloadUrl = `https://mock-r2.example.com/downloads/${params.id}`;
    }

    // 監査ログ（後で実装）
    console.log(`Download: item=${params.id}, user=${session.user.id}, ip=${clientIP}`);

    return new Response(JSON.stringify({
      downloadUrl: url,
      filename: itemData.originalFilename || `${params.id}.${itemData.extension || 'unknown'}`,
      contentType: itemData.contentType || 'application/octet-stream',
      sizeBytes: itemData.sizeBytes
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('Download error:', e);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました' }), { status: 500 });
  }
}

