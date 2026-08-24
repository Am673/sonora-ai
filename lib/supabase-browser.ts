import { createClient } from '@supabase/supabase-js'

let supabase: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
    }

    if (!key) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured'
      )
    }

    supabase = createClient(url, key)
  }

  return supabase
}
