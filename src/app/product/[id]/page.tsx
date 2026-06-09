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

  // reviews
  const [reviews, setReviews] = useState<{ id: string; rating: number; title: string | null; body: string | null; created_at: string }[]>([])
  const [canReview, setCanReview] = useState(false)
  const [myRating, setMyRating] = useState(0)
  const [myTitle, setMyTitle] = useState('')
  const [myBody, setMyBody] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

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

        // approved reviews for this product
        try {
          const rres = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/reviews?select=id,rating,title,body,created_at&product_id=eq.${id}&is_approved=eq.true&order=created_at.desc`,
            { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` } }
          )
          if (rres.ok && on) setReviews(await rres.json())
        } catch { /* ignore */ }

        // can the signed-in user review? (purchased + not yet reviewed)
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const uid = session?.user?.id
          const tok = session?.access_token
          if (uid && tok) {
            const headers = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${tok}` }
            const bought = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/order_items?select=id,orders!inner(buyer_id)&product_id=eq.${id}&orders.buyer_id=eq.${uid}&limit=1`, { headers })
            const already = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/reviews?select=id&product_id=eq.${id}&buyer_id=eq.${uid}&limit=1`, { headers })
            const boughtRows = bought.ok ? await bought.json() : []
            const reviewedRows = already.ok ? await already.json() : []
            if (on) setCanReview(boughtRows.length > 0 && reviewedRows.length === 0)
          }
        } catch { /* ignore */ }
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

  async function submitReview() {
    if (myRating < 1) return toast.error('Please choose a star rating')
    setSubmittingReview(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const tok = session?.access_token
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ productId: id, rating: myRating, title: myTitle.trim(), body: myBody.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || 'Could not submit review'); setSubmittingReview(false); return }
      toast.success('Thanks! Your review will appear once approved.')
      setCanReview(false); setMyRating(0); setMyTitle(''); setMyBody('')
    } catch { toast.error('Could not submit review') }
    setSubmittingReview(false)
  }

  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0

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

      {/* reviews */}
      <div style={{ maxWidth: 1100, margin: 'auto', padding: '8px 20px 40px' }}>
        <div style={{ borderTop: `1px solid ${C.g200}`, paddingTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 20, color: C.navy, margin: 0 }}>Reviews</h2>
            {reviews.length > 0 && (
              <span style={{ color: C.g600, fontSize: 14 }}>
                <span style={{ color: C.gold }}>{'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))}</span>{' '}
                {avgRating.toFixed(1)} · {reviews.length} review{reviews.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {canReview && (
            <div style={{ background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginTop: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 10 }}>Write a review</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setMyRating(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, lineHeight: 1, color: n <= myRating ? C.gold : '#d6d9e0', padding: 0 }}>★</button>
                ))}
              </div>
              <input value={myTitle} onChange={e => setMyTitle(e.target.value)} placeholder="Title (optional)"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
              <textarea value={myBody} onChange={e => setMyBody(e.target.value)} rows={3} placeholder="Share your experience with this product…"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              <button onClick={submitReview} disabled={submittingReview}
                style={{ marginTop: 12, background: C.red, color: '#fff', border: 'none', padding: '11px 22px', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: submittingReview ? 'default' : 'pointer', opacity: submittingReview ? 0.7 : 1 }}>
                {submittingReview ? 'Submitting…' : 'Submit review'}
              </button>
              <p style={{ fontSize: 12, color: C.g400, marginTop: 8 }}>Your review is published after a quick check.</p>
            </div>
          )}

          {reviews.length === 0 ? (
            <p style={{ color: C.g600, marginTop: 16 }}>No reviews yet{canReview ? ' — be the first!' : '.'}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              {reviews.map(r => (
                <div key={r.id} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: C.gold, fontSize: 16 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    <span style={{ fontSize: 12, color: C.g400 }}>{new Date(r.created_at).toLocaleDateString('en-ZA')} · Verified purchase</span>
                  </div>
                  {r.title && <div style={{ fontWeight: 700, color: C.navy, marginTop: 8 }}>{r.title}</div>}
                  {r.body && <p style={{ fontSize: 14, color: C.g800, margin: '6px 0 0', lineHeight: 1.5 }}>{r.body}</p>}
                </div>
              ))}
            </div>
          )}
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
