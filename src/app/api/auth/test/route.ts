import { NextRequest } from 'next/server';
import { createServerComponentClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerComponentClient();

    // セッション情報を取得
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      return new Response(JSON.stringify({
        error: 'Session error',
        details: sessionError.message
      }), { status: 500 });
    }

    return new Response(JSON.stringify({
      authenticated: !!session,
      user: session?.user ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.user_metadata?.full_name,
        avatar: session.user.user_metadata?.avatar_url
      } : null,
      supabaseConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('Auth test error:', e);
    return new Response(JSON.stringify({
      error: 'Server error',
      details: e instanceof Error ? e.message : 'Unknown error'
    }), { status: 500 });
  }
}
