'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useCartStore } from '@/lib/store/cart'

const C = {
  red: '#E3001B', navy: '#0A1628', gold: '#F5A623', green: '#00A651',
  offWhite: '#F7F8FA', white: '#FFFFFF', g100: '#EEF0F4', g400: '#9BA3B0', g600: '#5C6472', g800: '#2D3340',
}
const money = (c: number) => 'R ' + ((c || 0) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function emojiFor(n: string) { const s = (n || '').toLowerCase(); if (s.includes('soursop')) return '🌿'; if (s.includes('dragon')) return '🐉'; if (s.includes('plant') || s.includes('tree')) return '🌱'; return '🛒' }

interface P { id: string; name: string; price_cents: number; compare_price_cents: number | null; stock_qty: number | null; images: string[] | null; seller_id: string; sellers?: { store_name: string } | null }

export default function CategoryPage() {
  const params = useParams()
  const slug = (params?.slug as string) || ''
  const [title, setTitle] = useState('Category')
  const [products, setProducts] = useState<P[]>([])
  const [loading, setLoading] = useState(true)
  const addItem = useCartStore(s => s.addItem)

  useEffect(() => {
    let on = true
    ;(async () => {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const headers = { apikey: key, Authorization: `Bearer ${key}` }
      try {
        const catRes = await fetch(`${base}/rest/v1/categories?select=id,name&slug=eq.${slug}&limit=1`, { headers })
        const cats = catRes.ok ? await catRes.json() : []
        if (!cats.length) { if (on) { setProducts([]); setLoading(false) } ; return }
        if (on) setTitle(cats[0].name)
        const pRes = await fetch(
          `${base}/rest/v1/products?select=id,name,price_cents,compare_price_cents,stock_qty,images,seller_id,sellers(store_name)&category_id=eq.${cats[0].id}&status=eq.active&order=created_at.desc`,
          { headers }
        )
        const rows = pRes.ok ? await pRes.json() : []
        if (on) setProducts(rows)
      } catch { if (on) setProducts([]) }
      finally { if (on) setLoading(false) }
    })()
    return () => { on = false }
  }, [slug])

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans)', background: C.offWhite, color: C.g800, minHeight: '100vh' }}>
      <div style={{ background: C.red, padding: '0 20px', height: 60, display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: 1320, margin: 'auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 30, color: C.white, letterSpacing: 2, textDecoration: 'none' }}>SPA<span style={{ color: C.gold }}>ZA</span></Link>
          <Link href="/" style={{ color: '#fff', fontSize: 13, textDecoration: 'none' }}>← All products</Link>
        </div>
      </div>
      <div style={{ maxWidth: 1320, margin: 'auto', padding: '28px 20px' }}>
        <h1 style={{ fontFamily: 'var(--font-bebas)', fontSize: 32, color: C.navy, letterSpacing: 1, marginTop: 0 }}>{title}</h1>
        {loading ? <p style={{ color: C.g400 }}>Loading…</p>
          : products.length === 0 ? <p style={{ color: C.g400 }}>No products in this category yet.</p>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
              {products.map(p => {
                const stock = p.stock_qty ?? 0; const out = stock <= 0
                return (
                  <div key={p.id} style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
                    <Link href={`/product/${p.id}`} style={{ height: 180, background: C.g100, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {p.images && p.images.length ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 56 }}>{emojiFor(p.name)}</span>}
                    </Link>
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <div style={{ fontSize: 12, color: C.g400, marginBottom: 4 }}>{p.sellers?.store_name || 'Eden Extract'}</div>
                      <Link href={`/product/${p.id}`} style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, flex: 1, color: 'inherit', textDecoration: 'none' }}>{p.name}</Link>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-bebas)', color: C.red, fontSize: 24 }}>{money(p.price_cents)}</span>
                        {p.compare_price_cents && p.compare_price_cents > p.price_cents && (
                          <span style={{ fontSize: 13, color: C.g400, textDecoration: 'line-through' }}>{money(p.compare_price_cents)}</span>
                        )}
                      </div>
                      {out ? <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: C.red }}>Out of stock</div> : stock <= 5 ? <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: C.gold }}>Only {stock} left</div> : null}
                      <button onClick={() => addItem({ id: p.id, name: p.name, price_cents: p.price_cents, images: p.images || [], seller_id: p.seller_id })} disabled={out}
                        style={{ marginTop: out || stock <= 5 ? 6 : 12, width: '100%', background: out ? '#c9ccd2' : C.red, color: '#fff', border: 'none', padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: out ? 'not-allowed' : 'pointer' }}>
                        {out ? 'Sold out' : 'Add to Cart'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>}
      </div>
    </div>
  )
}
