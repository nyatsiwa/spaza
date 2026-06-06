import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// ─── Browser client (safe to import in Client Components) ────
// IMPORTANT: this file must NOT import anything from 'next/headers'.
// Server-only clients live in supabase-server.ts.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
