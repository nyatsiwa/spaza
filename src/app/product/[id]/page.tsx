'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useCartStore } from '@/lib/store/cart'

const C = {
  red: '#E3001B', navy: '#0A1628', slate: '#1E3A5F', gold: '#F5A623',
  offWhite: '#F7F8FA', white: '#FFFFFF',
  g100: '#EEF0F4', g200: '#DDE0E8', g400: '#9BA3B0', g600: '#5C6472', g800: '#2D3340',
  green: '#00A651',
}

interface Product {
  id: string
  name: string
  description: string | null
  price_cents: number
  compare_price_cents: number | null
  stock_qty: number | null
  images: string[] | null
  seller_id: string
  sellers?: { store_name: string } | null
}

const money = (cents: number) =>
  'R ' + (cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function emojiFor(name: string) {
  const n = (name || '').toLowerCase()
  if (n.includes('soursop')) return '🌿'
  if (n.includes('dragon')) return '🐉'
  if (n.includes('plant') || n.includes('tree')) return '🌱'
  return '🛒'
}

export default function ProductDetailPage() {
  const params = useParams()
  const id = (params?.id as string) || ''
  const router = useRouter()
  const addItem = useCartStore(s => s.addItem)

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(0)

  // hover magnifier (desktop)
  const [zoom, setZoom] = useState<React.CSSProperties>({ transform: 'scale(1)' })

  // lightbox (full screen)
  const [lbOpen, setLbOpen] = useState(false)
  const [lbZoom, setLbZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef({ active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 })

  useEffect(() => {
    let on = true
    ;(async () => {
      if (!id) { setLoading(false); return }
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products`
        + `?select=id,name,description,price_cents,compare_price_cents,stock_qty,images,seller_id,sellers(store_name)`
        + `&id=eq.${id}&status=eq.active&limit=1`
      try {
        const res = await fetch(url, {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
        })
        const rows = res.ok ? await res.json() : []
        if (on) setProduct(rows[0] || null)
      } catch {
        if (on) setProduct(null)
      } finally {
        if (on) setLoading(false)
      }
    })()
    return () => { on = false }
  }, [id])

  const images = product?.images && product.images.length ? product.images : []
  const hasImg = images.length > 0
  const stock = product?.stock_qty ?? 0
  const out = stock <= 0
  const pct =
    product && product.compare_price_cents && product.compare_price_cents > product.price_cents
      ? Math.round((1 - product.price_cents / product.compare_price_cents) * 100)
      : null

  // --- hover magnifier ---
  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100
    const y = ((e.clientY - r.top) / r.height) * 100
    setZoom({ transformOrigin: `${x}% ${y}%`, transform: 'scale(2.5)' })
  }
  function onLeave() { setZoom({ transform: 'scale(1)' }) }

  // --- lightbox ---
  function openLightbox() { setLbOpen(true); setLbZoom(1); setPan({ x: 0, y: 0 }) }
  function closeLightbox() { setLbOpen(false) }

  function onPointerDown(e: React.PointerEvent) {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    drag.current = { active: true, moved: false, sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active || lbZoom === 1) return
    const dx = e.clientX - drag.current.sx
    const dy = e.clientY - drag.current.sy
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true
    setPan({ x: drag.current.ox + dx, y: drag.current.oy + dy })
  }
  function onPointerUp() {
    const wasDrag = drag.current.moved
    drag.current.active = false
    if (wasDrag) return
    // a tap (not a drag) toggles zoom
    if (lbZoom === 1) setLbZoom(2.5)
    else { setLbZoom(1); setPan({ x: 0, y: 0 }) }
  }

  function addToCart() {
    if (!product || out) return
    addItem({ id: product.id, name: product.name, price_cents: product.price_cents, images, seller_id: product.seller_id })
    toast.success('Added to cart ✓')
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', background: C.offWhite }}>Loading…</div>
  }
  if (!product) {
    return (
      <div style={{ minHeight: '100vh', background: C.offWhite, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ color: C.navy, margin: 0 }}>Product not available</h2>
        <p style={{ color: C.g600 }}>This product may have been removed or hidden by the seller.</p>
        <Link href="/" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>← Back to store</Link>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans)', background: C.offWhite, color: C.g800, minHeight: '100vh' }}>
      {/* header */}
      <div style={{ background: C.red, padding: '0 20px', height: 60, display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: 1100, margin: 'auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 30, color: C.white, letterSpacing: 2, textDecoration: 'none' }}>SPA<span style={{ color: C.gold }}>ZA</span></Link>
          <Link href="/" style={{ color: '#fff', fontSize: 13, textDecoration: 'none' }}>← Back to store</Link>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: 'auto', padding: '28px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32 }}>
        {/* gallery */}
        <div>
          <div
            onMouseMove={hasImg ? onMove : undefined}
            onMouseLeave={hasImg ? onLeave : undefined}
            onClick={hasImg ? openLightbox : undefined}
            style={{ width: '100%', aspectRatio: '1 / 1', background: C.white, borderRadius: 14, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: hasImg ? 'zoom-in' : 'default', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            {hasImg
              ? <img src={images[active]} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain', transition: 'transform 0.12s ease-out', ...zoom }} />
              : <span style={{ fontSize: 100 }}>{emojiFor(product.name)}</span>}
          </div>
          {hasImg && <p style={{ fontSize: 12, color: C.g400, marginTop: 8, textAlign: 'center' }}>Hover to magnify · click for full screen</p>}
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              {images.map((u, i) => (
                <button key={i} onClick={() => setActive(i)}
                  style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: i === active ? `2px solid ${C.red}` : '1px solid #ddd', padding: 0, cursor: 'pointer', background: '#fff' }}>
                  <img src={u} alt={`View ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* info */}
        <div>
          <div style={{ fontSize: 13, color: C.g600, marginBottom: 6 }}>{product.sellers?.store_name || 'Eden Extract'}</div>
          <h1 style={{ fontSize: 26, color: C.navy, margin: '0 0 14px', lineHeight: 1.2 }}>{product.name}</h1>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-bebas)', color: C.red, fontSize: 38, letterSpacing: 0.5 }}>{money(product.price_cents)}</span>
            {pct !== null && (
              <>
                <span style={{ fontSize: 16, color: C.g400, textDecoration: 'line-through' }}>{money(product.compare_price_cents!)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: C.green, borderRadius: 6, padding: '3px 8px' }}>{pct}% OFF</span>
              </>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            {out
              ? <span style={{ fontSize: 14, fontWeight: 700, color: C.red }}>Out of stock</span>
              : stock <= 5
                ? <span style={{ fontSize: 14, fontWeight: 600, color: C.gold }}>Only {stock} left</span>
                : <span style={{ fontSize: 14, fontWeight: 600, color: C.green }}>In stock</span>}
          </div>

          {product.description && (
            <p style={{ marginTop: 18, fontSize: 15, lineHeight: 1.6, color: C.g800, whiteSpace: 'pre-wrap' }}>{product.description}</p>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <button onClick={addToCart} disabled={out}
              style={{ background: out ? '#c9ccd2' : C.red, color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: out ? 'not-allowed' : 'pointer' }}>
              {out ? 'Sold out' : 'Add to Cart'}
            </button>
            <button onClick={() => router.push('/checkout')}
              style={{ background: 'none', color: C.navy, border: `1px solid ${C.g200}`, padding: '14px 28px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Go to checkout
            </button>
          </div>
        </div>
      </div>

      {/* lightbox */}
      {lbOpen && hasImg && (
        <div onClick={closeLightbox}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 3000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 16 }}>
            <button onClick={closeLightbox} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 30, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          <div
            onClick={e => e.stopPropagation()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', touchAction: 'none', cursor: lbZoom === 1 ? 'zoom-in' : 'grab' }}>
            <img src={images[active]} alt={product.name} draggable={false}
              style={{ maxWidth: '92%', maxHeight: '100%', objectFit: 'contain', transform: `translate(${pan.x}px, ${pan.y}px) scale(${lbZoom})`, transition: drag.current.active ? 'none' : 'transform 0.15s', userSelect: 'none' }} />
          </div>
          <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, padding: 6 }}>{lbZoom === 1 ? 'Tap image to zoom in' : 'Drag to pan · tap to reset'}</div>
          {images.length > 1 && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '10px 16px 20px', flexWrap: 'wrap' }}>
              {images.map((u, i) => (
                <button key={i} onClick={() => { setActive(i); setLbZoom(1); setPan({ x: 0, y: 0 }) }}
                  style={{ width: 56, height: 56, borderRadius: 6, overflow: 'hidden', border: i === active ? `2px solid ${C.gold}` : '1px solid #555', padding: 0, cursor: 'pointer', background: 'none' }}>
                  <img src={u} alt={`View ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
