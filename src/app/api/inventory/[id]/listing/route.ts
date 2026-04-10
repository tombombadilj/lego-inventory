import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateListing } from '@/lib/gemini'
import { getRetirementStatus, getRecommendation } from '@/lib/recommendations'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch item + set data — implicit ownership via added_by
  const { data: item, error: fetchError } = await supabase
    .from('inventory_items')
    .select('*, sets(*)')
    .eq('id', id)
    .eq('added_by', user.id)
    .single()

  if (fetchError || !item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const s = item.sets
  const effectiveRetirementDate = s.override_retirement_date ?? s.retirement_date
  const retirementStatus = getRetirementStatus({
    retirement_date: s.retirement_date,
    override_retired: s.override_retired,
    retiring_soon_override: s.retiring_soon_override,
  })

  // Derive recommendation for prompt context (no price snapshot available here — use NO_DATA)
  const recommendation = getRecommendation(null, {
    purchase_price_usd: item.purchase_price_usd,
    sell_threshold_pct: 10,
    demand_drop_pts: 20,
    retirement_status: retirementStatus,
    retirement_date: s.retirement_date,
    override_retirement_date: s.override_retirement_date,
  }).recommendation

  try {
    const listing = await generateListing({
      name: s.name,
      setNumber: s.set_number,
      theme: s.theme,
      pieceCount: s.piece_count,
      condition: item.condition,
      retirementStatus,
      effectiveRetirementDate,
      avgPrice: null, // price snapshots not fetched here; Gemini prompt omits eBay price if null
      recommendation,
      minifigCount: s.minifig_count,
      minifigNames: s.minifig_names,
    })

    const { error: saveError } = await supabase
      .from('inventory_items')
      .update({ listing_title: listing.listing_title, listing_description: listing.listing_description })
      .eq('id', id)
      .eq('added_by', user.id)

    if (saveError) {
      return NextResponse.json({ error: 'Failed to save listing' }, { status: 500 })
    }

    return NextResponse.json(listing)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
