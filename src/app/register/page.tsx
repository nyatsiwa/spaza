'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'

const NAVY = '#0A1628'
const RED = '#D6001C'

export default function RegisterPage() {
  const router = useRouter()
  const params = useSearchParams()
  const redirect = params.get('redirect') || '/account'
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!fullName.trim()) return toast.error('Please enter your name')
    if (!email.trim()) return toast.error('Please enter your email')
    if (password.length < 6) return toast.error('Password must be at least 6 characters')

    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    })
    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Account created! 🎉')
    router.push(redirect)
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: NAVY, padding: '28px 32px', color: '#fff' }}>
          <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 34, letterSpacing: 1 }}>
            SPA<span style={{ color: '#F4B400' }}>ZA</span>
          </div>
          <p style={{ opacity: 0.8, fontSize: 14, marginTop: 4 }}>Create your buyer account</p>
        </div>
        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Thandi Nkosi" />
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@email.com" />
          <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" />
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ marginTop: 8, background: RED, color: '#fff', border: 'none', padding: 14, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 14, color: '#555' }}>
            Already have an account?{' '}
            <Link href={`/login?redirect=${encodeURIComponent(redirect)}`} style={{ color: RED, fontWeight: 600 }}>Sign in</Link>
          </p>
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
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none' }}
      />
    </label>
  )
}
