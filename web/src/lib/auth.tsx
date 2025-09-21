import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from './supabase';

type Session = {
  userId: string | null;
  accessToken: string | null;
};

const AuthContext = createContext<{
  session: Session;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}>({ session: { userId: null, accessToken: null }, signIn: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>({ userId: null, accessToken: null });

  useEffect(() => {
    (async () => {
      const supabase = await getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      if (data.session) setSession({ userId: data.session.user?.id ?? null, accessToken: data.session.access_token ?? null });
      supabase.auth.onAuthStateChange((_event, sess) => {
        setSession({ userId: sess?.user?.id ?? null, accessToken: sess?.access_token ?? null });
      });
    })();
  }, []);

  const value = useMemo(() => ({
    session,
    signIn: async () => {
      const supabase = await getSupabaseClient();
      const redirectTo = window.location.origin + '/';
      await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo } });
    },
    signOut: async () => {
      const supabase = await getSupabaseClient();
      await supabase.auth.signOut();
    },
  }), [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}


