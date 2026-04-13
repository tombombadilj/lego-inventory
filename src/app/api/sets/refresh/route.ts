import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { fetchRetirementDate } from '@/lib/brickset'

/**
 * POST /api/sets/refresh
 * Refreshes retirement data from Brickset for all sets owned by the authenticated user.
 * Skips sets already marked retired or override_retired.
 * Uses service role client for sets table reads/writes (RLS blocks regular user updates).
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get the user's set numbers via inventory_items (auth-scoped)
  const { data: inventoryItems, error: itemsError } = await supabase
    .from('inventory_items')
    .select('sets(set_number)')
    .eq('added_by', user.id)

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  const setNumbers = [
    ...new Set(
      (inventoryItems ?? [])
        .map((i: { sets: { set_number: string }[] }) => i.sets?.[0]?.set_number)
        .filter((n): n is string => Boolean(n))
    ),
  ]

  if (setNumbers.length === 0) {
    return NextResponse.json({ total: 0, skipped_retired: 0, refreshed: 0, failed: [] })
  }

  // Use service role for sets table (RLS restricts updates to service role)
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: sets, error: setsError } = await serviceSupabase
    .from('sets')
    .select('set_number, retired, override_retired')
    .in('set_number', setNumbers)
    .order('set_number')

  if (setsError) return NextResponse.json({ error: setsError.message }, { status: 500 })

  const total = sets!.length
  let skipped_retired = 0
  let refreshed = 0
  const failed: string[] = []

  for (const set of sets!) {
    if (set.retired || set.override_retired) {
      skipped_retired++
      continue
    }

    try {
      const retirementDate = await fetchRetirementDate(set.set_number)
      if (retirementDate !== null) {
        const dateStr = retirementDate.toISOString().slice(0, 10)
        const isRetired = retirementDate <= new Date()
        const { error } = await serviceSupabase
          .from('sets')
          .update({ retirement_date: dateStr, retired: isRetired })
          .eq('set_number', set.set_number)
        if (error) {
          failed.push(set.set_number)
        } else {
          refreshed++
        }
      }
    } catch {
      failed.push(set.set_number)
    }
  }

  return NextResponse.json({ total, skipped_retired, refreshed, failed })
}
