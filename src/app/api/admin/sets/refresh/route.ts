import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/roles'
import { fetchSetFromRebrickable } from '@/lib/rebrickable'

/**
 * POST /api/admin/sets/refresh
 * Re-fetches all sets in the database from Rebrickable to backfill
 * retirement status and other stale fields.
 * Admin only. Processes sets sequentially to avoid hammering the API.
 */
export async function POST() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: sets, error } = await serviceSupabase
    .from('sets')
    .select('set_number')
    .order('set_number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sets || sets.length === 0) return NextResponse.json({ refreshed: 0, failed: 0 })

  let refreshed = 0
  const failed: string[] = []

  for (const { set_number } of sets) {
    const setData = await fetchSetFromRebrickable(set_number)
    if (!setData) {
      failed.push(set_number)
      continue
    }

    const { error: upsertError } = await serviceSupabase
      .from('sets')
      .update({ ...setData, last_fetched_at: new Date().toISOString() })
      .eq('set_number', set_number)

    if (upsertError) {
      failed.push(set_number)
    } else {
      refreshed++
    }
  }

  return NextResponse.json({
    total: sets.length,
    refreshed,
    failed: failed.length,
    failed_sets: failed,
  })
}
