import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'jasonchiu0803@gmail.com'

const ALLOWED_FIELDS = ['override_retired', 'retiring_soon_override', 'override_retirement_date'] as const
type AllowedField = typeof ALLOWED_FIELDS[number]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ set_number: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { set_number } = await params
  const body = await request.json()

  const safeUpdate: Partial<Record<AllowedField, unknown>> = {}
  for (const field of ALLOWED_FIELDS) {
    if (field in body) safeUpdate[field] = body[field]
  }

  if (Object.keys(safeUpdate).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sets')
    .update(safeUpdate)
    .eq('set_number', set_number)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Set not found' }, { status: 404 })
  return NextResponse.json(data)
}
