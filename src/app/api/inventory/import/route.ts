import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { parseLegoCsv } from '@/lib/csv'
import { fetchSetFromRebrickable } from '@/lib/rebrickable'

function serviceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const confirm = formData.get('confirm') === 'true'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    return NextResponse.json({ error: 'Only CSV files are accepted.' }, { status: 400 })
  }
  if (file.size > 1 * 1024 * 1024) {
    return NextResponse.json({ error: 'CSV too large. Maximum size is 1 MB.' }, { status: 400 })
  }

  const text = await file.text()
  const { valid, invalid } = parseLegoCsv(text)

  // Preview mode — return parsed rows without saving
  if (!confirm) {
    return NextResponse.json({ valid, invalid, total: valid.length + invalid.length })
  }

  // Confirm mode
  const svc = serviceSupabase()

  // Step 1: find which set numbers are already cached
  const setNumbers = [...new Set(valid.map(r => r.set_number))]
  const { data: cachedSets } = await supabase
    .from('sets')
    .select('id, set_number')
    .in('set_number', setNumbers)

  const cachedMap = new Map((cachedSets ?? []).map(s => [s.set_number, s.id]))
  const missing = setNumbers.filter(n => !cachedMap.has(n))

  // Step 2: fetch all missing sets from Rebrickable IN PARALLEL
  if (missing.length > 0) {
    const fetched = await Promise.allSettled(
      missing.map(async (n) => {
        const setData = await fetchSetFromRebrickable(n)
        if (!setData) return null
        const { data } = await svc
          .from('sets')
          .upsert({ ...setData, last_fetched_at: new Date().toISOString() }, { onConflict: 'set_number' })
          .select('id, set_number')
          .single()
        return data
      })
    )

    fetched.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        cachedMap.set(result.value.set_number, result.value.id)
      }
    })
  }

  // Step 3: insert inventory items
  const results: { set_number: string; status: string; reason?: string }[] = []

  for (const row of valid) {
    const setId = cachedMap.get(row.set_number)
    if (!setId) {
      results.push({ set_number: row.set_number, status: 'skipped', reason: 'Set not found on Rebrickable — check the set number' })
      continue
    }

    const { error } = await supabase
      .from('inventory_items')
      .insert({
        set_id: setId,
        added_by: user.id,
        purchased_from: row.purchased_from,
        purchase_price_usd: row.purchase_price,
        purchase_date: row.purchase_date,
        condition: row.condition,
        notes: row.notes,
      })

    results.push({
      set_number: row.set_number,
      status: error ? 'error' : 'saved',
      reason: error?.message,
    })
  }

  return NextResponse.json({ results, invalid })
}
