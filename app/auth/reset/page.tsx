'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase automatically processes the hash from the reset link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true)
      }
    })
    // Also check immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleReset() {
    if (!password) { setError('Please enter a new password'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message) } else {
      await supabase.auth.signOut()
      router.push('/login?reset=true')
    }
  }

  const s: Record<string, React.CSSProperties> = {
    page:  { minHeight:'100vh', background:'#f5f0e8', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', fontFamily:"'DM Sans',sans-serif" },
    card:  { width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:20 },
    label: { fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 },
    input: { width:'100%', boxSizing:'border-box' as const, background:'rgba(0,0,0,0.04)', border:'1px solid #ccc', borderRadius:12, padding:'13px 14px', color:'#014a09', fontSize:15, fontFamily:'inherit', outline:'none' },
    btn:   { width:'100%', background:'#014a09', border:'none', borderRadius:12, padding:'14px 0', color:'#ffcc66', fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' },
    err:   { background:'rgba(2,107,13,0.08)', border:'1px solid rgba(2,107,13,0.3)', borderRadius:10, padding:'10px 14px', color:'#026b0d', fontSize:13 },
  }

  if (!ready) return (
    <div style={s.page}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:18, fontWeight:900, color:'#014a09', marginBottom:8 }}>Court Connections</div>
        <div style={{ color:'#026b0d', fontSize:14 }}>Loading reset link…</div>
      </div>
    </div>
  )

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:'#014a09', marginBottom:6 }}>Court Connections</div>
          <div style={{ fontSize:22, fontWeight:900, color:'#014a09' }}>Set a new password</div>
          <div style={{ fontSize:13, color:'#888', marginTop:6 }}>Choose something you will remember.</div>
        </div>
        <div>
          <div style={s.label}>New password</div>
          <input type="password" placeholder="Min 6 characters" value={password}
            onChange={e => setPassword(e.target.value)} style={s.input} />
        </div>
        <div>
          <div style={s.label}>Confirm password</div>
          <input type="password" placeholder="Repeat your password" value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleReset()}
            style={s.input} />
        </div>
        {error && <div style={s.err}>{error}</div>}
        <button onClick={handleReset} disabled={loading}
          style={{ ...s.btn, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Saving…' : 'Set New Password →'}
        </button>
      </div>
    </div>
  )
}
