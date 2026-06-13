'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCartStore } from '@/lib/store/cart'
import { createClient } from '@/lib/supabase'

/* ─── palette (matches the original static homepage) ─── */
const C = {
  red: '#E3001B', redDark: '#B5001A',
  navy: '#0A1628', navyMid: '#12243A', slate: '#1E3A5F',
  gold: '#F5A623',
  offWhite: '#F7F8FA', white: '#FFFFFF',
  g100: '#EEF0F4', g200: '#DDE0E8', g400: '#9BA3B0', g600: '#5C6472', g800: '#2D3340',
  green: '#00A651',
}

interface ApiProduct {
  id: string
  name: string
  price_cents: number
  compare_price_cents: number | null
  stock_qty: number | null
  images: string[] | null
  seller_id: string
  sellers?: { store_name: string } | null
}

function emojiFor(name: string) {
  const n = (name || '').toLowerCase()
  if (n.includes('soursop')) return '🌿'
  if (n.includes('dragon')) return '🐉'
  if (n.includes('plant') || n.includes('tree')) return '🌱'
  return '🛒'
}
const money = (cents: number) =>
  'R ' + (cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  const [products, setProducts] = useState<ApiProduct[]>([])
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string; icon: string | null }[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [cartOpen, setCartOpen] = useState(false)
  const [authed, setAuthed] = useState(false)

  const items = useCartStore(s => s.items)
  const addItem = useCartStore(s => s.addItem)
  const removeItem = useCartStore(s => s.removeItem)
  const updateQty = useCartStore(s => s.updateQty)
  const totalItems = useCartStore(s => s.totalItems)
  const totalCents = useCartStore(s => s.totalCents)
  const shippingCents = useCartStore(s => s.shippingCents)
  const grandTotal = useCartStore(s => s.grandTotal)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (active) setAuthed(!!data.user)

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products`
        + `?select=id,name,price_cents,compare_price_cents,stock_qty,images,seller_id,sellers(store_name)`
        + `&status=eq.active&order=created_at.desc`
      try {
        const res = await fetch(url, {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
        })
        const rows = res.ok ? await res.json() : []
        if (active) setProducts(rows)
      } catch {
        if (active) setProducts([])
      } finally {
        if (active) setLoadingProducts(false)
      }

      try {
        const cres = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/categories?select=id,name,slug,icon&is_active=eq.true&order=sort_order.asc`, {
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` },
        })
        if (cres.ok && active) setCategories(await cres.json())
      } catch { /* ignore */ }
    })()
    return () => { active = false }
  }, [supabase])

  const count = totalItems()

  function handleAdd(p: ApiProduct) {
    addItem({ id: p.id, name: p.name, price_cents: p.price_cents, images: p.images || [], seller_id: p.seller_id })
    setCartOpen(true)
  }

  function handleCheckout() {
    if (!authed) { router.push('/login?redirect=/checkout'); return }
    router.push('/checkout')
  }

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans)', background: C.offWhite, color: C.g800, minHeight: '100vh' }}>
      {/* TOPBAR */}
      <div style={{ background: C.navy, color: C.g400, fontSize: 12, padding: '6px 0' }}>
        <div style={{ maxWidth: 1320, margin: 'auto', padding: '0 20px', display: 'flex', justifyContent: 'space-between' }}>
          <span>📦 Delivering Nationwide · South Africa</span>
          <span style={{ display: 'flex', gap: 20 }}>
            <a href="/sell" style={{ color: C.gold, textDecoration: 'none', fontWeight: 600 }}>Sell on Spaza</a>
            <a href="/account" style={{ color: C.g400, textDecoration: 'none' }}>Track My Order</a>
            <span>Help &amp; Support</span>
          </span>
        </div>
      </div>

      {/* HEADER */}
      <header style={{ background: C.red, position: 'sticky', top: 0, zIndex: 1000, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 1320, margin: 'auto', padding: '0 20px', height: 68, display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 38, color: C.white, letterSpacing: 2, textDecoration: 'none' }}>
            SPA<span style={{ color: C.gold }}>ZA</span>
          </a>
          <div style={{ flex: 1, display: 'flex', maxWidth: 680, borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && search.trim()) router.push(`/search?q=${encodeURIComponent(search.trim())}`) }} placeholder="Search products…" style={{ flex: 1, border: 'none', padding: '0 18px', fontSize: 14, outline: 'none', height: 42 }} />
            <button onClick={() => { if (search.trim()) router.push(`/search?q=${encodeURIComponent(search.trim())}`) }} style={{ background: C.navy, border: 'none', color: '#fff', padding: '0 20px', fontSize: 16, cursor: 'pointer' }}>🔍</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <a href={authed ? '/account' : '/login'} style={hbtn}>
              <span style={{ fontSize: 20 }}>{authed ? '👤' : '🔑'}</span>
              <span>{authed ? 'Account' : 'Sign In'}</span>
            </a>
            <button onClick={() => setCartOpen(true)} style={{ ...hbtn, position: 'relative', background: 'none' }}>
              <span style={{ fontSize: 20 }}>🛒</span>
              <span>Cart</span>
              {count > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 6, background: C.gold, color: C.navy, borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* CATEGORY TILES (under header) */}
      {categories.length > 0 && (
        <div style={{ background: C.navyMid, borderBottom: `1px solid rgba(255,255,255,0.08)`, padding: '12px 0' }}>
          <div style={{ maxWidth: 1320, margin: 'auto', padding: '0 12px', display: 'flex', gap: 10, overflowX: 'auto' }}>
            {categories.map(cat => (
              <a key={cat.id} href={`/category/${cat.slug}`}
                style={{ flex: '0 0 auto', width: 92, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '12px 8px', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#e7eaf0' }}>
                <span style={{ fontSize: 26 }}>{cat.icon || '📦'}</span>
                <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{cat.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* HERO */}
      <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.slate} 100%)`, color: '#fff', padding: '56px 20px' }}>
        <div style={{ maxWidth: 1320, margin: 'auto' }}>
          <h1 style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(40px, 7vw, 86px)', lineHeight: 1, letterSpacing: 1 }}>
            SOUTH AFRICA&apos;S <span style={{ color: C.gold }}>BIGGEST</span><br />ONLINE MARKETPLACE
          </h1>
          <p style={{ marginTop: 16, fontSize: 17, color: '#cdd4e0', maxWidth: 560 }}>
            Shop genuine products from trusted South African sellers. Fast delivery nationwide.
          </p>
          <a href="#products" style={{ display: 'inline-block', marginTop: 24, background: C.red, color: '#fff', padding: '14px 28px', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>Shop Now</a>
        </div>
      </div>

      {/* SHOP BY CATEGORY (grid) */}
      {categories.length > 0 && (
        <div style={{ maxWidth: 1320, margin: 'auto', padding: '40px 20px 0' }}>
          <h2 style={{ fontFamily: 'var(--font-bebas)', fontSize: 30, color: C.navy, letterSpacing: 1, marginBottom: 20 }}>Shop by Category</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
            {categories.map(cat => (
              <a key={cat.id} href={`/category/${cat.slug}`}
                style={{ background: '#fff', borderRadius: 14, padding: '28px 16px', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #eef0f4' }}>
                <span style={{ fontSize: 44 }}>{cat.icon || '📦'}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.navy, textAlign: 'center' }}>{cat.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* PRODUCTS */}
      <div id="products" style={{ maxWidth: 1320, margin: 'auto', padding: '40px 20px' }}>
        <h2 style={{ fontFamily: 'var(--font-bebas)', fontSize: 30, color: C.navy, letterSpacing: 1, marginBottom: 20 }}>Featured Products</h2>
        {loadingProducts ? (
          <p style={{ color: C.g400 }}>Loading products…</p>
        ) : products.length === 0 ? (
          <p style={{ color: C.g400 }}>No products available right now.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
            {products.map(p => {
              const img = p.images && p.images.length
                ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 56 }}>{emojiFor(p.name)}</span>
              const stock = p.stock_qty ?? 0
              const out = stock <= 0
              return (
                <div key={p.id} style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
                  <Link href={`/product/${p.id}`} style={{ height: 180, background: C.g100, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{img}</Link>
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ fontSize: 12, color: C.g400, marginBottom: 4 }}>{p.sellers?.store_name || 'Eden Extract'}</div>
                    <Link href={`/product/${p.id}`} style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, flex: 1, color: 'inherit', textDecoration: 'none' }}>{p.name}</Link>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-bebas)', color: C.red, fontSize: 24, letterSpacing: 0.5 }}>{money(p.price_cents)}</span>
                      {p.compare_price_cents && p.compare_price_cents > p.price_cents && (
                        <>
                          <span style={{ fontSize: 13, color: C.g400, textDecoration: 'line-through' }}>{money(p.compare_price_cents)}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: C.green, borderRadius: 6, padding: '2px 6px' }}>
                            {Math.round((1 - p.price_cents / p.compare_price_cents) * 100)}% OFF
                          </span>
                        </>
                      )}
                    </div>
                    {out
                      ? <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: C.red }}>Out of stock</div>
                      : stock <= 5
                        ? <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: C.gold }}>Only {stock} left</div>
                        : null}
                    <button onClick={() => handleAdd(p)} disabled={out}
                      style={{ marginTop: out || stock <= 5 ? 6 : 12, width: '100%', background: out ? '#c9ccd2' : C.red, color: '#fff', border: 'none', padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: out ? 'not-allowed' : 'pointer' }}>
                      {out ? 'Sold out' : 'Add to Cart'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer style={{ background: C.navy, color: C.g400, padding: '40px 20px', marginTop: 40 }}>
        <div style={{ maxWidth: 1320, margin: 'auto', fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 28, color: '#fff', letterSpacing: 2 }}>SPA<span style={{ color: C.gold }}>ZA</span></div>
          <p style={{ marginTop: 8 }}>Operated by Eden Extract (Pty) Ltd · Reg: 2025/756709/07</p>
          <p>5488 Oregon Crescent, Crystal Park, Benoni, 1501 · 076 789 4445</p>
          <p style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <a href="/terms" style={{ color: C.g400 }}>Terms</a>
            <a href="/privacy-policy" style={{ color: C.g400 }}>Privacy</a>
            <a href="/refund-policy" style={{ color: C.g400 }}>Returns</a>
            <a href="/account" style={{ color: C.g400 }}>My Account</a>
          </p>
          <p style={{ marginTop: 16, fontSize: 12, opacity: 0.6 }}>© {new Date().getFullYear()} Spaza. All rights reserved.</p>
        </div>
      </footer>

      {/* CART DRAWER */}
      {cartOpen && (
        <div onClick={() => setCartOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(420px, 100%)', background: '#fff', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: C.navy, color: '#fff', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-bebas)', fontSize: 26, letterSpacing: 1 }}>Your Cart ({count})</h3>
              <button onClick={() => setCartOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', color: C.g400, paddingTop: 60 }}>
                  <div style={{ fontSize: 48 }}>🛒</div>
                  <p style={{ marginTop: 12 }}>Your cart is empty</p>
                </div>
              ) : items.map(item => (
                <div key={item.product.id} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: `1px solid ${C.g100}` }}>
                  <div style={{ width: 64, height: 64, background: C.g100, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
                    {item.product.images && item.product.images.length
                      ? <img src={item.product.images[0]} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                      : emojiFor(item.product.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{item.product.name}</div>
                    <div style={{ color: C.red, fontWeight: 700, fontSize: 15 }}>{money(item.product.price_cents)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <button onClick={() => updateQty(item.product.id, item.quantity - 1)} style={qtyBtn}>−</button>
                      <span style={{ fontSize: 14, minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                      <button onClick={() => updateQty(item.product.id, item.quantity + 1)} style={qtyBtn}>+</button>
                      <button onClick={() => removeItem(item.product.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.g400, cursor: 'pointer', fontSize: 12 }}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {items.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.g200}`, padding: 20 }}>
                <Row label="Subtotal" value={money(totalCents())} />
                <Row label={shippingCents() === 0 ? 'Shipping (free over R500)' : 'Shipping'} value={shippingCents() === 0 ? 'FREE' : money(shippingCents())} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.g100}`, fontWeight: 700, fontSize: 17 }}>
                  <span>Total</span><span style={{ color: C.red }}>{money(grandTotal())}</span>
                </div>
                <button onClick={handleCheckout}
                  style={{ width: '100%', marginTop: 16, background: C.red, color: '#fff', border: 'none', padding: 14, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  Proceed to Checkout
                </button>
                {!authed && <p style={{ fontSize: 12, color: C.g400, textAlign: 'center', marginTop: 8 }}>You&apos;ll be asked to sign in</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const hbtn: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  background: 'none', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer',
  padding: '8px 12px', borderRadius: 8, textDecoration: 'none',
}
const qtyBtn: React.CSSProperties = {
  width: 26, height: 26, border: `1px solid ${'#DDE0E8'}`, background: '#fff',
  borderRadius: 6, cursor: 'pointer', fontSize: 16, lineHeight: 1,
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#5C6472', marginTop: 4 }}>
      <span>{label}</span><span>{value}</span>
    </div>
  )
}


