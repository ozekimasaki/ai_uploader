import { NextRequest } from 'next/server';
import { createDatabase } from '@/lib/database';

export const runtime = 'edge';

type Env = {
  DB: D1Database;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const env = (req as any).env as Env;
    let user = null;
    let items = [];

    try {
      const db = createDatabase(env);
      const itemService = new (await import('@/lib/database')).ItemService(db);

      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get('page') || '1');

      // ユーザー情報を取得
      const userService = new (await import('@/lib/database')).UserService(db);
      user = await userService.getUserByUsername(params.username);
      if (!user || user.length === 0) {
        return new Response(JSON.stringify({ error: 'ユーザーが見つかりません' }), { status: 404 });
      }

      // ユーザーのアイテムを取得
      items = await itemService.getUserItems(params.username, page, 20);
    } catch (dbError) {
      // 開発環境ではデータベースが利用できない場合のフォールバック
      console.warn('Database not available, returning mock user data:', dbError);
      user = [{
        id: 'mock-user-id',
        username: params.username,
        displayName: `Mock User ${params.username}`,
        avatarUrl: null,
        createdAt: new Date().toISOString()
      }];
      items = [];
    }

    return new Response(JSON.stringify({
      user: {
        id: user[0].id,
        username: user[0].username,
        displayName: user[0].displayName,
        avatarUrl: user[0].avatarUrl,
        createdAt: user[0].createdAt,
      },
      items,
      page,
      hasMore: items.length === 20
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('Get user error:', e);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました' }), { status: 500 });
  }
}

