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
  cancelled: { label: 'Cancelled', color: '#D6001C' },
  refunded: { label: 'Refunded', color: '#888' },
}

interface OrderItem { id: string; product_name: string; product_image: string | null; quantity: number; total_cents: number }
interface Order {
  id: string; order_number: string; status: string; total_cents: number; subtotal_cents: number;
  shipping_cents: number; shipping_city: string | null; shipping_province: string | null;
  created_at: string; order_items: OrderItem[]
}

export default function OrdersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState('')

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
        + `?select=id,order_number,status,total_cents,subtotal_cents,shipping_cents,shipping_city,shipping_province,created_at,order_items(id,product_name,product_image,quantity,total_cents)`
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${C.g100}`, fontSize: 14 }}>
                    <span style={{ color: C.g600 }}>{o.shipping_city ? `Ship to ${o.shipping_city}, ${o.shipping_province}` : 'Total'}</span>
                    <span style={{ fontWeight: 700, color: C.navy }}>{money(o.total_cents)}</span>
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
