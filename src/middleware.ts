import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export async function middleware(request: NextRequest) {
  // Start with a response that mirrors the incoming request.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write to the request (so this pass sees them) ...
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // ... rebuild the response from the updated request ...
          supabaseResponse = NextResponse.next({ request })
          // ... and write the cookies onto the response so the browser keeps them.
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: call getUser() right after creating the client, with no logic
  // in between. This refreshes the session and lets getUser read the cookie.
  const { data: { user } } = await supabase.auth.getUser()

  // Protect buyer-only routes: redirect to /login if not signed in.
  const protectedPaths = ['/account', '/checkout']
  const path = request.nextUrl.pathname
  const isProtected = protectedPaths.some(p => path === p || path.startsWith(p + '/'))

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  // Must return supabaseResponse so refreshed auth cookies reach the browser.
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|index.html|api/payfast).*)',
  ],
}
