import { createClient } from '@/lib/supabase/server'

// Roles are stored in app_metadata (server-writable only via service role key).
// Never use user_metadata for roles — users can self-modify user_metadata via
// the client SDK, which would allow privilege escalation to admin.
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  return (user.app_metadata?.role ?? 'member') === 'admin'
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
