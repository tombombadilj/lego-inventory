import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseLegoCsv } from '@/lib/csv'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const confirm = formData.get('confirm') === 'true'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const { valid, invalid } = parseLegoCsv(text)

  // Preview mode — return parsed rows without saving
  if (!confirm) {
    return NextResponse.json({ valid, invalid, total: valid.length + invalid.length })
  }

  // Confirm mode — look up set IDs and bulk insert
  const results: { set_number: string; status: string; reason?: string }[] = []

  for (const row of valid) {
    const { data: set } = await supabase
      .from('sets')
      .select('id')
      .eq('set_number', row.set_number)
      .single()

    if (!set) {
      results.push({ set_number: row.set_number, status: 'skipped', reason: 'Set not found — fetch via /api/lego-status first' })
      continue
    }

    const { error } = await supabase
      .from('inventory_items')
      .insert({
        set_id: set.id,
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
