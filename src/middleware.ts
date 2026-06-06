import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refreshes the session cookie so Server Components see a valid user.
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

  return response
}

export const config = {
  // Run on app routes, skip static assets, the static homepage, and API ITN webhooks.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|index.html|api/payfast).*)',
  ],
}
