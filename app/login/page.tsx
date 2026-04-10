'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleLogin() {
    if (!email.trim()) { setError('Please enter your email'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    })
    setLoading(false)
    if (error) { setError(error.message) } else { setSent(true) }
  }

  const s: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'DM Sans', sans-serif" },
    card: { width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 24 },
    logo: { display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 8 },
    logoText: { fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: -0.5 },
    sub: { fontSize: 14, color: '#555', textAlign: 'center', marginTop: -16 },
    label: { fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    input: { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '13px 14px', color: '#e8e8e8', fontSize: 15, fontFamily: 'inherit', outline: 'none' },
    btn: { width: '100%', background: 'linear-gradient(90deg, #00c6a2, #007aff)', border: 'none', borderRadius: 12, padding: '14px 0', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' },
    err: { background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 13 },
    success: { background: 'rgba(0,198,162,0.1)', border: '1px solid rgba(0,198,162,0.3)', borderRadius: 14, padding: '24px', textAlign: 'center', color: '#00c6a2' },
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>
          <span style={{ fontSize: 28 }}>🎾</span>
          <span style={s.logoText}>PadelMatch</span>
        </div>
        <p style={s.sub}>Club member login</p>

        {sent ? (
          <div style={s.success}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Check your email!</div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
              We sent a magic link to <strong style={{ color: '#00c6a2' }}>{email}</strong>.<br />
              Tap it to sign in — no password needed.
            </div>
          </div>
        ) : (
          <>
            <div>
              <div style={s.label}>Your email</div>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={s.input}
              />
            </div>
            {error && <div style={s.err}>{error}</div>}
            <button onClick={handleLogin} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Sending…' : 'Send Magic Link →'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#333', margin: 0 }}>
              No password needed. One tap and you're in.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
