'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Rating, Match } from '@/lib/types'

// ─── Rating Engine (same logic as standalone component) ───────────────────────
const BANDS = [
  { id:'P1', label:'Just Starting',       min:1.0, max:1.95, color:'#94a3b8', bg:'rgba(148,163,184,0.12)', glow:'rgba(148,163,184,0.2)' },
  { id:'P2', label:'Developing',          min:2.0, max:2.95, color:'#4ade80', bg:'rgba(74,222,128,0.12)',  glow:'rgba(74,222,128,0.2)'  },
  { id:'P3', label:'Intermediate',        min:3.0, max:3.95, color:'#34d399', bg:'rgba(52,211,153,0.12)',  glow:'rgba(52,211,153,0.2)'  },
  { id:'P4', label:'Solid Club Player',   min:4.0, max:4.95, color:'#facc15', bg:'rgba(250,204,21,0.12)',  glow:'rgba(250,204,21,0.2)'  },
  { id:'P5', label:'Advanced',            min:5.0, max:5.95, color:'#fb923c', bg:'rgba(251,146,60,0.12)',  glow:'rgba(251,146,60,0.2)'  },
  { id:'P6', label:'Elite Club/Regional', min:6.0, max:6.95, color:'#f87171', bg:'rgba(248,113,113,0.12)', glow:'rgba(248,113,113,0.2)' },
  { id:'P7', label:'Professional',        min:7.0, max:7.0,  color:'#e879f9', bg:'rgba(232,121,249,0.12)', glow:'rgba(232,121,249,0.2)' },
]
const SELF_RATE_OPTIONS = [
  { rating:1.5, band:'P1', title:'1.0 – 2.0 · Just Starting',     desc:'Brand new to padel.' },
  { rating:2.5, band:'P2', title:'2.0 – 3.0 · Developing',        desc:'Getting comfortable. Walls still tough.' },
  { rating:3.5, band:'P3', title:'3.0 – 4.0 · Intermediate',      desc:'Regular player, use walls, tactical awareness.' },
  { rating:4.5, band:'P4', title:'4.0 – 5.0 · Solid Club Player', desc:'Club league level. Strong technique.' },
  { rating:5.5, band:'P5', title:'5.0 – 6.0 · Advanced',          desc:'Tournament level. Consistent attack.' },
  { rating:6.5, band:'P6', title:'6.0+ · Elite / Regional',       desc:'Near-professional standard.' },
]
function getBand(r: number) {
  for (const b of BANDS) if (r >= b.min && r <= b.max) return b
  return r >= 7 ? BANDS[6] : BANDS[0]
}
function getConfidence(n: number) {
  if (n===0)  return { label:'NC', color:'#475569', tip:'Self-rated. Play matches to calibrate.' }
  if (n<5)    return { label:'LC', color:'#facc15', tip:`${5-n} more matches to Medium Confidence.` }
  if (n<15)   return { label:'MC', color:'#fb923c', tip:`${15-n} more to High Confidence.` }
  return             { label:'HC', color:'#4ade80', tip:'Rating is well-calibrated.' }
}
function getK(n: number) { return n<5 ? 0.35 : n<15 ? 0.25 : 0.18 }
function marginMult(wG: number, lG: number) {
  const d = wG - lG
  return d>=8 ? 1.25 : d>=5 ? 1.12 : d>=2 ? 1.0 : 0.88
}
function calcNew(my: number, myAvg: number, oppAvg: number, won: boolean, wG: number, lG: number, n: number) {
  const K = getK(n), E = 1/(1+Math.pow(10,(oppAvg-myAvg)/4)), S = won?1:0
  return Math.round(Math.max(1,Math.min(7, my + K*(S-E)*marginMult(wG,lG)))*10)/10
}

// ─── Components ───────────────────────────────────────────────────────────────
function Avatar({ initials, size=40, rating }: { initials:string, size?:number, rating:number }) {
  const b = getBand(rating)
  return <div style={{ width:size, height:size, borderRadius:'50%', background:`linear-gradient(135deg,${b.color}45,${b.color}18)`, border:`2px solid ${b.color}55`, display:'flex', alignItems:'center', justifyContent:'center', color:b.color, fontWeight:900, fontSize:size*0.3, flexShrink:0, boxShadow:`0 0 10px ${b.glow}` }}>{initials}</div>
}
function BandBar({ rating }: { rating:number }) {
  const b = getBand(rating), span=b.max===b.min?0.05:b.max-b.min
  const pct = Math.max(2,Math.min(97,((rating-b.min)/span)*100))
  return <div style={{ flex:1, height:4, borderRadius:4, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}><div style={{ width:`${pct}%`, height:'100%', borderRadius:4, background:`linear-gradient(90deg,${b.color}80,${b.color})`, transition:'width 0.8s ease' }}/></div>
}

const EMPTY_LOG = { a1:'',a2:'',b1:'',b2:'',s1a:'',s1b:'',s2a:'',s2b:'',s3a:'',s3b:'' }

export default function RatingsPage() {
  const router = useRouter()
  const [ratings,     setRatings]     = useState<Rating[]>([])
  const [history,     setHistory]     = useState<Match[]>([])
  const [currentUser, setCurrentUser] = useState<Rating|null>(null)
  const [userId,      setUserId]      = useState<string|null>(null)
  const [view,        setView]        = useState<'board'|'log'|'join'|'profile'>('board')
  const [log,         setLog]         = useState(EMPTY_LOG)
  const [joinRate,    setJoinRate]    = useState(SELF_RATE_OPTIONS[1])
  const [notif,       setNotif]       = useState<string|null>(null)
  const [loading,     setLoading]     = useState(true)
  const notifRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  function notify(msg:string, type='ok') {
    if(notifRef.current) clearTimeout(notifRef.current)
    setNotif(msg)
    notifRef.current = setTimeout(()=>setNotif(null),3200)
  }

  const loadData = useCallback(async () => {
    const { data:{ session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)

    const [ratingsRes, matchesRes] = await Promise.all([
      supabase.from('ratings').select('*').order('rating', { ascending:false }),
      supabase.from('matches').select('*').order('created_at', { ascending:false }).limit(50),
    ])
    const all = ratingsRes.data || []
    setRatings(all)
    setHistory(matchesRes.data || [])
    const me = all.find((r:Rating) => r.player_id === session.user.id)
    if (me) setCurrentUser(me)
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // ── Join ──────────────────────────────────────────────────────────────────
  async function handleJoin() {
    if (!userId) return
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('name,avatar').eq('id',userId).single()
    if (!profile) { notify('Complete your profile on the main app first','err'); return }
    const { error } = await supabase.from('ratings').insert({
      player_id: userId, player_name: profile.name, avatar: profile.avatar,
      rating: joinRate.rating, match_count: 0
    })
    if (error) { notify('Error: '+error.message,'err'); return }
    notify(`Welcome! Starting at ${joinRate.rating.toFixed(1)}`)
    loadData(); setView('profile')
  }

  // ── Log Match ─────────────────────────────────────────────────────────────
  async function handleLogMatch() {
    const { a1,a2,b1,b2,s1a,s1b } = log
    if (!a1||!a2||!b1||!b2) { notify('Select all 4 players','err'); return }
    if (new Set([a1,a2,b1,b2]).size<4) { notify('Each player must be different','err'); return }
    if (!s1a||!s1b) { notify('Enter at least set 1 score','err'); return }

    const sets: [number,number][] = []
    if (s1a&&s1b) sets.push([+s1a,+s1b])
    if (log.s2a&&log.s2b) sets.push([+log.s2a,+log.s2b])
    if (log.s3a&&log.s3b) sets.push([+log.s3a,+log.s3b])
    let aW=0,bW=0; sets.forEach(([a,b])=>{ if(a>b)aW++; else if(b>a)bW++ })
    if (aW<=bW) { notify('Team A must win more sets (they are winners)','err'); return }

    const tA=sets.map(s=>s[0]).reduce((s,v)=>s+v,0)
    const tB=sets.map(s=>s[1]).reduce((s,v)=>s+v,0)
    const pA1=ratings.find(r=>r.player_id===a1)!, pA2=ratings.find(r=>r.player_id===a2)!
    const pB1=ratings.find(r=>r.player_id===b1)!, pB2=ratings.find(r=>r.player_id===b2)!
    if (!pA1||!pA2||!pB1||!pB2) { notify('Could not find all players','err'); return }

    const avgA=(pA1.rating+pA2.rating)/2, avgB=(pB1.rating+pB2.rating)/2

    const newRA1=calcNew(pA1.rating,avgA,avgB,true, tA,tB,pA1.match_count)
    const newRA2=calcNew(pA2.rating,avgA,avgB,true, tA,tB,pA2.match_count)
    const newRB1=calcNew(pB1.rating,avgB,avgA,false,tB,tA,pB1.match_count)
    const newRB2=calcNew(pB2.rating,avgB,avgA,false,tB,tA,pB2.match_count)

    // Update ratings
    await Promise.all([
      supabase.from('ratings').update({ rating:newRA1, match_count:pA1.match_count+1, updated_at:new Date().toISOString() }).eq('player_id',a1),
      supabase.from('ratings').update({ rating:newRA2, match_count:pA2.match_count+1, updated_at:new Date().toISOString() }).eq('player_id',a2),
      supabase.from('ratings').update({ rating:newRB1, match_count:pB1.match_count+1, updated_at:new Date().toISOString() }).eq('player_id',b1),
      supabase.from('ratings').update({ rating:newRB2, match_count:pB2.match_count+1, updated_at:new Date().toISOString() }).eq('player_id',b2),
    ])

    // Log match record
    await supabase.from('matches').insert({
      team_a1_id:a1, team_a1_name:pA1.player_name,
      team_a2_id:a2, team_a2_name:pA2.player_name,
      team_b1_id:b1, team_b1_name:pB1.player_name,
      team_b2_id:b2, team_b2_name:pB2.player_name,
      sets_a: sets.map(s=>s[0]), sets_b: sets.map(s=>s[1]),
      rating_a1_before:pA1.rating, rating_a1_after:newRA1,
      rating_a2_before:pA2.rating, rating_a2_after:newRA2,
      rating_b1_before:pB1.rating, rating_b1_after:newRB1,
      rating_b2_before:pB2.rating, rating_b2_after:newRB2,
      logged_by: userId,
    })

    notify('Match logged! All 4 ratings updated.')
    setLog(EMPTY_LOG); loadData(); setView('board')
  }

  if (loading) return <div style={{ minHeight:'100vh', background:'#070b0f', display:'flex', alignItems:'center', justifyContent:'center', color:'#fb923c', fontSize:14, fontWeight:600 }}>Loading…</div>

  const fp = userId ? ratings.find(r=>r.player_id===userId) : null
  const myHistory = userId ? history.filter(m=>[m.team_a1_id,m.team_a2_id,m.team_b1_id,m.team_b2_id].includes(userId)) : []
  const SLOT_LABEL: Record<string,string> = { a1:'Team A · P1', a2:'Team A · P2', b1:'Team B · P1', b2:'Team B · P2' }

  function slotOf(pid:string) { return (['a1','a2','b1','b2'] as const).find(s=>log[s]===pid)||null }
  function isPicked(pid:string) { return ['a1','a2','b1','b2'].some(s=>log[s as keyof typeof log]===pid) }
  function assignPlayer(pid:string) {
    if (isPicked(pid)) { const s=slotOf(pid); if(s) setLog(l=>({...l,[s]:''})); return }
    const free=(['a1','a2','b1','b2'] as const).find(s=>!log[s])
    if (free) setLog(l=>({...l,[free]:pid}))
  }

  return (
    <div style={{ minHeight:'100vh', background:'#070b0f', fontFamily:"'DM Sans',sans-serif", color:'#e2e8f0', overflowX:'hidden' }}>
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none', backgroundImage:'linear-gradient(rgba(255,255,255,0.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.018) 1px,transparent 1px)', backgroundSize:'44px 44px' }}/>

      {notif && <div style={{ position:'fixed', top:14, left:'50%', transform:'translateX(-50%)', zIndex:9999, background:'rgba(74,222,128,0.14)', backdropFilter:'blur(14px)', border:'1px solid rgba(74,222,128,0.4)', borderRadius:12, padding:'10px 20px', color:'#4ade80', fontWeight:700, fontSize:13, whiteSpace:'nowrap' }}>{notif}</div>}

      <div style={{ position:'relative', zIndex:1, maxWidth:500, margin:'0 auto', padding:'0 16px 64px' }}>

        {/* Header */}
        <div style={{ padding:'22px 0 18px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.8, color:'#fb923c', background:'rgba(251,146,60,0.1)', border:'1px solid rgba(251,146,60,0.22)', borderRadius:6, padding:'2px 8px' }}>🏠 CLUB INTERNAL</span>
            <div style={{ fontSize:24, fontWeight:900, color:'#fff', letterSpacing:-0.8, marginTop:6, lineHeight:1 }}>Padel Ratings</div>
            <div style={{ fontSize:11, color:'#334155', marginTop:3 }}>1.0–7.0 · FIP/Playtomic · Doubles · Private</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:24, fontWeight:900, color:'#fb923c' }}>{ratings.length}</div>
            <div style={{ fontSize:10, color:'#334155', fontWeight:700 }}>MEMBERS</div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ display:'grid', gridTemplateColumns:fp?'1fr 1fr 1fr 1fr':'1fr 1fr 1fr', background:'rgba(255,255,255,0.04)', borderRadius:14, padding:3, marginBottom:20, gap:2, border:'1px solid rgba(255,255,255,0.07)' }}>
          {([['board','🏆','Board'],['log','➕','Log Match'],['join','👤',fp?'Profile':'Join'],...(fp?[['profile','📊','My Profile']]:[])] as const).map(([v,icon,label])=>(
            <button key={v} onClick={()=>setView(v as any)} style={{ border:'none', borderRadius:11, padding:'8px 2px', background:view===v?'rgba(251,146,60,0.18)':'transparent', color:view===v?'#fb923c':'#475569', fontWeight:700, fontSize:10, cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:2, borderBottom:view===v?'2px solid #fb923c':'2px solid transparent' }}>
              <span style={{ fontSize:15 }}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>

        {/* ══ LEADERBOARD ══ */}
        {view==='board' && (
          <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
              <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>Club Leaderboard</div>
              <div style={{ fontSize:10, color:'#1e293b', fontWeight:700 }}>INTERNAL ONLY</div>
            </div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:2 }}>
              {BANDS.map(b=><div key={b.id} style={{ background:b.bg, border:`1px solid ${b.color}28`, borderRadius:8, padding:'3px 8px', fontSize:10, color:b.color, fontWeight:700 }}>{b.id}</div>)}
            </div>
            {ratings.map((r,i)=>{
              const b=getBand(r.rating), isMe=r.player_id===userId, conf=getConfidence(r.match_count)
              return (
                <div key={r.id} onClick={()=>{ if(r.player_id===userId){setView('profile')} }} style={{ background:isMe?'rgba(251,146,60,0.06)':'rgba(255,255,255,0.025)', border:`1px solid ${isMe?'rgba(251,146,60,0.28)':'rgba(255,255,255,0.065)'}`, borderRadius:16, padding:'13px 15px', cursor:r.player_id===userId?'pointer':'default', display:'flex', flexDirection:'column', gap:9 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                    <div style={{ width:28, textAlign:'center', fontSize:i<3?17:12, fontWeight:900, color:i===0?'#facc15':i===1?'#94a3b8':i===2?'#fb923c':'#1e293b', flexShrink:0 }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
                    <Avatar initials={r.avatar} size={40} rating={r.rating}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:800, fontSize:14, color:'#f1f5f9', display:'flex', alignItems:'center', gap:6 }}>{r.player_name}{isMe&&<span style={{ fontSize:9, color:'#fb923c', fontWeight:800 }}>YOU</span>}</div>
                      <div style={{ fontSize:11, color:'#334155', marginTop:1, display:'flex', alignItems:'center', gap:5 }}>
                        {r.match_count} matches
                        <span title={getConfidence(r.match_count).tip} style={{ background:`${conf.color}18`, color:conf.color, border:`1px solid ${conf.color}40`, borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:800, cursor:'help' }}>{conf.label}</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:19, fontWeight:900, color:b.color }}>{r.rating.toFixed(1)}</span>
                      <div><div style={{ fontSize:9, color:b.color, fontWeight:800 }}>{b.id}</div><div style={{ fontSize:9, color:'#475569', whiteSpace:'nowrap' }}>{b.label}</div></div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}><BandBar rating={r.rating}/></div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══ MY PROFILE ══ */}
        {(view==='profile'||view==='join') && fp && (()=>{
          const b=getBand(fp.rating), conf=getConfidence(fp.match_count)
          const span=b.max===b.min?0.05:b.max-b.min, pct=Math.max(2,Math.min(97,((fp.rating-b.min)/span)*100))
          const wins=myHistory.filter(m=>[m.team_a1_id,m.team_a2_id].includes(userId!)).length
          const losses=myHistory.filter(m=>[m.team_b1_id,m.team_b2_id].includes(userId!)).length
          const bIdx=BANDS.findIndex(x=>x.id===b.id), nextB=BANDS[bIdx+1], prevB=BANDS[bIdx-1]
          return (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:`linear-gradient(135deg,${b.bg} 0%,rgba(255,255,255,0.02) 100%)`, border:`1px solid ${b.color}30`, borderRadius:20, padding:'20px 18px', boxShadow:`0 0 40px ${b.glow}25` }}>
                <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
                  <Avatar initials={fp.avatar} size={54} rating={fp.rating}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:19, fontWeight:900, color:'#fff' }}>{fp.player_name}</div>
                    <div style={{ fontSize:11, color:'#475569', marginTop:2, display:'flex', alignItems:'center', gap:6 }}>
                      {fp.match_count} matches
                      <span title={conf.tip} style={{ background:`${conf.color}18`, color:conf.color, border:`1px solid ${conf.color}40`, borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:800, cursor:'help' }}>{conf.label}</span>
                    </div>
                    <div style={{ fontSize:10, color:'#334155', marginTop:3 }}>{conf.tip}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:34, fontWeight:900, color:b.color, lineHeight:1 }}>{fp.rating.toFixed(1)}</div>
                    <div style={{ fontSize:10, color:'#334155', fontWeight:700, marginTop:1 }}>RATING</div>
                  </div>
                </div>
                <div style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ background:b.bg, color:b.color, border:`1px solid ${b.color}40`, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:800 }}>{b.id} · {b.label}</span>
                    <span style={{ fontSize:10, color:'#334155', fontWeight:600 }}>{Math.round(pct)}% through {b.id}</span>
                  </div>
                  <BandBar rating={fp.rating}/>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:10 }}>
                  {nextB&&<div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'9px', textAlign:'center' }}><div style={{ fontSize:9, color:'#334155', fontWeight:700, marginBottom:2, textTransform:'uppercase' }}>Promote to</div><div style={{ fontSize:12, color:nextB.color, fontWeight:800 }}>{nextB.id} · {nextB.label}</div><div style={{ fontSize:11, color:'#475569' }}>+{(nextB.min-fp.rating).toFixed(1)} pts needed</div></div>}
                  {prevB&&<div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'9px', textAlign:'center' }}><div style={{ fontSize:9, color:'#334155', fontWeight:700, marginBottom:2, textTransform:'uppercase' }}>Buffer from</div><div style={{ fontSize:12, color:prevB.color, fontWeight:800 }}>{prevB.id} drop</div><div style={{ fontSize:11, color:'#475569' }}>{(fp.rating-b.min).toFixed(1)} pts above</div></div>}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                {([[wins,'Wins','#4ade80'],[losses,'Losses','#f87171'],[fp.match_count,'Played','#fb923c']] as const).map(([v,l,c])=>(
                  <div key={l} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'13px 0', textAlign:'center' }}>
                    <div style={{ fontSize:20, fontWeight:900, color:c, lineHeight:1 }}>{v}</div>
                    <div style={{ fontSize:10, color:'#334155', fontWeight:700, marginTop:3, textTransform:'uppercase' }}>{l}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:800, color:'#334155', textTransform:'uppercase', letterSpacing:0.8, marginBottom:10 }}>Recent Matches</div>
                {myHistory.length===0 ? <div style={{ textAlign:'center', padding:'24px 0', color:'#334155' }}>No matches logged yet</div> : myHistory.slice(0,10).map(m=>{
                  const won=[m.team_a1_id,m.team_a2_id].includes(userId!)
                  const sets=m.sets_a.map((a,i)=>`${a}-${m.sets_b[i]}`).join(', ')
                  const before=won?([m.team_a1_id,m.team_a2_id].indexOf(userId!)===0?m.rating_a1_before:m.rating_a2_before):([m.team_b1_id,m.team_b2_id].indexOf(userId!)===0?m.rating_b1_before:m.rating_b2_before)
                  const after=won?([m.team_a1_id,m.team_a2_id].indexOf(userId!)===0?m.rating_a1_after:m.rating_a2_after):([m.team_b1_id,m.team_b2_id].indexOf(userId!)===0?m.rating_b1_after:m.rating_b2_after)
                  const delta=Math.round((after-before)*10)/10
                  return (
                    <div key={m.id} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'11px 13px', display:'flex', alignItems:'center', gap:12, marginBottom:7, borderLeft:`3px solid ${won?'#4ade80':'#f87171'}` }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:12, color:won?'#4ade80':'#f87171' }}>{won?'✓ Win':'✗ Loss'}</div>
                        <div style={{ fontSize:11, color:'#475569', marginTop:1 }}>Sets: {sets}</div>
                        <div style={{ fontSize:10, color:'#334155', marginTop:1 }}>{new Date(m.created_at).toLocaleDateString()}</div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:13, fontWeight:800, color:'#94a3b8' }}>{after.toFixed(1)}</div>
                        <span style={{ fontSize:12, fontWeight:800, color:delta>=0?'#4ade80':'#f87171' }}>{delta>=0?'+':''}{delta.toFixed(1)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ══ JOIN ══ */}
        {view==='join' && !fp && (
          <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div><div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>Join Club Ratings</div><div style={{ fontSize:11, color:'#475569', marginTop:3 }}>Self-assess honestly. Calibrates quickly once you start playing.</div></div>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {SELF_RATE_OPTIONS.map(opt=>{
                const b=BANDS.find(x=>x.id===opt.band)||BANDS[0], sel=joinRate.rating===opt.rating
                return (
                  <button key={opt.rating} onClick={()=>setJoinRate(opt)} style={{ border:`1px solid ${sel?b.color+'60':'rgba(255,255,255,0.07)'}`, background:sel?b.bg:'rgba(255,255,255,0.02)', borderRadius:13, padding:'13px 14px', cursor:'pointer', fontFamily:'inherit', textAlign:'left', display:'flex', alignItems:'flex-start', gap:12 }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', flexShrink:0, background:sel?b.color+'20':'rgba(255,255,255,0.04)', border:`2px solid ${sel?b.color:'rgba(255,255,255,0.1)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:sel?b.color:'#334155' }}>{opt.rating.toFixed(1)}</div>
                    <div style={{ flex:1 }}><div style={{ fontWeight:800, fontSize:13, color:sel?b.color:'#94a3b8' }}>{opt.title}</div><div style={{ fontSize:11, color:'#475569', marginTop:3 }}>{opt.desc}</div></div>
                    {sel&&<span style={{ color:b.color, fontSize:16 }}>✓</span>}
                  </button>
                )
              })}
            </div>
            <button onClick={handleJoin} style={{ background:'linear-gradient(90deg,#fb923c,#f87171)', border:'none', borderRadius:14, padding:'15px 0', color:'#fff', fontWeight:900, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>Join Club Ratings →</button>
            <div style={{ textAlign:'center', fontSize:10, color:'#1e293b' }}>🔒 Private to this club · Not shared externally</div>
          </div>
        )}

        {/* ══ LOG MATCH ══ */}
        {view==='log' && (
          <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div><div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>Log a Doubles Match</div><div style={{ fontSize:11, color:'#475569', marginTop:3 }}>Select 4 players. Team A = winners. All 4 ratings update.</div></div>

            {/* Slot cards */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {(['a1','a2','b1','b2'] as const).map(slot=>{
                const pid=log[slot], p=pid?ratings.find(r=>r.player_id===pid):null
                const isW=slot==='a1'||slot==='a2'
                return (
                  <div key={slot} style={{ background:p?`${getBand(p.rating).bg}`:'rgba(255,255,255,0.025)', border:`1px solid ${p?getBand(p.rating).color+'40':isW?'rgba(74,222,128,0.2)':'rgba(248,113,113,0.2)'}`, borderRadius:12, padding:'10px 11px', minHeight:54, display:'flex', alignItems:'center', gap:8 }}>
                    {p?<><Avatar initials={p.avatar} size={28} rating={p.rating}/><div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:12, fontWeight:700, color:'#e2e8f0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.player_name}</div><div style={{ fontSize:9, color:getBand(p.rating).color, fontWeight:700 }}>{getBand(p.rating).id} · {p.rating.toFixed(1)}</div></div><button onClick={()=>setLog(l=>({...l,[slot]:''}))} style={{ background:'none', border:'none', color:'#334155', cursor:'pointer', fontSize:14, padding:2, lineHeight:1 }}>✕</button></>:<div style={{ color:isW?'rgba(74,222,128,0.35)':'rgba(248,113,113,0.35)', fontSize:11, fontWeight:600 }}>{SLOT_LABEL[slot]}</div>}
                  </div>
                )
              })}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:-6 }}>
              <div style={{ textAlign:'center', fontSize:10, fontWeight:800, color:'#4ade80' }}>🏆 Winners</div>
              <div style={{ textAlign:'center', fontSize:10, fontWeight:800, color:'#f87171' }}>Losers</div>
            </div>

            {/* Player list */}
            <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:220, overflowY:'auto' }}>
              {ratings.map(r=>{
                const picked=isPicked(r.player_id), b=getBand(r.rating), slot=slotOf(r.player_id)
                return (
                  <button key={r.id} onClick={()=>assignPlayer(r.player_id)} style={{ border:`1px solid ${picked?b.color+'60':'rgba(255,255,255,0.07)'}`, background:picked?b.bg:'rgba(255,255,255,0.025)', color:picked?b.color:'#64748b', borderRadius:10, padding:'8px 12px', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
                    <Avatar initials={r.avatar} size={26} rating={r.rating}/>
                    <span style={{ flex:1 }}>{r.player_name}</span>
                    <span style={{ fontSize:10, color:b.color, fontWeight:800 }}>{b.id} {r.rating.toFixed(1)}</span>
                    {picked&&slot&&<span style={{ fontSize:9, color:b.color, background:b.bg, border:`1px solid ${b.color}40`, borderRadius:6, padding:'1px 6px', fontWeight:800, whiteSpace:'nowrap' }}>{SLOT_LABEL[slot]}</span>}
                  </button>
                )
              })}
            </div>

            {/* Set scores */}
            {log.a1&&log.a2&&log.b1&&log.b2&&(
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:'#334155', textTransform:'uppercase', letterSpacing:0.8, marginBottom:12 }}>Set Scores — Team A (green) vs Team B (red)</div>
                {([['Set 1 *','s1a','s1b'],['Set 2','s2a','s2b'],['Set 3','s3a','s3b']] as const).map(([label,ka,kb])=>(
                  <div key={label} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                    <span style={{ fontSize:11, color:'#334155', fontWeight:700, width:46, flexShrink:0 }}>{label}</span>
                    <input type="number" min="0" max="7" placeholder="—" value={log[ka]} onChange={e=>setLog(l=>({...l,[ka]:e.target.value}))} style={{ flex:1, background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.3)', borderRadius:10, padding:'10px 0', color:'#4ade80', fontSize:22, fontWeight:900, textAlign:'center', fontFamily:'inherit', outline:'none' }}/>
                    <span style={{ color:'#1e293b', fontSize:16, fontWeight:900, flexShrink:0 }}>–</span>
                    <input type="number" min="0" max="7" placeholder="—" value={log[kb]} onChange={e=>setLog(l=>({...l,[kb]:e.target.value}))} style={{ flex:1, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:10, padding:'10px 0', color:'#f87171', fontSize:22, fontWeight:900, textAlign:'center', fontFamily:'inherit', outline:'none' }}/>
                  </div>
                ))}
                <div style={{ fontSize:10, color:'#334155', marginBottom:14 }}>* Set 1 required</div>
                <button onClick={handleLogMatch} style={{ width:'100%', background:'linear-gradient(90deg,#fb923c,#f87171)', border:'none', borderRadius:14, padding:'15px 0', color:'#fff', fontWeight:900, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>Submit Match Result</button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
