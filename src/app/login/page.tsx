'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
const NAVY = '#0A1628'
const RED = '#D6001C'
function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirect = params.get('redirect') || '/'
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // 2FA challenge step
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)

  async function handleSubmit() {
    if (!email.trim() || !password) return toast.error('Enter your email and password')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      setLoading(false)
      toast.error(error.message)
      return
    }

    // Does this user have a verified TOTP factor? If so, require a code (AAL2).
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const totp = factors?.totp?.[0]
        if (totp) {
          setMfaFactorId(totp.id)
          setMfaStep(true)
          setLoading(false)
          return
        }
      }
    } catch { /* if MFA check fails, fall through to normal login */ }

    setLoading(false)
    toast.success('Welcome back!')
    // Hard navigation so the freshly-set auth cookie is sent to the server,
    // letting middleware-protected routes (e.g. /account) recognise the session.
    window.location.assign(redirect)
  }

  async function handleVerifyMfa() {
    const code = mfaCode.trim()
    if (code.length < 6) return toast.error('Enter the 6-digit code from your authenticator app')
    setMfaLoading(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code })
      if (error) {
        setMfaLoading(false)
        toast.error(error.message || 'That code was not valid. Try again.')
        return
      }
      toast.success('Welcome back!')
      window.location.assign(redirect)
    } catch (e: any) {
      setMfaLoading(false)
      toast.error(e?.message || 'Could not verify the code')
    }
  }

  async function cancelMfa() {
    // sign out the half-authenticated (AAL1) session and return to the password form
    try { await supabase.auth.signOut() } catch { /* ignore */ }
    setMfaStep(false); setMfaCode(''); setMfaFactorId('')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: NAVY, padding: '28px 32px', color: '#fff' }}>
          <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 34, letterSpacing: 1 }}>
            SPA<span style={{ color: '#F4B400' }}>ZA</span>
          </div>
          <p style={{ opacity: 0.8, fontSize: 14, marginTop: 4 }}>{mfaStep ? 'Two-factor verification' : 'Sign in to your account'}</p>
        </div>

        {!mfaStep ? (
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
        ) : (
          <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 14, color: '#555', margin: 0 }}>
              Enter the 6-digit code from your authenticator app to finish signing in.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Authentication code</span>
              <input
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') handleVerifyMfa() }}
                inputMode="numeric"
                autoFocus
                placeholder="123456"
                style={{ padding: '12px 14px', border: '1px solid #ddd', borderRadius: 10, fontSize: 22, letterSpacing: 6, textAlign: 'center', outline: 'none', fontFamily: 'monospace' }} />
            </label>
            <button
              onClick={handleVerifyMfa}
              disabled={mfaLoading}
              style={{ background: RED, color: '#fff', border: 'none', padding: 14, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: mfaLoading ? 'default' : 'pointer', opacity: mfaLoading ? 0.7 : 1 }}
            >
              {mfaLoading ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <button
              onClick={cancelMfa}
              style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <LoginForm />
    </Suspense>
  )
}
