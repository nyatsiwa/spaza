'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'

const NAVY = '#0A1628'
const RED = '#D6001C'

export default function LoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const redirect = params.get('redirect') || '/'
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!email.trim() || !password) return toast.error('Enter your email and password')

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Welcome back!')
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
          <p style={{ opacity: 0.8, fontSize: 14, marginTop: 4 }}>Sign in to your account</p>
        </div>
        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Email</span>
            <input type="email" value={email} placeholder="you@email.com" onChange={e => setEmail(e.target.value)}
              style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Password</span>
            <input type="password" value={password} placeholder="Your password" onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none' }} />
          </label>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ marginTop: 8, background: RED, color: '#fff', border: 'none', padding: 14, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 14, color: '#555' }}>
            New to Spaza?{' '}
            <Link href={`/register?redirect=${encodeURIComponent(redirect)}`} style={{ color: RED, fontWeight: 600 }}>Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
