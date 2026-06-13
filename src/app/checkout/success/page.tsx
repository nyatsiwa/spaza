'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useCartStore } from '@/lib/store/cart'

const C = {
  red: '#E3001B', navy: '#0A1628', gold: '#F5A623',
  offWhite: '#F7F8FA', g400: '#9BA3B0', g600: '#5C6472',
}

function SuccessInner() {
  const router = useRouter()
  const params = useSearchParams()
  const orderId = params.get('order') || ''
  const cart = useCartStore() as any

  const [nextUrl, setNextUrl] = useState<string | null>(null)

  useEffect(() => {
    // Clear the cart (method name varies across stores — call defensively).
    try {
      if (typeof cart?.clear === 'function') cart.clear()
      else if (typeof cart?.reset === 'function') cart.reset()
      else if (typeof cart?.clearCart === 'function') cart.clearCart()
    } catch { /* ignore */ }

    // Multi-seller carts: we stashed remaining payments at checkout. If any
    // remain, offer to continue to the next seller's payment.
    try {
      const pendingRaw = sessionStorage.getItem('spaza_pending_payments')
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw) as { authorizationUrl: string }[]
        if (Array.isArray(pending) && pending.length > 0) {
          const [next, ...rest] = pending
          if (rest.length > 0) sessionStorage.setItem('spaza_pending_payments', JSON.stringify(rest))
          else sessionStorage.removeItem('spaza_pending_payments')
          setNextUrl(next.authorizationUrl)
        }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: C.offWhite, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', fontFamily: 'var(--font-dm-sans)' }}>
      <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#E8F7EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>✅</div>
      <h1 style={{ fontFamily: 'var(--font-bebas)', fontSize: 34, color: C.navy, letterSpacing: 1, margin: 0 }}>Payment received</h1>
      <p style={{ color: C.g600, maxWidth: 420, margin: 0 }}>
        Thanks! Your payment is being confirmed. You&rsquo;ll see the order in your account once it&rsquo;s finalised, and the seller will be notified to ship it.
      </p>

      {nextUrl ? (
        <>
          <p style={{ color: C.g600, fontSize: 14, maxWidth: 420 }}>
            Your cart had items from more than one seller. Please complete the next payment.
          </p>
          <button onClick={() => window.location.assign(nextUrl)}
            style={{ background: C.red, color: '#fff', border: 'none', padding: '13px 26px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Continue to next payment →
          </button>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <button onClick={() => router.push('/orders')}
            style={{ background: C.navy, color: '#fff', border: 'none', padding: '13px 22px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            View my orders
          </button>
          <button onClick={() => router.push('/')}
            style={{ background: '#fff', color: C.navy, border: `1px solid ${C.navy}33`, padding: '13px 22px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Continue shopping
          </button>
        </div>
      )}

      {orderId ? <p style={{ color: C.g400, fontSize: 12, marginTop: 8 }}>Order reference: {orderId}</p> : null}
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9BA3B0' }}>Loading…</div>}>
      <SuccessInner />
    </Suspense>
  )
}
