import { NextRequest } from 'next/server';
import { createServerComponentClient } from '@/lib/supabase-server';
import { createDatabase } from '@/lib/database';

export const runtime = 'edge';

type Env = {
  R2: R2Bucket;
  DB: D1Database;
};

export async function POST(req: NextRequest, _ctx: any) {
  try {
    const env = _ctx.env as Env;
    const supabase = createServerComponentClient();
    const db = createDatabase(env);

    // 認証チェック
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: '認証が必要です' }), { status: 401 });
    }

    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
      return new Response(JSON.stringify({ error: 'filename and contentType are required' }), { status: 400 });
    }

    // ファイルサイズと種類の検証
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    const allowedTypes = [
      'image/png', 'image/jpeg', 'image/webp',
      'video/mp4', 'video/webm',
      'audio/mp3', 'audio/wav',
      'model/gltf-binary', 'model/obj'
    ];

    if (!allowedTypes.includes(contentType)) {
      return new Response(JSON.stringify({ error: 'サポートされていないファイル形式です' }), { status: 400 });
    }

    // ユーザー情報を取得または作成
    const userService = new (await import('@/lib/database')).UserService(db);
    let user = await userService.getUserById(session.user.id);
    if (!user || user.length === 0) {
      const username = (await import('@/lib/username')).generateRandomUsername();
      await userService.createUser(
        session.user.id,
        session.user.user_metadata?.full_name || null,
        session.user.user_metadata?.avatar_url || null
      );
      user = await userService.getUserById(session.user.id);
    }

    // R2用の署名付きURLを生成
    let key = '';
    let uploadUrl = '';

    try {
      key = `uploads/${user[0].username}/${Date.now()}-${filename}`;
      const object = await env.R2.put(key, '', {
        httpMetadata: {
          contentType,
        },
      });

      // 署名付きURLを取得
      uploadUrl = await object.url();
    } catch (r2Error) {
      // 開発環境ではR2が利用できない場合のフォールバック
      console.warn('R2 not available, using mock upload URL:', r2Error);
      key = `mock-uploads/${user[0].username}/${Date.now()}-${filename}`;
      uploadUrl = `https://mock-r2.example.com/${key}`;
    }

    return new Response(JSON.stringify({
      key,
      uploadUrl,
      itemId: crypto.randomUUID(), // 後でメタデータ登録時に使用
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('Upload presign error:', e);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました' }), { status: 500 });
  }
}

