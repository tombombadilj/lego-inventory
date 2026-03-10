import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const EDITABLE_FIELDS = [
  'purchased_from', 'purchase_price_usd', 'purchase_date',
  'condition', 'notes', 'sold', 'sold_price_usd', 'sold_date', 'sold_via',
] as const

type EditableField = typeof EDITABLE_FIELDS[number]

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  // Whitelist: only allow known, safe fields — prevents mass-assignment attacks
  const safeUpdate: Partial<Record<EditableField, unknown>> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) safeUpdate[field] = body[field]
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .update({ ...safeUpdate, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('added_by', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data, error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', id)
    .eq('added_by', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
