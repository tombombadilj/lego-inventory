import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { fetchSetFromRebrickable } from '@/lib/rebrickable'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setNumber = request.nextUrl.searchParams.get('set_number')
  if (!setNumber) return NextResponse.json({ error: 'set_number required' }, { status: 400 })

  // Return cached data if fetched within last 24 hours
  const { data: cached } = await supabase
    .from('sets')
    .select('*')
    .eq('set_number', setNumber)
    .single()

  const oneDay = 1000 * 60 * 60 * 24
  if (cached && Date.now() - new Date(cached.last_fetched_at).getTime() < oneDay) {
    return NextResponse.json(cached)
  }

  // Fetch fresh from Rebrickable
  const setData = await fetchSetFromRebrickable(setNumber)
  if (!setData) return NextResponse.json({ error: `Set ${setNumber} not found on Rebrickable` }, { status: 404 })

  // Upsert using service role key (bypasses RLS)
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: upserted, error } = await serviceSupabase
    .from('sets')
    .upsert(
      { ...setData, last_fetched_at: new Date().toISOString() },
      { onConflict: 'set_number' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(upserted)
}
