'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  // Sign out any stale session when landing on login page
  useEffect(() => {
    supabase.auth.signOut()
    const saved = localStorage.getItem('cc_remembered_email')
    if (saved) { setEmail(saved); setRememberMe(true) }
    // Show success message if coming back from password reset
    if (window.location.search.includes('reset=true')) {
      setMode('options')
    }
  }, [])

  const [mode,       setMode]       = useState<'options'|'password'|'signup'|'sent'|'forgot'|'reset_sent'>('options')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [name,       setName]       = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  async function handleGoogle() {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `https://padel-app-sigma-seven.vercel.app/auth/confirm`,
        queryParams: { prompt: 'select_account' }
      }
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  async function handleSignIn() {
    if (!email.trim() || !password) { setError('Please enter your email and password'); return }
    setLoading(true); setError('')
    if (rememberMe) {
      localStorage.setItem('cc_remembered_email', email.trim())
    } else {
      localStorage.removeItem('cc_remembered_email')
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) { setError(error.message); return }
    if (data.user) {
      const { data: profile } = await supabase.from('profiles').select('id').eq('id', data.user.id).single()
      router.push(profile ? '/' : '/onboarding')
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError('Please enter your email address'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://padel-app-sigma-seven.vercel.app/auth/reset'
    })
    setLoading(false)
    if (error) { setError(error.message) } else { setMode('reset_sent') }
  }

  async function handleSignUp() {
    if (!name.trim())     { setError('Please enter your name'); return }
    if (!email.trim())    { setError('Please enter your email'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } }
    })
    setLoading(false)
    if (error) { setError(error.message) } else { setMode('sent') }
  }

  const s: Record<string, React.CSSProperties> = {
    page:    { minHeight:'100vh', background:'#f5f0e8', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', fontFamily:"'DM Sans',sans-serif" },
    card:    { width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:20 },
    logo:    { justifyContent:'center', marginBottom:4, textAlign:'center' },
    logoTxt: { fontSize:28, fontWeight:900, color:'#660033', letterSpacing:-0.5 },
    sub:     { fontSize:14, color:'#990033', textAlign:'center', marginTop:-12 },
    label:   { fontSize:11, fontWeight:700, color:'#666', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 },
    input:   { width:'100%', boxSizing:'border-box', background:'rgba(0,0,0,0.04)', border:'1px solid #ccc', borderRadius:12, padding:'13px 14px', color:'#660033', fontSize:15, fontFamily:'inherit', outline:'none' },
    btn:     { width:'100%', background:'#660033', border:'none', borderRadius:12, padding:'14px 0', color:'#ffcc66', fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' },
    gBtn:    { width:'100%', background:'#fff', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, padding:'13px 0', color:'#111', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:10 },
    outBtn:  { width:'100%', background:'transparent', border:'1px solid rgba(102,0,51,0.3)', borderRadius:12, padding:'13px 0', color:'#660033', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:'inherit' },
    err:     { background:'rgba(153,0,51,0.08)', border:'1px solid rgba(153,0,51,0.3)', borderRadius:10, padding:'10px 14px', color:'#990033', fontSize:13 },
    divider: { display:'flex', alignItems:'center', gap:12 },
    line:    { flex:1, height:1, background:'rgba(102,0,51,0.15)' },
    orTxt:   { fontSize:12, color:'#888', fontWeight:600 },
    link:    { background:'none', border:'none', color:'#990033', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', padding:0 },
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>
          <span style={s.logoTxt}>Court Connections</span>
        </div>
        <p style={s.sub}>Club member login</p>

        {/* ── SENT ── */}
        {mode==='sent' && (
          <div style={{background:'rgba(153,0,51,0.08)',border:'1px solid rgba(153,0,51,0.3)',borderRadius:14,padding:'24px',textAlign:'center',color:'#990033'}}>
            <div style={{fontSize:32,marginBottom:12}}>📧</div>
            <div style={{fontWeight:800,fontSize:16,marginBottom:8}}>Check your email!</div>
            <div style={{fontSize:13,color:'#888',lineHeight:1.5}}>
              We sent a confirmation to <strong style={{color:'#990033'}}>{email}</strong>.<br />
              Click the link to activate your account.
            </div>
          </div>
        )}

        {/* ── OPTIONS ── */}
        {mode==='options' && (
          <>
            {typeof window !== 'undefined' && window.location.search.includes('reset=true') && (
              <div style={{ background:'rgba(0,102,51,0.08)', border:'1px solid rgba(0,102,51,0.3)', borderRadius:10, padding:'10px 14px', color:'#006633', fontSize:13, fontWeight:600 }}>
                Password updated! Sign in with your new password below.
              </div>
            )}
            <button onClick={handleGoogle} disabled={loading} style={{...s.gBtn, opacity:loading?0.6:1}}>
              <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.77-2.7.77-2.08 0-3.85-1.4-4.48-3.29H1.83v2.07A8 8 0 008.98 17z"/><path fill="#FBBC05" d="M4.5 10.53A4.8 4.8 0 014.25 9c0-.53.09-1.04.25-1.53V5.4H1.83A8 8 0 001 9c0 1.3.31 2.52.83 3.6l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.47c.63-1.9 2.4-3.29 4.48-3.29z"/></svg>
              Continue with Google
            </button>

            <div style={s.divider}>
              <div style={s.line}/><span style={s.orTxt}>or</span><div style={s.line}/>
            </div>

            <button onClick={()=>setMode('password')} style={s.outBtn}>
              Sign in with Email & Password
            </button>

            <p style={{textAlign:'center',fontSize:13,color:'#555',margin:0}}>
              New member?{' '}
              <button onClick={()=>setMode('signup')} style={s.link}>Create account</button>
            </p>
          </>
        )}

        {/* ── SIGN IN ── */}
        {mode==='password' && (
          <>
            <div>
              <div style={s.label}>Email</div>
              <input type="email" placeholder="you@example.com" value={email}
                onChange={e=>setEmail(e.target.value)} style={s.input}/>
            </div>
            <div>
              <div style={s.label}>Password</div>
              <input type="password" placeholder="••••••••" value={password}
                onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleSignIn()} style={s.input}/>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:-4 }}>
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={e => {
                  setRememberMe(e.target.checked)
                  if (!e.target.checked) localStorage.removeItem('cc_remembered_email')
                }}
                style={{ width:16, height:16, accentColor:'#00c6a2', cursor:'pointer' }}
              />
              <label htmlFor="remember" style={{ fontSize:13, color:'#666', cursor:'pointer', userSelect:'none' }}>
                Remember my email
              </label>
            </div>
            {error && <div style={s.err}>{error}</div>}
            <button onClick={handleSignIn} disabled={loading} style={{...s.btn,opacity:loading?0.6:1}}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
            <p style={{textAlign:'center',fontSize:13,color:'#555',margin:0}}>
              <button onClick={()=>{setMode('options');setError('')}} style={s.link}>← Back</button>
              {' · '}
              <button onClick={()=>{setMode('forgot');setError('')}} style={s.link}>Forgot password</button>
              {' · '}
              <button onClick={()=>{setMode('signup');setError('')}} style={s.link}>Create account</button>
            </p>
          </>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {mode==='forgot' && (
          <>
            <div>
              <div style={s.label}>Your email</div>
              <input type="email" placeholder="you@example.com" value={email}
                onChange={e=>setEmail(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleForgotPassword()}
                style={s.input}/>
            </div>
            {error && <div style={s.err}>{error}</div>}
            <button onClick={handleForgotPassword} disabled={loading} style={{...s.btn,opacity:loading?0.6:1}}>
              {loading ? 'Sending…' : 'Send Reset Link →'}
            </button>
            <p style={{textAlign:'center',fontSize:13,color:'#555',margin:0}}>
              <button onClick={()=>{setMode('password');setError('')}} style={s.link}>← Back to sign in</button>
            </p>
          </>
        )}

        {/* ── RESET SENT ── */}
        {mode==='reset_sent' && (
          <div style={s.success}>
            <div style={{fontSize:32,marginBottom:12}}>📧</div>
            <div style={{fontWeight:800,fontSize:16,marginBottom:8}}>Check your email!</div>
            <div style={{fontSize:13,color:'#888',lineHeight:1.5}}>
              We sent a password reset link to <strong style={{color:'#990033'}}>{email}</strong>.<br/>
              Click the link to set a new password.
            </div>
          </div>
        )}

        {/* ── SIGN UP ── */}
        {mode==='signup' && (
          <>
            <div>
              <div style={s.label}>Full Name</div>
              <input type="text" placeholder="e.g. Jamie Torres" value={name}
                onChange={e=>setName(e.target.value)} style={s.input}/>
            </div>
            <div>
              <div style={s.label}>Email</div>
              <input type="email" placeholder="you@example.com" value={email}
                onChange={e=>setEmail(e.target.value)} style={s.input}/>
            </div>
            <div>
              <div style={s.label}>Password</div>
              <input type="password" placeholder="Min 6 characters" value={password}
                onChange={e=>setPassword(e.target.value)} style={s.input}/>
            </div>
            {error && <div style={s.err}>{error}</div>}
            <button onClick={handleSignUp} disabled={loading} style={{...s.btn,opacity:loading?0.6:1}}>
              {loading ? 'Creating account…' : 'Create Account →'}
            </button>
            <p style={{textAlign:'center',fontSize:13,color:'#555',margin:0}}>
              Already a member?{' '}
              <button onClick={()=>{setMode('password');setError('')}} style={s.link}>Sign in</button>
            </p>
          </>
        )}

      </div>
    </div>
  )
}
