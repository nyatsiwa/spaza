'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
// ⚠️ ADJUST THIS IMPORT to your project's Supabase browser client.
// Common patterns: '@/lib/supabase/client', '@/utils/supabase/client'.
// It must expose a function that returns a browser client (createBrowserClient).
import { createClient } from '@/lib/supabase'

// --- Tunable settings ---------------------------------------------------
const ADMIN_IDLE_MS = 5 * 60 * 1000   // admins: 5 minutes
const USER_IDLE_MS  = 20 * 60 * 1000  // everyone else: 20 minutes
const WARNING_MS    = 60 * 1000       // show the prompt 60s before logout
const THROTTLE_MS   = 2000            // how often activity is written cross-tab
const ACTIVITY_KEY  = 'spaza:lastActivity'
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
// ------------------------------------------------------------------------

export default function IdleTimeout() {
  const supabase = useMemo(() => createClient(), [])

  const [enabled, setEnabled] = useState(false)        // is someone logged in?
  const [warning, setWarning] = useState(false)        // is the prompt showing?
  const [remaining, setRemaining] = useState(60)

  const lastActivityRef = useRef<number>(Date.now())
  const lastWriteRef = useRef<number>(0)
  const idleLimitRef = useRef<number>(USER_IDLE_MS)
  const enabledRef = useRef<boolean>(false)
  enabledRef.current = enabled

  // Record activity (and share it across tabs, throttled)
  const bump = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now
    if (now - lastWriteRef.current > THROTTLE_MS) {
      lastWriteRef.current = now
      try { localStorage.setItem(ACTIVITY_KEY, String(now)) } catch {}
    }
  }, [])

  const signOutNow = useCallback(async () => {
    try { await supabase.auth.signOut() } catch {}
    // Hard navigation (matches the app's post-auth pattern)
    window.location.assign('/login')
  }, [supabase])

  // Pick the timeout based on the user's role
  const applyRole = useCallback(async (userId: string) => {
    try {
      // ⚠️ If your profiles table keys on something other than `id`
      // (e.g. `user_id`), change the .eq() column below.
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
      idleLimitRef.current = data?.role === 'admin' ? ADMIN_IDLE_MS : USER_IDLE_MS
    } catch {
      idleLimitRef.current = USER_IDLE_MS
    }
  }, [supabase])

  // Establish session + react to login/logout
  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      if (session) {
        lastActivityRef.current = Date.now()
        applyRole(session.user.id)
        setEnabled(true)
      } else {
        setEnabled(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        lastActivityRef.current = Date.now()
        applyRole(session.user.id)
        setEnabled(true)
      } else {
        setEnabled(false)
        setWarning(false)
      }
    })

    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [supabase, applyRole])

  // Listeners + the 1s checker, only while logged in
  useEffect(() => {
    if (!enabled) return

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, bump, { passive: true }))

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === ACTIVITY_KEY && ev.newValue) {
        const t = Number(ev.newValue)
        if (t > lastActivityRef.current) {
          lastActivityRef.current = t       // another tab is active
          setWarning(false)
        }
      }
    }
    window.addEventListener('storage', onStorage)

    const interval = setInterval(() => {
      if (!enabledRef.current) return
      const elapsed = Date.now() - lastActivityRef.current
      const limit = idleLimitRef.current
      if (elapsed >= limit) {
        signOutNow()
      } else if (elapsed >= limit - WARNING_MS) {
        setWarning(true)
        setRemaining(Math.max(0, Math.ceil((limit - elapsed) / 1000)))
      } else if (warning) {
        setWarning(false)
      }
    }, 1000)

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, bump))
      window.removeEventListener('storage', onStorage)
      clearInterval(interval)
    }
  }, [enabled, bump, signOutNow, warning])

  const staySignedIn = () => { bump(); setWarning(false) }

  if (!enabled || !warning) return null

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Inactivity warning">
      <div style={card}>
        <div style={header}>Still there?</div>
        <div style={body}>
          <p style={{ margin: 0, color: '#334155', fontSize: 15 }}>
            You&apos;ve been inactive for a while. For your security, you&apos;ll be signed out in
          </p>
          <div style={countdown}>{remaining}s</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={staySignedIn} style={primaryBtn}>Stay signed in</button>
            <button onClick={signOutNow} style={secondaryBtn}>Log out now</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Inline styles (no CSS framework dependency) ------------------------
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 9999, padding: 16,
}
const card: React.CSSProperties = {
  width: '100%', maxWidth: 380, background: '#fff', borderRadius: 14,
  overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
  fontFamily: "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif",
}
const header: React.CSSProperties = {
  background: '#0a1628', color: '#fff', padding: '16px 20px',
  fontSize: 18, fontWeight: 700,
}
const body: React.CSSProperties = { padding: '20px', textAlign: 'center' }
const countdown: React.CSSProperties = {
  fontSize: 34, fontWeight: 800, color: '#D6001C', margin: '10px 0 18px',
}
const primaryBtn: React.CSSProperties = {
  flex: 1, background: '#D6001C', color: '#fff', border: 'none',
  borderRadius: 8, padding: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
}
const secondaryBtn: React.CSSProperties = {
  flex: 1, background: '#fff', color: '#334155', border: '1px solid #cbd5e1',
  borderRadius: 8, padding: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
}
