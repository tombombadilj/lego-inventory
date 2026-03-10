import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { fetchBrickOwlPriceData } from '@/lib/brickowl'
import { fetchEbayPriceData } from '@/lib/ebay'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setNumber = request.nextUrl.searchParams.get('set_number')
  if (!setNumber) return NextResponse.json({ error: 'set_number required' }, { status: 400 })

  // Resolve set_id from set_number
  const { data: setRow } = await supabase
    .from('sets')
    .select('id')
    .eq('set_number', setNumber)
    .single()

  if (!setRow) return NextResponse.json({ error: `Set ${setNumber} not found` }, { status: 404 })
  const setId = setRow.id

  // Return cached snapshot if within TTL
  const { data: cached } = await supabase
    .from('price_snapshots')
    .select('*')
    .eq('set_id', setId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .single()

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return NextResponse.json(cached)
  }

  // Fetch from both APIs in parallel
  const [brickowlData, ebayData] = await Promise.all([
    fetchBrickOwlPriceData(setNumber),
    fetchEbayPriceData(setNumber),
  ])

  // BrickOwl is primary for price; eBay is primary for demand signals
  const avg_price_usd = brickowlData?.avg_price_usd ?? null
  const min_price_usd = brickowlData?.min_price_usd ?? null
  const max_price_usd = brickowlData?.max_price_usd ?? null
  const listings_count = ebayData?.listings_count ?? 0
  const demand_score = ebayData?.demand_score ?? 0

  // Only the source label records which data we actually got
  const sources: string[] = []
  if (brickowlData) sources.push('brickowl')
  if (ebayData) sources.push('ebay')
  const source = sources.length > 0 ? sources.join('+') : 'none'

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: snapshot, error } = await serviceSupabase
    .from('price_snapshots')
    .insert({
      set_id: setId,
      source,
      avg_price_usd,
      min_price_usd,
      max_price_usd,
      demand_score,
      listings_count,
      fetched_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(snapshot)
}
