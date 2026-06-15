'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'

const NAVY = '#0A1628'
const RED = '#D6001C'
const GOLD = '#F5A623'
const GREEN = '#00A651'

interface SellerInfo {
  id: string; store_name: string; plan: string; status: string;
  bank_name?: string | null; bank_account_number?: string | null;
  paystack_bank_code?: string | null; paystack_subaccount_code?: string | null;
  bank_branch_code?: string | null; bank_account_type?: string | null;
  pickup_street?: string | null; pickup_local_area?: string | null; pickup_city?: string | null;
  pickup_zone?: string | null; pickup_code?: string | null; pickup_company?: string | null;
  pickup_contact_name?: string | null; pickup_contact_mobile?: string | null
}
interface Product {
  id: string; name: string; price_cents: number; compare_price_cents: number | null;
  stock_qty: number | null; status: string; images: string[] | null; rejection_reason?: string | null; created_at: string
}
interface Limits { products: number; photos: number }
interface SellerOrder {
  id: string; product_name: string; product_image: string | null; quantity: number;
  unit_price_cents: number; total_cents: number; seller_payout_cents: number; created_at: string;
  tracking_number?: string | null; ready_at?: string | null;
  length_cm?: number | null; width_cm?: number | null; height_cm?: number | null; weight_kg?: number | null;
  orders?: { id: string; order_number: string; status: string; created_at: string; shipping_name: string; shipping_city: string; shipping_province: string } | null;
  refund?: { reason_type: string; reason_note: string | null; status: string; amount_cents: number; requested_at: string } | null
}

const REFUND_REASON: Record<string, string> = {
  defective: 'Faulty / damaged',
  not_as_described: 'Not as described',
  discretionary: 'Buyer changed mind',
}
const REFUND_STATUS: Record<string, string> = {
  requested: 'Refund requested',
  processing: 'Refund processing',
  processed: 'Refunded',
  rejected: 'Refund declined',
  failed: 'Refund failed',
}

const money = (cents: number) =>
  'R ' + (cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function pctOff(price: number, base: number | null): number | null {
  if (!base || base <= price) return null
  return Math.round((1 - price / base) * 100)
}

function statusInfo(status: string): { label: string; color: string } {
  switch (status) {
    case 'active': return { label: 'Active', color: '#1a8f4c' }
    case 'pending': return { label: 'Pending review', color: '#b26a00' }
    case 'rejected': return { label: 'Rejected', color: '#D6001C' }
    case 'draft': return { label: 'Hidden', color: '#888' }
    case 'out_of_stock': return { label: 'Out of stock', color: '#b26a00' }
    case 'removed': return { label: 'Removed by admin', color: '#888' }
    default: return { label: status, color: '#666' }
  }
}

function orderStatusInfo(status?: string): { label: string; color: string } {
  switch (status) {
    case 'paid': return { label: 'Paid', color: '#00A651' }
    case 'processing': return { label: 'Processing', color: '#0A1628' }
    case 'shipped': return { label: 'Shipped', color: '#0A1628' }
    case 'delivered': return { label: 'Delivered', color: '#00A651' }
    case 'cancelled': return { label: 'Cancelled', color: '#D6001C' }
    case 'refunded': return { label: 'Refunded', color: '#888' }
    case 'pending':
    case 'payment_pending': return { label: 'Awaiting payment', color: '#b26a00' }
    default: return { label: status || 'Pending', color: '#b26a00' }
  }
}

export default function SellerDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [seller, setSeller] = useState<SellerInfo | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [limits, setLimits] = useState<Limits>({ products: 5, photos: 2 })
  const [orders, setOrders] = useState<SellerOrder[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [categoryId, setCategoryId] = useState('')

  // banking / payout details
  const [bankName, setBankName] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([])
  const [accountNumber, setAccountNumber] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [accountType, setAccountType] = useState('')
  const [pStreet, setPStreet] = useState('')
  const [pLocalArea, setPLocalArea] = useState('')
  const [pCity, setPCity] = useState('')
  const [pZone, setPZone] = useState('')
  const [pCode, setPCode] = useState('')
  const [pCompany, setPCompany] = useState('')
  const [pContactName, setPContactName] = useState('')
  const [pContactMobile, setPContactMobile] = useState('')
  const [savingPickup, setSavingPickup] = useState(false)
  const [savingBank, setSavingBank] = useState(false)
  const [editingBank, setEditingBank] = useState(false)

  // add-product form
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [base, setBase] = useState('')
  const [stock, setStock] = useState('')
  const [description, setDescription] = useState('')
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [saving, setSaving] = useState(false)

  // inline edit state (one product at a time)
  const [editId, setEditId] = useState<string | null>(null)
  const [ePrice, setEPrice] = useState('')
  const [eBase, setEBase] = useState('')
  const [eStock, setEStock] = useState('')
  const [eStatus, setEStatus] = useState<'active' | 'draft'>('active')
  const [eSaving, setESaving] = useState(false)

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
      const s = json.seller || {}
      setBankName(s.bank_name || '')
      setBankCode(s.paystack_bank_code || '')
      setAccountNumber(s.bank_account_number || '')
      setBranchCode(s.bank_branch_code || '')
      setAccountType(s.bank_account_type || '')
      setPStreet(s.pickup_street || '')
      setPLocalArea(s.pickup_local_area || '')
      setPCity(s.pickup_city || '')
      setPZone(s.pickup_zone || '')
      setPCode(s.pickup_code || '')
      setPCompany(s.pickup_company || '')
      setPContactName(s.pickup_contact_name || '')
      setPContactMobile(s.pickup_contact_mobile || '')

      // seller's sold line items (best-effort; doesn't block the dashboard)
      try {
        const ores = await fetch('/api/seller/orders', { headers: { ...(await authHeaders()) } })
        if (ores.ok) { const oj = await ores.json(); setOrders(oj.orders || []) }
      } catch { /* ignore */ }

      // best-effort: refresh courier tracking for open waybills, then re-pull orders
      try {
        const tr = await fetch('/api/seller/tracking/refresh', { method: 'POST', headers: { ...(await authHeaders()) } })
        if (tr.ok) {
          const tj = await tr.json().catch(() => ({}))
          if (tj.updated > 0) {
            const ores2 = await fetch('/api/seller/orders', { headers: { ...(await authHeaders()) } })
            if (ores2.ok) { const oj2 = await ores2.json(); setOrders(oj2.orders || []) }
          }
        }
      } catch { /* ignore */ }

      // categories for the product form
      try {
        const cres = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/categories?select=id,name&is_active=eq.true&order=sort_order.asc`, {
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` },
        })
        if (cres.ok) setCategories(await cres.json())
      } catch { /* ignore */ }

      // Paystack SA banks for the payout dropdown
      try {
        const bres = await fetch('/api/paystack/banks')
        if (bres.ok) { const bj = await bres.json(); setBanks(bj.banks || []) }
      } catch { /* ignore */ }
    } catch {
      toast.error('Could not load your store')
    }
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  // ----- add form helpers -----
  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return
    const remaining = limits.photos - photoUrls.length
    if (remaining <= 0) { toast.error(`Your ${seller?.plan} plan allows ${limits.photos} photos`); return }
    const chosen = Array.from(files).slice(0, remaining)
    setUploading(true)
    for (const file of chosen) {
      if (!file.type.startsWith('image/')) { toast.error(`${file.name} is not an image`); continue }
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} is larger than 5 MB`); continue }
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await fetch('/api/seller/upload', { method: 'POST', headers: { ...(await authHeaders()) }, body: fd })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json.url) { toast.error(json.error || `Could not upload ${file.name}`); continue }
        setPhotoUrls(prev => [...prev, json.url])
      } catch { toast.error(`Could not upload ${file.name}`) }
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  function removePhoto(i: number) { setPhotoUrls(prev => prev.filter((_, idx) => idx !== i)) }
  function resetForm() {
    setName(''); setPrice(''); setBase(''); setStock(''); setDescription(''); setPhotoUrls([]); setCategoryId(''); setShowForm(false)
  }

  async function handleCreate() {
    if (!name.trim()) return toast.error('Enter a product name')
    const priceNum = parseFloat(price)
    if (!priceNum || priceNum <= 0) return toast.error('Enter a valid selling price')
    const baseNum = base.trim() ? parseFloat(base) : null
    if (baseNum !== null && (!baseNum || baseNum <= priceNum)) return toast.error('Base price must be higher than the selling price (or leave it blank)')

    setSaving(true)
    const images = photoUrls
    try {
      const res = await fetch('/api/seller/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          name: name.trim(), priceRands: priceNum, baseRands: baseNum,
          stockQty: parseInt(stock) || 0, description: description.trim(), images, categoryId,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || 'Could not add product'); setSaving(false); return }
      toast.success('Product added ✓')
      setProducts(prev => [json.product, ...prev])
      resetForm()
    } catch { toast.error('Could not add product') }
    setSaving(false)
  }

  // ----- edit helpers -----
  function startEdit(p: Product) {
    setEditId(p.id)
    setEPrice((p.price_cents / 100).toString())
    setEBase(p.compare_price_cents ? (p.compare_price_cents / 100).toString() : '')
    setEStock((p.stock_qty ?? 0).toString())
    setEStatus(p.status === 'draft' ? 'draft' : 'active')
  }
  function cancelEdit() { setEditId(null) }

  async function handleUpdate(id: string) {
    const priceNum = parseFloat(ePrice)
    if (!priceNum || priceNum <= 0) return toast.error('Enter a valid selling price')
    const baseNum = eBase.trim() ? parseFloat(eBase) : null
    if (baseNum !== null && (!baseNum || baseNum <= priceNum)) return toast.error('Base price must be higher than the selling price (or leave it blank)')

    setESaving(true)
    try {
      const res = await fetch('/api/seller/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, sellingRands: priceNum, baseRands: baseNum, stockQty: parseInt(eStock) || 0, status: eStatus }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || 'Could not update product'); setESaving(false); return }
      toast.success('Product updated ✓')
      setProducts(prev => prev.map(p => (p.id === id ? json.product : p)))
      setEditId(null)
    } catch { toast.error('Could not update product') }
    setESaving(false)
  }

  // ----- banking -----
  async function saveBanking() {
    if (!bankCode || !accountNumber.trim() || !branchCode.trim() || !accountType.trim()) {
      return toast.error('Please choose your bank and complete all payout fields')
    }
    setSavingBank(true)
    try {
      const res = await fetch('/api/seller/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ bankName: bankName.trim(), bankCode, accountNumber: accountNumber.trim(), branchCode: branchCode.trim(), accountType }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || 'Could not save payout details'); setSavingBank(false); return }
      toast.success('Payout details saved ✓')
      setSeller(prev => prev ? { ...prev, ...json.banking } : prev)
      setEditingBank(false)
    } catch { toast.error('Could not save payout details') }
    setSavingBank(false)
  }

  // ----- pickup (collection) address -----
  async function savePickup() {
    if (!pStreet.trim() || !pCity.trim() || !pZone.trim() || !pCode.trim()) {
      return toast.error('Street, city, province and postal code are required')
    }
    if (!pContactName.trim() || !pContactMobile.trim()) {
      return toast.error('A pickup contact name and mobile number are required')
    }
    setSavingPickup(true)
    try {
      const res = await fetch('/api/seller/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          action: 'pickup',
          street: pStreet.trim(), localArea: pLocalArea.trim(), city: pCity.trim(),
          zone: pZone.trim(), code: pCode.trim(), company: pCompany.trim(),
          contactName: pContactName.trim(), contactMobile: pContactMobile.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || 'Could not save pickup address'); setSavingPickup(false); return }
      toast.success('Pickup address saved ✓')
      setSeller(prev => prev ? { ...prev, ...json.pickup } : prev)
    } catch { toast.error('Could not save pickup address') }
    setSavingPickup(false)
  }

  // ----- fulfilment / waybill -----
  const [dims, setDims] = useState<Record<string, { l: string; w: string; h: string; kg: string }>>({})
  const [wbBusy, setWbBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  async function refreshTracking() {
    setRefreshing(true)
    try {
      const tr = await fetch('/api/seller/tracking/refresh', { method: 'POST', headers: { ...(await authHeaders()) } })
      const tj = await tr.json().catch(() => ({}))
      if (!tr.ok) { toast.error(tj.error || 'Could not refresh tracking'); setRefreshing(false); return }
      const ores = await fetch('/api/seller/orders', { headers: { ...(await authHeaders()) } })
      if (ores.ok) { const oj = await ores.json(); setOrders(oj.orders || []) }
      toast.success(tj.updated > 0 ? `Updated ${tj.updated} order${tj.updated === 1 ? '' : 's'}` : 'Tracking up to date')
    } catch { toast.error('Could not refresh tracking') }
    setRefreshing(false)
  }
  function setDim(itemId: string, key: 'l' | 'w' | 'h' | 'kg', val: string) {
    setDims(prev => ({ ...prev, [itemId]: { l: '', w: '', h: '', kg: '', ...prev[itemId], [key]: val } }))
  }
  async function createWaybill(itemId: string) {
    const d = dims[itemId] || { l: '', w: '', h: '', kg: '' }
    if (!d.l || !d.w || !d.h || !d.kg) return toast.error('Enter length, width, height and weight')
    if (!pickupComplete) return toast.error('Set your pickup address first')
    setWbBusy(itemId)
    try {
      const res = await fetch('/api/seller/fulfilment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ orderItemId: itemId, length: parseFloat(d.l), width: parseFloat(d.w), height: parseFloat(d.h), weight: parseFloat(d.kg) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (json.diagnostic) console.log('Courier diagnostic:', json.diagnostic)
        const msg = json.error === 'no_pickup_address' ? 'Set your pickup address first'
          : json.error === 'order_not_paid' ? 'This order is not paid yet'
          : json.diagnostic ? `${json.error} [${json.diagnostic.stage}${json.diagnostic.status ? ' ' + json.diagnostic.status : ''}]`
          : json.error || 'Could not create waybill'
        toast.error(msg); setWbBusy(null); return
      }
      toast.success(`Waybill created ✓ ${json.tracking || ''}`)
      setOrders(prev => prev.map(o => o.id === itemId ? { ...o, tracking_number: json.tracking, ready_at: new Date().toISOString() } : o))
      if (json.labelUrl) window.open(json.labelUrl, '_blank')
    } catch { toast.error('Could not create waybill') }
    setWbBusy(null)
  }
  async function printWaybill(itemId: string) {
    setWbBusy(itemId)
    try {
      const res = await fetch(`/api/seller/fulfilment?orderItemId=${itemId}`, { headers: { ...(await authHeaders()) } })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.labelUrl) { toast.error(json.error || 'Could not fetch waybill'); setWbBusy(null); return }
      window.open(json.labelUrl, '_blank')
    } catch { toast.error('Could not fetch waybill') }
    setWbBusy(null)
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading your store…</div>
  }

  const bankingComplete = !!(seller?.bank_name && seller?.bank_account_number && seller?.bank_branch_code && seller?.bank_account_type)
  const pickupComplete = !!(seller?.pickup_street && seller?.pickup_city && seller?.pickup_zone && seller?.pickup_code && seller?.pickup_contact_name && seller?.pickup_contact_mobile)

  const atLimit = products.length >= limits.products
  const liveAddPct = pctOff(parseFloat(price) || 0, base.trim() ? parseFloat(base) : null)
  const liveEditPct = pctOff(parseFloat(ePrice) || 0, eBase.trim() ? parseFloat(eBase) : null)

  // ----- dashboard summary stats (derived from products + orders) -----
  const SETTLED = new Set(['paid', 'processing', 'shipped', 'delivered'])
  const approvedCount = products.filter(p => p.status === 'active').length
  const settledLines = orders.filter(o => SETTLED.has(o.orders?.status || ''))
  const earningsCents = settledLines.reduce((sum, o) => sum + (o.seller_payout_cents || 0), 0)
  const readyForCourier = settledLines.filter(o => !!o.tracking_number).length
  const pendingWaybill = settledLines.filter(o => !o.tracking_number).length
  const completedCount = orders.filter(o => o.orders?.status === 'delivered').length

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

        {/* summary stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard label="Your earnings" value={money(earningsCents)} color={GREEN} hint="Settled to your account" big />
          <StatCard label="Approved products" value={String(approvedCount)} color={NAVY} />
          <StatCard label="Pending waybill" value={String(pendingWaybill)} color={pendingWaybill > 0 ? '#b26a00' : NAVY} hint="Paid — needs a waybill" />
          <StatCard label="Ready for courier" value={String(readyForCourier)} color={readyForCourier > 0 ? GREEN : NAVY} hint="Waybill created" />
          <StatCard label="Completed" value={String(completedCount)} color={NAVY} hint="Delivered" />
        </div>

        {/* payout / banking details */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>Payout details</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>Where we send your earnings. Required before you can list products.</div>
            </div>
            {bankingComplete && !editingBank && (
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1a8f4c' }}>✓ On file</span>
            )}
          </div>

          {(!bankingComplete || editingBank) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              {!bankingComplete && (
                <div style={{ fontSize: 13, color: '#b26a00', background: '#fff7f0', border: `1px solid ${GOLD}55`, borderRadius: 8, padding: '10px 12px' }}>
                  Add your banking details to start listing products.
                </div>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Bank</span>
                <select value={bankCode} onChange={e => { setBankCode(e.target.value); const b = banks.find(x => x.code === e.target.value); setBankName(b ? b.name : '') }}
                  style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none', background: '#fff' }}>
                  <option value="">{banks.length ? 'Select your bank…' : 'Loading banks…'}</option>
                  {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px' }}><Field label="Account number" value={accountNumber} onChange={setAccountNumber} placeholder="1234567890" /></div>
                <div style={{ flex: '1 1 120px' }}><Field label="Branch code" value={branchCode} onChange={setBranchCode} placeholder="250655" /></div>
                <label style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Account type</span>
                  <select value={accountType} onChange={e => setAccountType(e.target.value)}
                    style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none', background: '#fff' }}>
                    <option value="">Select…</option>
                    <option value="cheque">Cheque / Current</option>
                    <option value="savings">Savings</option>
                    <option value="transmission">Transmission</option>
                    <option value="business">Business</option>
                  </select>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveBanking} disabled={savingBank}
                  style={{ background: RED, color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: savingBank ? 'default' : 'pointer', opacity: savingBank ? 0.7 : 1 }}>
                  {savingBank ? 'Saving…' : 'Save payout details'}
                </button>
                {bankingComplete && <button onClick={() => setEditingBank(false)} style={{ background: 'none', border: '1px solid #ccc', color: '#555', padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Cancel</button>}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, color: NAVY, lineHeight: 1.6 }}>
                <div><b>{seller?.bank_name}</b> · <span style={{ textTransform: 'capitalize' }}>{seller?.bank_account_type}</span></div>
                <div style={{ color: '#666' }}>Acc {seller?.bank_account_number} · Branch {seller?.bank_branch_code}</div>
              </div>
              <button onClick={() => setEditingBank(true)} style={{ background: 'none', border: `1px solid ${NAVY}33`, color: NAVY, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
            </div>
          )}
        </div>

        {/* pickup (collection) address */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>Pickup address</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: pickupComplete ? GREEN : '#b26a00' }}>{pickupComplete ? '✓ Set' : 'Needed for courier collection'}</span>
          </div>
          <p style={{ fontSize: 13, color: '#666', margin: '6px 0 14px' }}>Where The Courier Guy collects your parcels. Needed before you can create a waybill.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Company / store (optional)" value={pCompany} onChange={setPCompany} placeholder="Eden Extract" />
            <Field label="Street address" value={pStreet} onChange={setPStreet} placeholder="12 Main Road" />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}><Field label="Suburb / area" value={pLocalArea} onChange={setPLocalArea} placeholder="Crystal Park" /></div>
              <div style={{ flex: '1 1 160px' }}><Field label="City" value={pCity} onChange={setPCity} placeholder="Benoni" /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}><Field label="Province" value={pZone} onChange={setPZone} placeholder="Gauteng" /></div>
              <div style={{ flex: '1 1 120px' }}><Field label="Postal code" value={pCode} onChange={setPCode} placeholder="1501" /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}><Field label="Contact name" value={pContactName} onChange={setPContactName} placeholder="Navhani" /></div>
              <div style={{ flex: '1 1 160px' }}><Field label="Contact mobile" value={pContactMobile} onChange={setPContactMobile} placeholder="0821234567" /></div>
            </div>
            <div>
              <button onClick={savePickup} disabled={savingPickup}
                style={{ background: RED, color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: savingPickup ? 'default' : 'pointer', opacity: savingPickup ? 0.7 : 1 }}>
                {savingPickup ? 'Saving…' : 'Save pickup address'}
              </button>
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          {!showForm ? (
            <button onClick={() => {
                if (!bankingComplete) { toast.error('Add your payout details before listing products'); return }
                if (atLimit) { toast.error(`You've reached your ${limits.products}-product limit`); return }
                setShowForm(true)
              }}
              style={{ background: (atLimit || !bankingComplete) ? '#bbb' : RED, color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: (atLimit || !bankingComplete) ? 'not-allowed' : 'pointer' }}>
              + Add a product
            </button>
          ) : (
            <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 16px', color: NAVY, fontSize: 17 }}>New product</h3>
              <div style={{ fontSize: 12, color: '#7a5b00', background: '#fff7f0', border: `1px solid ${GOLD}55`, borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                New products are reviewed by our team before they go live. You&apos;ll see status “Pending review” until approved.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Product name" value={name} onChange={setName} placeholder="Soursop Powder 50g" />
                {categories.length > 0 && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Category</span>
                    <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                      style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none', background: '#fff' }}>
                      <option value="">Select a category…</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}><Field label="Selling price (R)" value={price} onChange={setPrice} placeholder="149.00" type="number" /></div>
                  <div style={{ flex: 1 }}><Field label="Base price (R, optional)" value={base} onChange={setBase} placeholder="199.00" type="number" /></div>
                  <div style={{ flex: 1 }}><Field label="Stock quantity" value={stock} onChange={setStock} placeholder="20" type="number" /></div>
                </div>
                {liveAddPct !== null && (
                  <div style={{ fontSize: 13, color: GREEN, fontWeight: 700 }}>{liveAddPct}% off — buyers see the base price struck through.</div>
                )}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Description (optional)</span>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe your product…"
                    style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </label>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Photos (up to {limits.photos})</span>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    {photoUrls.map((u, i) => (
                      <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid #ddd' }}>
                        <img src={u} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={() => removePhoto(i)} title="Remove"
                          style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 13, lineHeight: 1, cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                    {photoUrls.length < limits.photos && (
                      <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                        style={{ width: 80, height: 80, borderRadius: 8, border: `1px dashed ${RED}`, background: '#fff7f7', color: RED, cursor: uploading ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        {uploading ? <span style={{ fontSize: 12 }}>Uploading…</span> : <><span style={{ fontSize: 22, lineHeight: 1 }}>+</span><span style={{ fontSize: 11, fontWeight: 600 }}>Photo</span></>}
                      </button>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />
                  <p style={{ fontSize: 12, color: '#999', marginTop: 6 }}>JPG, PNG or WebP · up to 5 MB each.</p>
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
            {products.map(p => {
              const isEditing = editId === p.id
              const rowPct = pctOff(p.price_cents, p.compare_price_cents)
              return (
                <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 8, background: '#f0f1f4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {p.images && p.images.length ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>🛒</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: NAVY, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        Stock: {p.stock_qty ?? 0} · <span style={{ fontWeight: 600, color: statusInfo(p.status).color }}>{statusInfo(p.status).label}</span>
                      </div>
                      {p.status === 'rejected' && p.rejection_reason && (
                        <div style={{ fontSize: 12, color: RED, marginTop: 2 }}>Reason: {p.rejection_reason}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end' }}>
                        <span style={{ fontFamily: 'var(--font-bebas)', color: RED, fontSize: 22 }}>{money(p.price_cents)}</span>
                        {rowPct !== null && <span style={{ fontSize: 12, color: '#aaa', textDecoration: 'line-through' }}>{money(p.compare_price_cents!)}</span>}
                      </div>
                      {rowPct !== null && <div style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>{rowPct}% off</div>}
                    </div>
                    {!isEditing && (
                      <button onClick={() => startEdit(p)} style={{ marginLeft: 6, background: 'none', border: `1px solid ${NAVY}33`, color: NAVY, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                    )}
                  </div>

                  {isEditing && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #eee' }}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 120px' }}><Field label="Selling price (R)" value={ePrice} onChange={setEPrice} type="number" /></div>
                        <div style={{ flex: '1 1 120px' }}><Field label="Base price (R, optional)" value={eBase} onChange={setEBase} type="number" /></div>
                        <div style={{ flex: '1 1 100px' }}><Field label="Stock" value={eStock} onChange={setEStock} type="number" /></div>
                        {(p.status === 'active' || p.status === 'draft' || p.status === 'out_of_stock') ? (
                          <label style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Visibility</span>
                            <select value={eStatus} onChange={e => setEStatus(e.target.value as 'active' | 'draft')}
                              style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none', background: '#fff' }}>
                              <option value="active">Active (visible)</option>
                              <option value="draft">Hidden</option>
                            </select>
                          </label>
                        ) : (
                          <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Status</span>
                            <div style={{ padding: '12px 14px', border: '1px solid #eee', borderRadius: 10, fontSize: 13, color: statusInfo(p.status).color, fontWeight: 600, background: '#fafbfc' }}>
                              {statusInfo(p.status).label}
                            </div>
                          </div>
                        )}
                      </div>
                      {liveEditPct !== null && <div style={{ fontSize: 13, color: GREEN, fontWeight: 700, marginTop: 10 }}>{liveEditPct}% off</div>}
                      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button onClick={() => handleUpdate(p.id)} disabled={eSaving}
                          style={{ background: RED, color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: eSaving ? 'default' : 'pointer', opacity: eSaving ? 0.7 : 1 }}>
                          {eSaving ? 'Saving…' : 'Save changes'}
                        </button>
                        <button onClick={cancelEdit} style={{ background: 'none', border: '1px solid #ccc', color: '#555', padding: '10px 18px', borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* your orders (what this seller has sold) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '28px 0 12px', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ color: NAVY, fontSize: 17, margin: 0 }}>Your orders</h3>
          {orders.some(o => o.tracking_number) && (
            <button onClick={refreshTracking} disabled={refreshing}
              style={{ background: 'none', border: `1px solid ${NAVY}33`, color: NAVY, borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.6 : 1 }}>
              {refreshing ? 'Refreshing…' : '↻ Refresh tracking'}
            </button>
          )}
        </div>
        {orders.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', color: '#999' }}>No orders yet. When a buyer purchases your products, they&apos;ll appear here.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map(o => (
              <div key={o.id} style={{ background: '#fff', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', flexWrap: 'wrap' }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f0f1f4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {o.product_image ? <img src={o.product_image} alt={o.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🛒</span>}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, color: NAVY, fontSize: 14 }}>{o.product_name} <span style={{ color: '#aaa', fontWeight: 400 }}>× {o.quantity}</span></div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {o.orders?.order_number} · {o.orders ? new Date(o.orders.created_at).toLocaleDateString('en-ZA') : ''} ·{' '}
                    <span style={{ fontWeight: 600, color: orderStatusInfo(o.orders?.status).color }}>{orderStatusInfo(o.orders?.status).label}</span>
                  </div>
                  {o.orders?.shipping_name && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Ship to: {o.orders.shipping_name}{o.orders.shipping_city ? `, ${o.orders.shipping_city}` : ''}{o.orders.shipping_province ? `, ${o.orders.shipping_province}` : ''}</div>
                  )}
                  {o.refund && (
                    <div style={{ marginTop: 6, display: 'inline-flex', flexDirection: 'column', gap: 2, background: '#fff6f6', border: `1px solid ${RED}33`, borderRadius: 8, padding: '6px 10px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: RED }}>
                        {REFUND_STATUS[o.refund.status] || 'Refund'} · {REFUND_REASON[o.refund.reason_type] || o.refund.reason_type}
                      </span>
                      {o.refund.reason_note && (
                        <span style={{ fontSize: 12, color: '#8a4b4b', fontStyle: 'italic' }}>“{o.refund.reason_note}”</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-bebas)', color: NAVY, fontSize: 20 }}>{money(o.total_cents)}</div>
                  <div style={{ fontSize: 11, color: GREEN }}>You earn {money(o.seller_payout_cents)}</div>
                </div>

                {/* fulfilment / waybill */}
                <div style={{ flexBasis: '100%', borderTop: '1px solid #eee', paddingTop: 10, marginTop: 2 }}>
                  {o.tracking_number ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>✓ Ready for courier</span>
                      <span style={{ fontSize: 12, color: '#666' }}>Waybill {o.tracking_number}</span>
                      <button onClick={() => printWaybill(o.id)} disabled={wbBusy === o.id}
                        style={{ background: NAVY, color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {wbBusy === o.id ? 'Fetching…' : 'Print waybill'}
                      </button>
                    </div>
                  ) : o.orders?.status === 'paid' ? (
                    <div>
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Enter parcel size &amp; weight to create the courier waybill:</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <DimInput ph="L cm" value={dims[o.id]?.l || ''} onChange={(v: string) => setDim(o.id, 'l', v)} />
                        <DimInput ph="W cm" value={dims[o.id]?.w || ''} onChange={(v: string) => setDim(o.id, 'w', v)} />
                        <DimInput ph="H cm" value={dims[o.id]?.h || ''} onChange={(v: string) => setDim(o.id, 'h', v)} />
                        <DimInput ph="kg" value={dims[o.id]?.kg || ''} onChange={(v: string) => setDim(o.id, 'kg', v)} />
                        <button onClick={() => createWaybill(o.id)} disabled={wbBusy === o.id}
                          style={{ background: RED, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: wbBusy === o.id ? 'default' : 'pointer', opacity: wbBusy === o.id ? 0.7 : 1 }}>
                          {wbBusy === o.id ? 'Creating…' : 'Create waybill & mark ready'}
                        </button>
                      </div>
                      {!pickupComplete && <div style={{ fontSize: 12, color: '#b26a00', marginTop: 6 }}>⚠ Set your pickup address above before creating a waybill.</div>}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#999' }}>Fulfilment opens once the order is paid.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color = NAVY, hint, big = false }: { label: string; value: string; color?: string; hint?: string; big?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
      <div style={{ fontSize: big ? 26 : 30, fontWeight: 800, color, fontFamily: 'var(--font-bebas)', marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {hint ? <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{hint}</div> : null}
    </div>
  )
}

function DimInput({ ph, value, onChange }: { ph: string; value: string; onChange: (v: string) => void }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={ph} inputMode="decimal"
      style={{ width: 70, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, outline: 'none' }} />
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
    </label>
  )
}

