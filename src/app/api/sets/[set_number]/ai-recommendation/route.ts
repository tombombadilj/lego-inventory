import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { generateAiRecommendation } from '@/lib/gemini'
import { getRetirementStatus } from '@/lib/recommendations'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ set_number: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { set_number } = await params

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get set metadata (need set_id first for price snapshot lookup)
  const { data: set, error: setError } = await serviceSupabase
    .from('sets')
    .select('id, name, theme, retirement_date, override_retirement_date, override_retired, retiring_soon_override')
    .eq('set_number', set_number)
    .single()

  if (setError || !set) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get user's unsold items for this set (scoped to user via auth client)
  const { data: items, error: itemsError } = await supabase
    .from('inventory_items')
    .select('purchase_price_usd, condition')
    .eq('added_by', user.id)
    .eq('set_id', set.id)
    .eq('sold', false)

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
  if (!items || items.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Derive avgCost and best condition
  const costsWithValues = items.filter(i => i.purchase_price_usd != null)
  const avgCost = costsWithValues.length > 0
    ? costsWithValues.reduce((sum, i) => sum + (i.purchase_price_usd ?? 0), 0) / costsWithValues.length
    : null

  const CONDITION_PRIORITY: Record<string, number> = { sealed: 3, open: 2, complete: 1 }
  const condition = items.reduce((best: string, i) => {
    return (CONDITION_PRIORITY[i.condition] ?? 0) > (CONDITION_PRIORITY[best] ?? 0) ? i.condition : best
  }, items[0].condition)

  // Get latest price snapshot
  const { data: snapshot } = await serviceSupabase
    .from('price_snapshots')
    .select('avg_price_usd')
    .eq('set_id', set.id)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const retirementStatus = getRetirementStatus({
    retirement_date: set.retirement_date,
    override_retired: set.override_retired,
    retiring_soon_override: set.retiring_soon_override,
  })
  const effectiveRetirementDate = set.override_retirement_date ?? set.retirement_date

  try {
    const result = await generateAiRecommendation({
      setNumber: set_number,
      name: set.name,
      theme: set.theme,
      avgCost,
      condition,
      retirementStatus,
      effectiveRetirementDate,
      avgPriceUsd: snapshot?.avg_price_usd ?? null,
    })

    const now = new Date().toISOString()
    const { error: updateError } = await serviceSupabase
      .from('sets')
      .update({
        ai_recommendation: result.verdict,
        ai_analysis: result.analysis,
        ai_analyzed_at: now,
      })
      .eq('set_number', set_number)

    if (updateError) return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })

    return NextResponse.json({
      ai_recommendation: result.verdict,
      ai_analysis: result.analysis,
      ai_analyzed_at: now,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
