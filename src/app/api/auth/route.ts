// POST /api/auth/callback
// Handles Supabase auth callback (OAuth providers: Google, GitHub)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createServerClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Redirect to dashboard after login
  return NextResponse.redirect(new URL('/dashboard', req.url))
}
