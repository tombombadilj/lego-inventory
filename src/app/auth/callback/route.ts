import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Pin redirect to a trusted origin — never trust the request's own origin header
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${SITE_URL}/login?error=Authentication+failed`)
    }
  } else {
    return NextResponse.redirect(`${SITE_URL}/login?error=Missing+auth+code`)
  }

  return NextResponse.redirect(`${SITE_URL}/dashboard`)
}
