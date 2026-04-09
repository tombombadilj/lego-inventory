import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/roles'
import { fetchRetirementDate } from '@/lib/brickset'

/**
 * POST /api/admin/sets/refresh
 * Refreshes retirement data for all sets from Brickset.
 * Skips sets already marked retired or override_retired.
 * Admin only. Processes sets sequentially to avoid hammering the API.
 */
export async function POST() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: sets, error } = await supabase
    .from('sets')
    .select('set_number, retired, override_retired')
    .order('set_number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sets || sets.length === 0) return NextResponse.json({ total: 0, skipped_retired: 0, refreshed: 0, failed: [] })

  const total = sets.length
  let skipped_retired = 0
  let refreshed = 0
  const failed: string[] = []

  for (const set of sets) {
    if (set.retired || set.override_retired) {
      skipped_retired++
      continue
    }

    const retirementDate = await fetchRetirementDate(set.set_number)
    if (retirementDate !== null) {
      const dateStr = retirementDate.toISOString().slice(0, 10)
      const isRetired = retirementDate <= new Date()
      const { error } = await supabase
        .from('sets')
        .update({ retirement_date: dateStr, retired: isRetired })
        .eq('set_number', set.set_number)
      if (error) {
        failed.push(set.set_number)
      } else {
        refreshed++
      }
    }
  }

  return NextResponse.json({ total, skipped_retired, refreshed, failed })
}
