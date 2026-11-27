import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
export const supabaseAuthStorageKey = supabaseUrl ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token` : null;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        storageKey: supabaseAuthStorageKey,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        flowType: 'pkce'
      }
    })
  : null;
