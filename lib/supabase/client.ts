import { createBrowserClient } from '@supabase/ssr';
import { getEnv } from '@/lib/env';

export function createSupabaseBrowserClient() {
  const env = getEnv();

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
