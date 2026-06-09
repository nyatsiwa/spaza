'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'

const NAVY = '#0A1628'
const RED = '#D6001C'

const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
]

interface ProfileForm {
  full_name: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  province: string
  postal_code: string
}

const EMPTY: ProfileForm = {
  full_name: '', phone: '', address_line1: '', address_line2: '',
  city: '', province: '', postal_code: '',
}

export default function AccountPage() {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState<ProfileForm>(EMPTY)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [seller, setSeller] = useState<{ store_name: string; plan: string; status: string; store_slug: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?redirect=/account'); return }
      if (active) setEmail(user.email || '')

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone, address_line1, address_line2, city, province, postal_code, role')
        .eq('id', user.id)
        .single()

      if (active && data && !error) {
        setForm({
          full_name:     data.full_name     || '',
          phone:         data.phone          || '',
          address_line1: data.address_line1  || '',
          address_line2: data.address_line2  || '',
          city:          data.city           || '',
          province:      data.province       || '',
          postal_code:   data.postal_code    || '',
        })
        if (active) setIsAdmin(data.role === 'admin')
      }

      // Is this user also a seller? (sellers table is the source of truth —
      // not profiles.role). Drives the store card vs. "become a seller" CTA.
      const { data: sellerRow } = await supabase
        .from('sellers')
        .select('store_name, plan, status, store_slug')
        .eq('user_id', user.id)
        .maybeSingle()
      if (active) setSeller(sellerRow ?? null)

      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [router, supabase])

  function set<K extends keyof ProfileForm>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.full_name.trim())     return toast.error('Please enter your name')
    if (!form.address_line1.trim()) return toast.error('Please enter your street address')
    if (!form.city.trim())          return toast.error('Please enter your city')
    if (!form.province)             return toast.error('Please select your province')
    if (!form.postal_code.trim())   return toast.error('Please enter your postal code')

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); router.push('/login?redirect=/account'); return }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name:     form.full_name.trim(),
        phone:         form.phone.trim() || null,
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim() || null,
        city:          form.city.trim(),
        province:      form.province,
        postal_code:   form.postal_code.trim(),
      })
      .eq('id', user.id)
    setSaving(false)

    if (error) { toast.error(error.message); return }
    toast.success('Address saved ✓')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/')
    router.refresh()
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
        Loading your account…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7', padding: '24px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: NAVY, padding: '24px 28px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 30, letterSpacing: 1 }}>
              SPA<span style={{ color: '#F4B400' }}>ZA</span>
            </div>
            <p style={{ opacity: 0.8, fontSize: 13, marginTop: 2 }}>My account · {email}</p>
          </div>
          <button onClick={handleLogout}
            style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>

        <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {seller ? (
            <div style={{ border: '1px solid #e6e8eb', borderRadius: 12, padding: 16, background: '#fafbfc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Your store</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{seller.store_name}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                  {seller.plan === 'growth' ? 'Growth plan · R70/mo' : 'Free plan'} ·{' '}
                  <span style={{ textTransform: 'capitalize', color: seller.status === 'active' ? '#1a8f4c' : '#b26a00', fontWeight: 600 }}>{seller.status}</span>
                </div>
              </div>
              <button onClick={() => router.push('/seller/dashboard')}
                style={{ background: NAVY, color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Manage store
              </button>
            </div>
          ) : (
            <div style={{ border: `1px dashed ${RED}`, borderRadius: 12, padding: 16, background: '#fff7f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Start selling on Spaza</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>List your products for free — no monthly fee.</div>
              </div>
              <button onClick={() => router.push('/sell')}
                style={{ background: RED, color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Sell on Spaza
              </button>
            </div>
          )}

          {isAdmin && (
            <div style={{ border: `1px solid ${NAVY}`, borderRadius: 12, padding: 16, background: NAVY, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Admin</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Approvals, sellers, orders & accounting.</div>
              </div>
              <button onClick={() => router.push('/admin')}
                style={{ background: '#fff', color: NAVY, border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Open admin
              </button>
            </div>
          )}

          <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: 0 }}>Shipping details</h2>
          <p style={{ fontSize: 13, color: '#666', marginTop: -8 }}>We use this to deliver your orders. <a href="/orders" style={{ color: RED, fontWeight: 600, textDecoration: 'none' }}>View my orders →</a></p>

          <Field label="Full name" value={form.full_name} onChange={v => set('full_name', v)} placeholder="Thandi Nkosi" />
          <Field label="Phone (optional)" value={form.phone} onChange={v => set('phone', v)} placeholder="072 123 4567" />
          <Field label="Street address" value={form.address_line1} onChange={v => set('address_line1', v)} placeholder="123 Main Road" />
          <Field label="Apartment, suite, etc. (optional)" value={form.address_line2} onChange={v => set('address_line2', v)} placeholder="Unit 4B" />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="City" value={form.city} onChange={v => set('city', v)} placeholder="Benoni" />
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Postal code" value={form.postal_code} onChange={v => set('postal_code', v)} placeholder="1501" />
            </div>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Province</span>
            <select value={form.province} onChange={e => set('province', e.target.value)}
              style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none', background: '#fff' }}>
              <option value="">Select a province…</option>
              {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>

          <button onClick={handleSave} disabled={saving}
            style={{ marginTop: 8, background: RED, color: '#fff', border: 'none', padding: 14, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save Address'}
          </button>
        </div>
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
