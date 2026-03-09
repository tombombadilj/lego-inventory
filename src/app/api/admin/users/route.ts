import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/roles'

function serviceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: { users }, error } = await serviceSupabase().auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(users.map(u => ({
    id: u.id,
    email: u.email,
    // Read role from app_metadata (server-writable only)
    role: u.app_metadata?.role ?? 'member',
    created_at: u.created_at,
  })))
}

export async function POST(request: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  // Fail loudly if NEXT_PUBLIC_SITE_URL is not configured — invite links must
  // point to the real production URL, never localhost
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_SITE_URL is not configured. Set it in your environment variables.' },
      { status: 500 }
    )
  }

  const { data, error } = await serviceSupabase().auth.admin.inviteUserByEmail(email, {
    // Store role in app_metadata so users cannot self-modify it
    app_metadata: { role: 'member' },
    redirectTo: `${siteUrl}/auth/callback`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
