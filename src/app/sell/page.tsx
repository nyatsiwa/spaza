'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'

const C = {
  red: '#E3001B', navy: '#0A1628', navyMid: '#12243A', slate: '#1E3A5F',
  gold: '#F5A623', offWhite: '#F7F8FA', white: '#FFFFFF',
  g100: '#EEF0F4', g200: '#DDE0E8', g400: '#9BA3B0', g600: '#5C6472', g800: '#2D3340', green: '#00A651',
}

type PlanKey = 'free' | 'growth'

const PLANS: {
  key: PlanKey; tier: string; name: string; price: string; period: string; blurb: string
  features: { label: string; included: boolean }[]; highlight?: boolean
}[] = [
  {
    key: 'free', tier: 'Start Selling', name: 'FREE', price: 'R0', period: 'forever', blurb: 'Everything you need to start selling online today — no monthly fee.',
    features: [
      { label: 'List up to 5 products', included: true },
      { label: '2 photos per product', included: true },
      { label: 'Seller dashboard', included: true },
      { label: 'Payouts every 2 weeks', included: true },
      { label: '8% commission per sale', included: true },
      { label: 'No monthly subscription', included: true },
    ],
  },
  {
    key: 'growth', tier: 'Grow Your Store', name: 'GROWTH', price: 'R70', period: 'per month', blurb: 'More listings, more photos, and a lower commission as you scale.', highlight: true,
    features: [
      { label: 'List up to 10 products', included: true },
      { label: '3 photos per product', included: true },
      { label: 'Seller dashboard', included: true },
      { label: 'Payouts every 2 weeks', included: true },
      { label: 'Lower 5% commission per sale', included: true },
      { label: 'Priority support', included: true },
    ],
  },
]

export default function SellPage() {
  const router = useRouter()
  const supabase = createClient()
  const [busy, setBusy] = useState<PlanKey | null>(null)

  async function choosePlan(plan: PlanKey) {
    setBusy(plan)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { router.push('/login?redirect=/sell'); return }

      const res = await fetch('/api/seller/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Could not start'); setBusy(null); return }

      // Free plan: no payment — seller is active immediately.
      if (data.activated) {
        toast.success('You are now a Spaza seller!')
        router.push('/account')
        return
      }

      // Growth plan: redirect to Paystack to set up the monthly subscription.
      if (data.authorizationUrl) {
        window.location.assign(data.authorizationUrl)
        return
      }

      toast.error('Unexpected response. Please try again.')
      setBusy(null)
    } catch {
      toast.error('Something went wrong. Please try again.')
      setBusy(null)
    }
  }

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans)', background: C.offWhite, minHeight: '100vh', color: C.g800 }}>
      {/* HEADER */}
      <header style={{ background: C.red, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 1320, margin: 'auto', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 34, color: '#fff', letterSpacing: 2, textDecoration: 'none' }}>SPA<span style={{ color: C.gold }}>ZA</span></a>
          <a href="/" style={{ marginLeft: 'auto', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>← Back to store</a>
        </div>
      </header>

      {/* HERO */}
      <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.slate} 100%)`, color: '#fff', padding: '56px 20px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(36px,6vw,72px)', letterSpacing: 1, lineHeight: 1 }}>
          SELL ON <span style={{ color: C.gold }}>SPAZA</span>
        </h1>
        <p style={{ marginTop: 14, fontSize: 17, color: '#cdd4e0', maxWidth: 580, margin: '14px auto 0' }}>
          Start selling for free. Reach buyers across South Africa, keep more of what you earn, and upgrade only when you grow.
        </p>
      </div>

      {/* PLANS */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px 30px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'start' }}>
        {PLANS.map(p => (
          <div key={p.key} style={{
            background: '#fff', borderRadius: 16, padding: 28, position: 'relative',
            boxShadow: p.highlight ? '0 8px 30px rgba(227,0,27,0.18)' : '0 1px 3px rgba(0,0,0,0.08)',
            border: p.highlight ? `2px solid ${C.red}` : `1px solid ${C.g200}`,
            transform: p.highlight ? 'translateY(-6px)' : 'none',
          }}>
            {p.highlight && (
              <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: C.gold, color: C.navy, fontWeight: 700, fontSize: 12, padding: '4px 14px', borderRadius: 20, whiteSpace: 'nowrap' }}>⭐ Best Value</div>
            )}
            <div style={{ fontSize: 13, color: C.g400, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{p.tier}</div>
            <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 38, color: C.navy, letterSpacing: 1, lineHeight: 1, marginTop: 2 }}>{p.name}</div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 44, color: C.red, letterSpacing: 0.5 }}>{p.price}</span>
              <span style={{ fontSize: 13, color: C.g400 }}>{p.period}</span>
            </div>
            <p style={{ fontSize: 13, color: C.g600, marginTop: 10, minHeight: 38 }}>{p.blurb}</p>

            <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {p.features.map(f => (
                <li key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: f.included ? C.g800 : C.g400 }}>
                  <span style={{ color: f.included ? C.green : C.g200, fontWeight: 700 }}>{f.included ? '✓' : '✗'}</span>
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>

            <button onClick={() => choosePlan(p.key)} disabled={busy !== null}
              style={{
                width: '100%', marginTop: 24, padding: 14, borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer',
                fontSize: 15, fontWeight: 700, opacity: busy && busy !== p.key ? 0.5 : 1,
                background: p.highlight ? C.red : C.navy, color: '#fff',
              }}>
              {busy === p.key ? 'Starting…' : p.key === 'free' ? 'Start Selling Free' : 'Choose Growth'}
            </button>
          </div>
        ))}
      </div>

      <p style={{ textAlign: 'center', color: C.g400, fontSize: 13, padding: '0 20px 50px', maxWidth: 620, margin: '0 auto' }}>
        Commission is deducted automatically from each sale; the balance is paid to your bank account every 2 weeks.
        The Growth plan is billed monthly and can be cancelled anytime. By selling you agree to the{' '}
        <a href="/terms" style={{ color: C.red }}>Terms &amp; Conditions</a>.
      </p>
    </div>
  )
}
