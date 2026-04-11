'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const allSlots  = ['Sat AM','Sat PM','Sun AM','Sun PM','Mon PM','Wed PM','Thu PM','Fri PM']
const levels    = ['1','2','3','4']
const levelColor: Record<string,string> = { '1':'#f87171','2':'#fb923c','3':'#facc15','4':'#4ade80' }
const levelBg:    Record<string,string> = { '1':'rgba(248,113,113,0.12)','2':'rgba(251,146,60,0.12)','3':'rgba(250,204,21,0.12)','4':'rgba(74,222,128,0.12)' }
const levelDesc:  Record<string,string> = { '1':'Elite','2':'Competitive','3':'Casual','4':'Beginner' }

export default function OnboardingPage() {
  const router  = useRouter()
  const [name,         setName]         = useState('')
  const [level,        setLevel]        = useState('4')
  const [availability, setAvailability] = useState<string[]>([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  // Redirect if not logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
    })
  }, [router])

  function toggleSlot(slot: string) {
    setAvailability(prev =>
      prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]
    )
  }

  async function handleSubmit() {
    if (!name.trim())             { setError('Please enter your name'); return }
    if (availability.length === 0){ setError('Pick at least one time slot'); return }
    setLoading(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const initials = name.trim().split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()

    const { error: profileError } = await supabase.from('profiles').insert({
      id: user.id,
      name: name.trim(),
      avatar: initials,
      level,
      availability,
    })

    if (profileError) { setError(profileError.message); setLoading(false); return }

    // Also seed a rating row
    await supabase.from('ratings').insert({
      player_id: user.id,
      player_name: name.trim(),
      avatar: initials,
      rating: 3.5,
      match_count: 0,
    })

    router.push('/')
  }

  const s: Record<string, React.CSSProperties> = {
    page: { minHeight:'100vh', background:'#0a0a0f', fontFamily:"'DM Sans',sans-serif", color:'#e8e8e8', padding:'0 16px 48px' },
    inner: { maxWidth:460, margin:'0 auto', display:'flex', flexDirection:'column', gap:20, paddingTop:28 },
    title: { fontSize:22, fontWeight:900, color:'#fff' },
    label: { fontSize:11, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 },
    input: { width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'13px 14px', color:'#e8e8e8', fontSize:15, fontFamily:'inherit', outline:'none' },
    btn: { width:'100%', background:'linear-gradient(90deg,#00c6a2,#007aff)', border:'none', borderRadius:12, padding:'14px 0', color:'#fff', fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' },
    err: { background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:10, padding:'10px 14px', color:'#f87171', fontSize:13 },
  }

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ fontSize:22 }}>🎾</span>
            <span style={{ fontSize:18, fontWeight:900, color:'#fff' }}>Court Connections</span>
          </div>
          <div style={s.title}>Set up your profile</div>
          <div style={{ fontSize:13, color:'#555', marginTop:4 }}>Just a few details to get you matched</div>
        </div>

        <div>
          <div style={s.label}>Your name</div>
          <input style={s.input} placeholder="e.g. Jamie Torres" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div>
          <div style={s.label}>Skill Level</div>
          <div style={{ fontSize:11, color:'#444', marginBottom:9 }}>L1 = Elite · L4 = Complete Beginner</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {levels.map(l => (
              <button key={l} onClick={() => setLevel(l)} style={{
                border:`1px solid ${level===l ? levelColor[l]+'80' : 'rgba(255,255,255,0.1)'}`,
                background:level===l ? levelBg[l] : 'transparent',
                color:level===l ? levelColor[l] : '#555',
                borderRadius:12, padding:'12px 0', fontWeight:700,
                cursor:'pointer', fontFamily:'inherit',
                display:'flex', flexDirection:'column', alignItems:'center', gap:2
              }}>
                <span style={{ fontSize:16, fontWeight:900 }}>L{l}</span>
                <span style={{ fontSize:11, opacity:0.8 }}>{levelDesc[l]}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={s.label}>When can you play? ({availability.length} selected)</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
            {allSlots.map(slot => (
              <button key={slot} onClick={() => toggleSlot(slot)} style={{
                border:`1px solid ${availability.includes(slot) ? 'rgba(0,198,162,0.5)' : 'rgba(255,255,255,0.1)'}`,
                background:availability.includes(slot) ? 'rgba(0,198,162,0.12)' : 'rgba(255,255,255,0.03)',
                color:availability.includes(slot) ? '#00c6a2' : '#555',
                borderRadius:12, padding:'11px 0', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit'
              }}>{slot}</button>
            ))}
          </div>
        </div>

        {error && <div style={s.err}>{error}</div>}

        <button onClick={handleSubmit} disabled={loading} style={{ ...s.btn, opacity:loading?0.6:1 }}>
          {loading ? 'Saving…' : 'Create Profile & Enter App →'}
        </button>
      </div>
    </div>
  )
}
