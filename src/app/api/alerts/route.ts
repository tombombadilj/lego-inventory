import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * GET /api/alerts
 * Returns all unread alerts for the current user.
 * Also marks them as seen after returning (read-and-clear pattern).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('*, sets(set_number, name)')
    .eq('user_id', user.id)
    .eq('seen', false)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark fetched alerts as seen
  if (alerts && alerts.length > 0) {
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await serviceSupabase
      .from('alerts')
      .update({ seen: true })
      .in('id', alerts.map(a => a.id))
  }

  return NextResponse.json(alerts ?? [])
}

/**
 * POST /api/alerts
 * Body: { set_id, user_id, type, message }
 * Called internally by /api/prices/fetch when a threshold is breached.
 * Requires service role — validates caller has the service key.
 */
export async function POST(request: NextRequest) {
  // Internal endpoint — requires service role authorization
  const authHeader = request.headers.get('Authorization')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { set_id, user_id, type, message } = body

  if (!set_id || !user_id || !type || !message) {
    return NextResponse.json({ error: 'set_id, user_id, type, message required' }, { status: 400 })
  }

  const validTypes = ['retirement', 'price_spike', 'price_drop', 'demand_drop']
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await serviceSupabase
    .from('alerts')
    .insert({ set_id, user_id, type, message, seen: false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

/**
 * PATCH /api/alerts
 * Body: { ids: string[] } — marks specific alerts as seen without fetching them.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await request.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 })
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await serviceSupabase
    .from('alerts')
    .update({ seen: true })
    .in('id', ids)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
