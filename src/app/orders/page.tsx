'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const C = {
  red: '#E3001B', navy: '#0A1628', gold: '#F5A623', green: '#00A651',
  offWhite: '#F7F8FA', white: '#FFFFFF', g100: '#EEF0F4', g400: '#9BA3B0', g600: '#5C6472', g800: '#2D3340',
}

const money = (cents: number) =>
  'R ' + ((cents || 0) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Awaiting payment', color: '#b26a00' },
  payment_pending: { label: 'Awaiting payment', color: '#b26a00' },
  paid: { label: 'Paid', color: '#00A651' },
  processing: { label: 'Processing', color: '#0A1628' },
  shipped: { label: 'Shipped', color: '#0A1628' },
  delivered: { label: 'Delivered', color: '#00A651' },
  refund_requested: { label: 'Refund requested', color: '#b26a00' },
  cancelled: { label: 'Cancelled', color: '#D6001C' },
  refunded: { label: 'Refunded', color: '#888' },
}

// reasons offered to the buyer
const REASONS: { value: string; label: string }[] = [
  { value: 'defective', label: 'Item is faulty / damaged' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'discretionary', label: 'Changed my mind (within 7 days)' },
]

// order statuses where a refund can still be requested
const REFUNDABLE = new Set(['paid', 'processing', 'shipped', 'delivered'])

// human labels for an existing refund's status
const REFUND_LABEL: Record<string, string> = {
  requested: 'Refund requested — under review',
  approved: 'Refund approved',
  processing: 'Refund processing',
  processed: 'Refunded',
  rejected: 'Refund declined',
  failed: 'Refund failed — please contact support',
}

interface OrderItem { id: string; product_name: string; product_image: string | null; quantity: number; total_cents: number }
interface OrderRefund { id: string; status: string; reason_type: string }
interface Order {
  id: string; order_number: string; status: string; total_cents: number; subtotal_cents: number;
  shipping_cents: number; shipping_city: string | null; shipping_province: string | null;
  created_at: string; order_items: OrderItem[]; order_refunds?: OrderRefund[]
}

export default function OrdersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState('')
  // tracks orders the buyer just requested a refund on (instant UI update)
  const [justRequested, setJustRequested] = useState<Record<string, boolean>>({})
  // which order's reason picker is open
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let on = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?redirect=/orders'); return }

      // Fetch the buyer's name for the header greeting.
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        if (on && profile?.full_name) setFullName(profile.full_name)
      } catch { /* ignore */ }

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders`
        + `?select=id,order_number,status,total_cents,subtotal_cents,shipping_cents,shipping_city,shipping_province,created_at,order_items(id,product_name,product_image,quantity,total_cents),order_refunds(id,status,reason_type)`
        + `&buyer_id=eq.${user.id}&order=created_at.desc`
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const res = await fetch(url, {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${token || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
        })
        const rows = res.ok ? await res.json() : []
        if (on) setOrders(rows)
      } catch {
        if (on) setOrders([])
      } finally {
        if (on) setLoading(false)
      }
    })()
    return () => { on = false }
  }, [router, supabase])

  async function requestRefund(orderId: string, reason: string) {
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`/api/orders/${orderId}/refund-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ reason_type: reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json?.error || 'Could not submit refund request.'); setBusy(false); return }
      setJustRequested(prev => ({ ...prev, [orderId]: true }))
      setPickerFor(null)
    } catch {
      alert('Could not submit refund request. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function renderRefundArea(o: Order) {
    const existing = Array.isArray(o.order_refunds) ? o.order_refunds[0] : null
    const localStatus = justRequested[o.id] ? 'requested' : existing?.status

    // existing/just-made refund -> show status, no button
    if (localStatus) {
      const isDead = localStatus === 'rejected' || localStatus === 'failed'
      return (
        <div style={{ fontSize: 12, fontWeight: 700, color: isDead ? '#B5001A' : C.g600 }}>
          {REFUND_LABEL[localStatus] || ('Refund: ' + localStatus)}
        </div>
      )
    }

    // not eligible -> nothing
    if (!REFUNDABLE.has(o.status)) return null

    // reason picker open
    if (pickerFor === o.id) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <div style={{ fontSize: 12, color: C.g600, fontWeight: 600 }}>Reason for refund:</div>
          {REASONS.map(r => (
            <button
              key={r.value}
              disabled={busy}
              onClick={() => requestRefund(o.id, r.value)}
              style={{
                background: '#fff', color: C.navy, border: `1px solid ${C.g100}`, borderRadius: 8,
                padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1, textAlign: 'right', minWidth: 200,
              }}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => setPickerFor(null)}
            disabled={busy}
            style={{ background: 'transparent', color: C.g400, border: 'none', fontSize: 11, textDecoration: 'underline', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )
    }

    // default -> the request button
    return (
      <button
        onClick={() => setPickerFor(o.id)}
        style={{
          background: 'transparent', color: C.g600, border: `1px solid ${C.g100}`, borderRadius: 8,
          padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Request refund
      </button>
    )
  }

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans)', background: C.offWhite, color: C.g800, minHeight: '100vh' }}>
      <div style={{ background: C.red, padding: '0 20px', height: 60, display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: 900, margin: 'auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 30, color: C.white, letterSpacing: 2, textDecoration: 'none' }}>SPA<span style={{ color: C.gold }}>ZA</span></Link>
          <Link href="/account" style={{ color: '#fff', fontSize: 13, textDecoration: 'none', textAlign: 'right', lineHeight: 1.3 }}>
            {fullName ? <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{fullName}</span> : null}
            <span style={{ opacity: fullName ? 0.85 : 1 }}>My account</span>
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: 'auto', padding: '24px 20px' }}>
        <h1 style={{ fontSize: 24, color: C.navy, marginTop: 0 }}>My orders</h1>

        {loading ? (
          <p style={{ color: C.g400 }}>Loading your orders…</p>
        ) : orders.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', color: C.g600 }}>
            <div style={{ fontSize: 44 }}>🧾</div>
            <p style={{ marginTop: 10 }}>You haven&apos;t placed any orders yet.</p>
            <Link href="/" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>Start shopping →</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {orders.map(o => {
              const st = STATUS[o.status] || { label: o.status, color: '#666' }
              return (
                <div key={o.id} style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#f7f8fa', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: C.navy }}>{o.order_number}</div>
                      <div style={{ fontSize: 12, color: C.g600 }}>{new Date(o.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: st.color }}>{st.label}</span>
                  </div>
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(o.order_items || []).map(it => (
                      <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: C.g100, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {it.product_image ? <img src={it.product_image} alt={it.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🛒</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{it.product_name} <span style={{ color: C.g400 }}>× {it.quantity}</span></div>
                        <div style={{ fontWeight: 600, color: C.navy }}>{money(it.total_cents)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 16px', borderTop: `1px solid ${C.g100}`, fontSize: 14, gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ color: C.g600 }}>{o.shipping_city ? `Ship to ${o.shipping_city}, ${o.shipping_province}` : 'Total'}</span>
                    <span style={{ fontWeight: 700, color: C.navy }}>{money(o.total_cents)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 14px' }}>
                    {renderRefundArea(o)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
