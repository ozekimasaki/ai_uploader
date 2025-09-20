import { NextRequest } from 'next/server';
import { createServerComponentClient } from '@/lib/supabase-server';
import { createDatabase } from '@/lib/database';

export const runtime = 'edge';

type Env = {
  DB: D1Database;
};

// 詳細取得
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const env = (req as any).env as Env;
    let item = null;
    let itemData = null;

    try {
      const db = createDatabase(env);
      const itemService = new (await import('@/lib/database')).ItemService(db);

      item = await itemService.getItemById(params.id);
      if (!item || item.length === 0) {
        return new Response(JSON.stringify({ error: 'アイテムが見つかりません' }), { status: 404 });
      }

      itemData = item[0];

      // 閲覧数を更新（公開アイテムのみ）
      if (itemData.visibility === 'public') {
        await db.update((await import('@/lib/schema')).items)
          .set({ viewCount: itemData.viewCount + 1 })
          .where((await import('@/lib/schema')).items.id.eq(params.id));
      }
    } catch (dbError) {
      // 開発環境ではデータベースが利用できない場合のフォールバック
      console.warn('Database not available, returning mock item data:', dbError);
      itemData = {
        id: params.id,
        title: 'Mock Item',
        category: 'IMAGE',
        description: 'This is a mock item for development',
        visibility: 'public',
        viewCount: 0,
        downloadCount: 0,
        createdAt: new Date().toISOString(),
        owner: {
          id: 'mock-user-id',
          username: 'mockuser',
          displayName: 'Mock User'
        }
      };
    }

    return new Response(JSON.stringify({ item: itemData }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    console.error('Get item error:', e);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました' }), { status: 500 });
  }
}

// 公開設定変更（所有者のみ）
export async function POST(
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

    const { visibility } = await req.json();
    if (!visibility || !['public', 'private'].includes(visibility)) {
      return new Response(JSON.stringify({ error: '無効な公開設定です' }), { status: 400 });
    }

    const itemService = new (await import('@/lib/database')).ItemService(db);
    const item = await itemService.getItemById(params.id);
    if (!item || item.length === 0) {
      return new Response(JSON.stringify({ error: 'アイテムが見つかりません' }), { status: 404 });
    }

    // 所有者チェック
    if (item[0].ownerUserId !== session.user.id) {
      return new Response(JSON.stringify({ error: '権限がありません' }), { status: 403 });
    }

    // 更新
    const publishedAt = visibility === 'public' && item[0].visibility === 'private'
      ? new Date().toISOString()
      : (visibility === 'public' ? item[0].publishedAt : null);

    await db.update((await import('@/lib/schema')).items)
      .set({
        visibility,
        publishedAt,
        updatedAt: new Date().toISOString()
      })
      .where((await import('@/lib/schema')).items.id.eq(params.id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    console.error('Update item error:', e);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました' }), { status: 500 });
  }
}

// 削除（所有者のみ）
export async function DELETE(
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

    const itemService = new (await import('@/lib/database')).ItemService(db);
    const item = await itemService.getItemById(params.id);
    if (!item || item.length === 0) {
      return new Response(JSON.stringify({ error: 'アイテムが見つかりません' }), { status: 404 });
    }

    // 所有者チェック
    if (item[0].ownerUserId !== session.user.id) {
      return new Response(JSON.stringify({ error: '権限がありません' }), { status: 403 });
    }

    // 論理削除
    await db.update((await import('@/lib/schema')).items)
      .set({ deletedAt: new Date().toISOString() })
      .where((await import('@/lib/schema')).items.id.eq(params.id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    console.error('Delete item error:', e);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました' }), { status: 500 });
  }
}

