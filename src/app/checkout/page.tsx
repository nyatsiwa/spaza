'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useCartStore } from '@/lib/store/cart'
import { createClient } from '@/lib/supabase'

const C = {
  red: '#E3001B', navy: '#0A1628', gold: '#F5A623',
  offWhite: '#F7F8FA', g100: '#EEF0F4', g200: '#DDE0E8', g400: '#9BA3B0', g600: '#5C6472', g800: '#2D3340',
}
const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
]
const money = (c: number) => 'R ' + (c / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Ship {
  name: string; phone: string; line1: string; line2: string; city: string; province: string; postal: string
}
const EMPTY: Ship = { name: '', phone: '', line1: '', line2: '', city: '', province: '', postal: '' }

export default function CheckoutPage() {
  const router = useRouter()
  const supabase = createClient()

  const items = useCartStore(s => s.items)
  const totalCents = useCartStore(s => s.totalCents)
  const shippingCents = useCartStore(s => s.shippingCents)
  const grandTotal = useCartStore(s => s.grandTotal)

  const [ship, setShip] = useState<Ship>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?redirect=/checkout'); return }
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone, address_line1, address_line2, city, province, postal_code')
        .eq('id', user.id).single()
      if (active && data) {
        setShip({
          name: data.full_name || '', phone: data.phone || '',
          line1: data.address_line1 || '', line2: data.address_line2 || '',
          city: data.city || '', province: data.province || '', postal: data.postal_code || '',
        })
      }
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [router, supabase])

  function set<K extends keyof Ship>(k: K, v: string) { setShip(p => ({ ...p, [k]: v })) }

  async function handlePay() {
    if (!ship.name.trim())   return toast.error('Enter your full name')
    if (!ship.line1.trim())  return toast.error('Enter your street address')
    if (!ship.city.trim())   return toast.error('Enter your city')
    if (!ship.province)      return toast.error('Select your province')
    if (!ship.postal.trim()) return toast.error('Enter your postal code')

    setSubmitting(true)
    try {
      // Pass the access token explicitly so the server can identify the buyer
      // (more reliable than relying on the session cookie reaching the route).
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { toast.error('Please sign in again'); setSubmitting(false); router.push('/login?redirect=/checkout'); return }

      const res = await fetch('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: items.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
          shipping: ship,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Checkout failed'); setSubmitting(false); return }

      // ── TEMP DEBUG: show what we're sending to PayFast instead of redirecting ──
      if (data.payfast?.debug) {
        const d = data.payfast.debug
        window.prompt(
          'Copy this whole text and send it (Ctrl+A then Ctrl+C):',
          'merchant_id=' + d.merchant_id + ' | has_passphrase=' + d.has_passphrase + ' | signature=' + d.signature + ' || BASE: ' + d.base
        )
        setSubmitting(false)
        return
      }

      // Auto-submit a form to PayFast (redirects the browser to the payment page)
      const { url, fields } = data.payfast as { url: string; fields: Record<string, string> }
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = url
      Object.entries(fields).forEach(([k, v]) => {
        const input = document.createElement('input')
        input.type = 'hidden'; input.name = k; input.value = v
        form.appendChild(input)
      })
      document.body.appendChild(form)
      form.submit()
    } catch {
      toast.error('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.g400 }}>Loading checkout…</div>
  }

  if (items.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: C.offWhite, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 }}>
        <div style={{ fontSize: 56 }}>🛒</div>
        <p style={{ color: C.g600 }}>Your cart is empty.</p>
        <a href="/" style={{ background: C.red, color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>Continue Shopping</a>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.offWhite, padding: '24px 16px', fontFamily: 'var(--font-dm-sans)' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <a href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 30, color: C.navy, letterSpacing: 1, textDecoration: 'none' }}>SPA<span style={{ color: C.gold }}>ZA</span></a>
        <h1 style={{ fontFamily: 'var(--font-bebas)', fontSize: 34, color: C.navy, letterSpacing: 1, margin: '12px 0 20px' }}>Checkout</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 20 }}>
          {/* Shipping */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: C.navy, marginBottom: 14 }}>Shipping address</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Full name" value={ship.name} onChange={v => set('name', v)} placeholder="Thandi Nkosi" />
              <Field label="Phone (optional)" value={ship.phone} onChange={v => set('phone', v)} placeholder="072 123 4567" />
              <Field label="Street address" value={ship.line1} onChange={v => set('line1', v)} placeholder="123 Main Road" />
              <Field label="Apartment, suite (optional)" value={ship.line2} onChange={v => set('line2', v)} placeholder="Unit 4B" />
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="City" value={ship.city} onChange={v => set('city', v)} placeholder="Benoni" /></div>
                <div style={{ flex: 1 }}><Field label="Postal code" value={ship.postal} onChange={v => set('postal', v)} placeholder="1501" /></div>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Province</span>
                <select value={ship.province} onChange={e => set('province', e.target.value)}
                  style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, background: '#fff' }}>
                  <option value="">Select a province…</option>
                  {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
          </div>

          {/* Order summary */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: C.navy, marginBottom: 14 }}>Order summary</h2>
            {items.map(i => (
              <div key={i.product.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.g100}`, fontSize: 14 }}>
                <span>{i.product.name} × {i.quantity}</span>
                <span style={{ fontWeight: 600 }}>{money(i.product.price_cents * i.quantity)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.g600, marginTop: 12 }}>
              <span>Subtotal</span><span>{money(totalCents())}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.g600, marginTop: 4 }}>
              <span>{shippingCents() === 0 ? 'Shipping (free over R500)' : 'Shipping'}</span>
              <span>{shippingCents() === 0 ? 'FREE' : money(shippingCents())}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.g200}`, fontWeight: 700, fontSize: 18 }}>
              <span>Total</span><span style={{ color: C.red }}>{money(grandTotal())}</span>
            </div>

            <button onClick={handlePay} disabled={submitting}
              style={{ width: '100%', marginTop: 18, background: C.red, color: '#fff', border: 'none', padding: 15, borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Redirecting to PayFast…' : `Pay ${money(grandTotal())} with PayFast`}
            </button>
            <p style={{ fontSize: 12, color: C.g400, textAlign: 'center', marginTop: 10 }}>🔒 Secure payment via PayFast</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{label}</span>
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
    </label>
  )
}
