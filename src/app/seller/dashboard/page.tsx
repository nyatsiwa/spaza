'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'

const NAVY = '#0A1628'
const RED = '#D6001C'
const GOLD = '#F5A623'

interface SellerInfo { id: string; store_name: string; plan: string; status: string }
interface Product {
  id: string; name: string; price_cents: number; stock_qty: number | null;
  status: string; images: string[] | null; created_at: string
}
interface Limits { products: number; photos: number }

const money = (cents: number) =>
  'R ' + (cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function SellerDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [seller, setSeller] = useState<SellerInfo | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [limits, setLimits] = useState<Limits>({ products: 5, photos: 2 })

  // add-product form
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)

  async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession()
    const t = data.session?.access_token
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login?redirect=/seller/dashboard'); return }

    try {
      const res = await fetch('/api/seller/products', { headers: { ...(await authHeaders()) } })
      if (res.status === 403) { toast.error('You are not a seller yet'); router.push('/sell'); return }
      if (!res.ok) { toast.error('Could not load your store'); setLoading(false); return }
      const json = await res.json()
      setSeller(json.seller)
      setProducts(json.products || [])
      setLimits(json.limits || { products: 5, photos: 2 })
    } catch {
      toast.error('Could not load your store')
    }
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  function setUrl(i: number, v: string) {
    setImageUrls(prev => prev.map((u, idx) => (idx === i ? v : u)))
  }
  function addUrlField() {
    if (imageUrls.length >= limits.photos) { toast.error(`Your ${seller?.plan} plan allows ${limits.photos} photos`); return }
    setImageUrls(prev => [...prev, ''])
  }
  function removeUrlField(i: number) {
    setImageUrls(prev => prev.filter((_, idx) => idx !== i))
  }
  function resetForm() {
    setName(''); setPrice(''); setStock(''); setDescription(''); setImageUrls(['']); setShowForm(false)
  }

  async function handleCreate() {
    if (!name.trim()) return toast.error('Enter a product name')
    const priceNum = parseFloat(price)
    if (!priceNum || priceNum <= 0) return toast.error('Enter a valid price')

    setSaving(true)
    const images = imageUrls.map(u => u.trim()).filter(Boolean)
    try {
      const res = await fetch('/api/seller/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          name: name.trim(),
          priceRands: priceNum,
          stockQty: parseInt(stock) || 0,
          description: description.trim(),
          images,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || 'Could not add product'); setSaving(false); return }
      toast.success('Product added ✓')
      setProducts(prev => [json.product, ...prev])
      resetForm()
    } catch {
      toast.error('Could not add product')
    }
    setSaving(false)
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading your store…</div>
  }

  const atLimit = products.length >= limits.products

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7' }}>
      {/* header */}
      <div style={{ background: NAVY, color: '#fff', padding: '20px 0' }}>
        <div style={{ maxWidth: 900, margin: 'auto', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <a href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 28, color: '#fff', letterSpacing: 1, textDecoration: 'none' }}>SPA<span style={{ color: GOLD }}>ZA</span></a>
            <span style={{ marginLeft: 12, fontSize: 13, opacity: 0.7 }}>Seller Dashboard</span>
          </div>
          <a href="/account" style={{ color: '#fff', fontSize: 13, textDecoration: 'none', opacity: 0.85 }}>← My account</a>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: 'auto', padding: '24px 20px' }}>
        {/* store summary */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{seller?.store_name}</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                {seller?.plan === 'growth' ? 'Growth plan · R70/mo' : 'Free plan'} ·{' '}
                <span style={{ textTransform: 'capitalize', color: seller?.status === 'active' ? '#1a8f4c' : '#b26a00', fontWeight: 600 }}>{seller?.status}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: NAVY, fontFamily: 'var(--font-bebas)' }}>{products.length}/{limits.products}</div>
              <div style={{ fontSize: 12, color: '#888' }}>products listed</div>
            </div>
          </div>
          {seller?.plan === 'free' && (
            <div style={{ marginTop: 14, fontSize: 13, color: '#666', background: '#fff7f0', border: `1px solid ${GOLD}55`, borderRadius: 8, padding: '10px 12px' }}>
              On Growth (R70/mo) you can list up to 10 products with 3 photos each and pay only 5% commission. <a href="/sell" style={{ color: RED, fontWeight: 600 }}>Upgrade →</a>
            </div>
          )}
        </div>

        {/* add product */}
        <div style={{ marginBottom: 20 }}>
          {!showForm ? (
            <button
              onClick={() => { if (atLimit) { toast.error(`You've reached your ${limits.products}-product limit`); return } setShowForm(true) }}
              style={{ background: atLimit ? '#bbb' : RED, color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: atLimit ? 'not-allowed' : 'pointer' }}>
              + Add a product
            </button>
          ) : (
            <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 16px', color: NAVY, fontSize: 17 }}>New product</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Product name" value={name} onChange={setName} placeholder="Soursop Powder 50g" />
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}><Field label="Price (R)" value={price} onChange={setPrice} placeholder="149.00" type="number" /></div>
                  <div style={{ flex: 1 }}><Field label="Stock quantity" value={stock} onChange={setStock} placeholder="20" type="number" /></div>
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Description (optional)</span>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe your product…"
                    style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </label>

                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Photo URLs (up to {limits.photos})</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                    {imageUrls.map((u, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8 }}>
                        <input value={u} onChange={e => setUrl(i, e.target.value)} placeholder="https://…/photo.jpg"
                          style={{ flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none' }} />
                        {imageUrls.length > 1 && (
                          <button onClick={() => removeUrlField(i)} style={{ background: '#eee', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}>×</button>
                        )}
                      </div>
                    ))}
                  </div>
                  {imageUrls.length < limits.photos && (
                    <button onClick={addUrlField} style={{ marginTop: 8, background: 'none', border: `1px dashed ${RED}`, color: RED, borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>+ Add another photo</button>
                  )}
                  <p style={{ fontSize: 12, color: '#999', marginTop: 6 }}>Paste image links for now. (Photo upload coming next.)</p>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button onClick={handleCreate} disabled={saving}
                    style={{ background: RED, color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Adding…' : 'Add product'}
                  </button>
                  <button onClick={resetForm} style={{ background: 'none', border: '1px solid #ccc', color: '#555', padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* product list */}
        <h3 style={{ color: NAVY, fontSize: 17, marginBottom: 12 }}>Your products</h3>
        {products.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', color: '#999' }}>No products yet. Add your first one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {products.map(p => (
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, background: '#f0f1f4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {p.images && p.images.length
                    ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 24 }}>🛒</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: NAVY, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    Stock: {p.stock_qty ?? 0} · <span style={{ textTransform: 'capitalize', color: p.status === 'active' ? '#1a8f4c' : '#b26a00' }}>{p.status}</span>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-bebas)', color: RED, fontSize: 22 }}>{money(p.price_cents)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
    </label>
  )
}
