import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/alerts/count
 * Returns the count of unread alerts for the current user (without marking them seen).
 * Used by the AlertsBell component to show the badge.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })

  const { count, error } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('seen', false)

  if (error) return NextResponse.json({ count: 0 })
  return NextResponse.json({ count: count ?? 0 })
}
