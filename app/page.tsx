'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AvailabilityPicker from '@/components/AvailabilityPicker'
import type { Profile, Post } from '@/lib/types'

// ─── Constants ───────────────────────────────────────────────────────────────
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const PERIODS = ['Morning','Afternoon','Evening']
const allSlots = DAYS.flatMap(d => PERIODS.map(p => `${d.slice(0,3)} ${p}`))
const PERIOD_COLOR: Record<string,{color:string,bg:string}> = {
  Morning:   { color:'#facc15', bg:'rgba(250,204,21,0.12)'  },
  Afternoon: { color:'#f87171', bg:'rgba(248,113,113,0.12)' },
  Evening:   { color:'#60a5fa', bg:'rgba(96,165,250,0.12)'  },
}
function slotColor(slot: string) {
  const period = slot.split(' ')[1] as string
  return PERIOD_COLOR[period] || { color:'#990033', bg:'rgba(0,198,162,0.12)' }
}

function formatSlotDisplay(slot: string): string {
  // slot format: "Wednesday 12:00 pm · 90 min"
  // output: "Wednesday, 12:00 – 1:30 pm"
  try {
    const dotIndex = slot.indexOf(' · ')
    if (dotIndex === -1) return slot
    const timePart = slot.slice(0, dotIndex)   // "Wednesday 12:00 pm"
    const durPart  = slot.slice(dotIndex + 3)  // "90 min"
    const mins     = parseInt(durPart) || 60

    // Parse time
    const parts = timePart.split(' ')           // ["Wednesday", "12:00", "pm"]
    const day   = parts[0]
    const time  = parts[1]                     // "12:00"
    const ampm  = parts[2]                     // "pm"
    const [hStr, mStr] = time.split(':')
    let h = parseInt(hStr), m = parseInt(mStr)
    if (ampm === 'pm' && h !== 12) h += 12
    if (ampm === 'am' && h === 12) h = 0

    const endTotal = h * 60 + m + mins
    const endH = Math.floor(endTotal / 60) % 24
    const endM = endTotal % 60
    const endAmpm = endH < 12 ? 'am' : 'pm'
    const endH12 = endH % 12 === 0 ? 12 : endH % 12
    const endTime = `${endH12}:${endM.toString().padStart(2,'0')} ${endAmpm}`

    return `${day}, ${time} – ${endTime}`
  } catch {
    return slot
  }
}
const levels    = ['1','2','3','4']
const levelColor: Record<string,string> = { '1':'#cc9900','2':'#000099','3':'#006633','4':'#990033' }
const levelBg:    Record<string,string> = { '1':'rgba(204,153,0,0.12)','2':'rgba(0,0,153,0.10)','3':'rgba(0,102,51,0.10)','4':'rgba(153,0,51,0.12)' }
const levelDesc:  Record<string,string> = { '1':'Elite','2':'Competitive','3':'Casual','4':'Beginner' }

// Derive level badge from numeric rating
function ratingToLevel(rating: number): { level: string; color: string; bg: string; desc: string } {
  if (rating >= 5.6) return { level:'1', color:'#cc9900', bg:'rgba(204,153,0,0.12)', desc:'Elite' }
  if (rating >= 4.1) return { level:'2', color:'#000099', bg:'rgba(0,0,153,0.10)', desc:'Competitive' }
  if (rating >= 2.6) return { level:'3', color:'#006633', bg:'rgba(0,102,51,0.10)', desc:'Casual' }
  return              { level:'4', color:'#990033', bg:'rgba(153,0,51,0.12)', desc:'Beginner' }
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

function getCompatScore(a: Profile, b: Profile) {
  const shared    = a.availability.filter(s => b.availability.includes(s)).length
  const levelDiff = Math.abs(parseInt(a.level) - parseInt(b.level))
  const levelScore = levelDiff === 0 ? 4 : levelDiff === 1 ? 2 : 0
  return shared * 3 + levelScore
}

// ─── Atoms ───────────────────────────────────────────────────────────────────
function Avatar({ initials, size=40, level }: { initials:string, size?:number, level?:string }) {
  const c = level ? levelColor[level] : '#00c6a2'
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:`linear-gradient(135deg,${c}45,${c}18)`, border:`2px solid ${c}55`, display:'flex', alignItems:'center', justifyContent:'center', color:c, fontWeight:900, fontSize:size*0.3, flexShrink:0, boxShadow:`0 0 10px ${c}28` }}>
      {initials}
    </div>
  )
}

function LevelBadge({ level, small=false }: { level:string, small?:boolean }) {
  return (
    <span style={{ background:levelBg[level], color:levelColor[level], border:`1px solid ${levelColor[level]}40`, borderRadius:20, padding:small?'1px 7px':'2px 10px', fontSize:small?10:11, fontWeight:800, whiteSpace:'nowrap' }}>
      L{level} · {levelDesc[level]}
    </span>
  )
}

function Notif({ msg }: { msg: string|null }) {
  if (!msg) return null
  return (
    <div style={{ position:'fixed', top:18, left:'50%', transform:'translateX(-50%)', background:'rgba(153,0,51,0.12)', backdropFilter:'blur(12px)', border:'1px solid rgba(153,0,51,0.4)', borderRadius:14, padding:'11px 22px', zIndex:9999, color:'#990033', fontWeight:700, fontSize:14, whiteSpace:'nowrap', boxShadow:'0 4px 24px rgba(0,198,162,0.2)' }}>
      {msg}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()

  const [currentUser, setCurrentUser] = useState<Profile|null>(null)
  const [players,     setPlayers]     = useState<Profile[]>([])
  const [posts,       setPosts]       = useState<(Post & { interested_ids: string[] })[]>([])
  const [view,        setView]        = useState<'home'|'board'|'arena'|'matches'|'profile'>('home')
  const [editName,    setEditName]    = useState('')
  const [editLevel,   setEditLevel]   = useState('')
  const [editSlots,   setEditSlots]   = useState<string[]>([])
  const [editLoading, setEditLoading] = useState(false)
  const [boardLevel,  setBoardLevel]  = useState('All')
  const [selected,    setSelected]    = useState<Profile|null>(null)
  const [filter,      setFilter]      = useState({ level:'All', slot:'All' })
  const [fLevels,     setFLevels]     = useState<string[]>([])
  const [showForm,    setShowForm]    = useState(false)
  const [showLevelGuide, setShowLevelGuide] = useState(false)
  const [notif,       setNotif]       = useState<string|null>(null)
  const [loading,     setLoading]     = useState(true)
  const [liveRating,   setLiveRating]   = useState<number|null>(null)

  // Post form state
  const [fDay,      setFDay]     = useState('')
  const [fTime,     setFTime]    = useState('')
  const [fDuration, setFDuration] = useState('')
  const [fSpots,    setFSpots]   = useState(2)
  const [fNote,     setFNote]    = useState('')

  function showNotif(msg: string) {
    setNotif(msg)
    setTimeout(() => setNotif(null), 2800)
  }

  // ── Load session + data ───────────────────────────────────────────────────
  const loadData = useCallback(async (userId: string) => {
    try {
      const profileRes = await supabase.from('profiles').select('*').eq('id', userId).single()

      if (profileRes.error) {
        // Only redirect to onboarding if profile genuinely doesn't exist
        // PGRST116 = row not found, anything else is a network/server error
        if (profileRes.error.code === 'PGRST116') {
          router.push('/onboarding')
        } else {
          console.error('Profile fetch error:', profileRes.error)
          setLoading(false)
        }
        return
      }

      setCurrentUser(profileRes.data)

      const [playersRes, postsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('posts').select('*, post_interests(player_id)').order('created_at', { ascending:false }),
      ])

      setPlayers(playersRes.data || [])

      const enrichedPosts = (postsRes.data || []).map((p: any) => ({
        ...p,
        interested_ids: (p.post_interests || []).map((i: any) => i.player_id)
      }))
      setPosts(enrichedPosts)

      // Fetch live rating for header pill
      const ratingRes = await supabase.from('ratings').select('rating').eq('player_id', userId).single()
      if (ratingRes.data) setLiveRating(ratingRes.data.rating)

      setLoading(false)
    } catch (err) {
      console.error('loadData error:', err)
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    let sessionChecked = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      sessionChecked = true
      if (session?.user) {
        loadData(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        router.push('/login')
      } else if (event === 'INITIAL_SESSION' && !session) {
        router.push('/login')
      }
    })

    // Fallback: if onAuthStateChange never fires after 3s, check manually
    const fallback = setTimeout(() => {
      if (!sessionChecked) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) loadData(session.user.id)
          else router.push('/login')
        })
      }
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(fallback)
    }
  }, [loadData, router])

  useEffect(() => {
    const refreshData = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) loadData(session.user.id)
      })
    }
    const channel = supabase
      .channel('board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, refreshData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_interests' }, refreshData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handlePostSubmit() {
    if (!currentUser || !fDay || !fTime || !fDuration) { showNotif('Pick a day, time and duration'); return }
    if (fLevels.length === 0) { showNotif('Select at least one level'); return }
    const fSlot = `${fDay} ${fTime} · ${fDuration}`
    const { error } = await supabase.from('posts').insert({
      player_id: currentUser.id,
      player_name: currentUser.name,
      player_avatar: currentUser.avatar,
      level: fLevels[0],
      allowed_levels: fLevels,
      slot: fSlot,
      spots_needed: fSpots,
      note: fNote.trim(),
    })
    if (error) { showNotif('Error posting: ' + error.message); return }
    setShowForm(false); setFDay(''); setFTime(''); setFDuration(''); setFSpots(2); setFNote(''); setFLevels([])
    showNotif('Game posted! 🎾')
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.user) loadData(session.user.id) })
  }

  async function handleInterest(postId: number) {
    if (!currentUser) return
    const post = posts.find(p => p.id === postId)
    if (!post) return
    const allowedLevels = post.allowed_levels || [post.level]
    if (!allowedLevels.includes(currentUser.level) && !post.interested_ids.includes(currentUser.id)) {
      showNotif('This game is restricted to ' + allowedLevels.map((l: string) => `L${l}`).join(', '))
      return
    }
    const already = post.interested_ids.includes(currentUser.id)
    if (already) {
      await supabase.from('post_interests').delete().eq('post_id', postId).eq('player_id', currentUser.id)
    } else {
      await supabase.from('post_interests').insert({ post_id: postId, player_id: currentUser.id })
    }
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.user) loadData(session.user.id) })
  }

  async function handleDeletePost(postId: number) {
    await supabase.from('posts').delete().eq('id', postId)
    showNotif('Post removed')
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.user) loadData(session.user.id) })
  }

  function handleSignOut() {
    supabase.auth.signOut().then(() => router.push('/login'))
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const boardPosts  = boardLevel === 'All' ? posts : posts.filter(p => (p.allowed_levels || [p.level]).includes(boardLevel))
  const openPosts   = posts.filter(p => p.interested_ids.length < p.spots_needed)
  const openByLevel = Object.fromEntries(levels.map(l => [l, posts.filter(p => (p.allowed_levels || [p.level]).includes(l) && p.interested_ids.length < p.spots_needed).length]))

  const filtered = players.filter(p =>
    (filter.level === 'All' || p.level === filter.level) &&
    (filter.slot  === 'All' || p.availability.includes(filter.slot))
  )

  const matches = selected
    ? players.filter(p => p.id !== selected.id)
        .map(p => ({ ...p, score: getCompatScore(selected, p) }))
        .sort((a,b) => b.score - a.score)
    : []

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', background:'#f5f0e8', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
        <div style={{ color:'#990033', fontSize:14, fontWeight:600 }}>Loading Court Connections…</div>
        <button onClick={() => { window.location.href = '/login' }} style={{ marginTop:8, background:'transparent', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, padding:'8px 20px', color:'#555', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
          Not loading? Click here
        </button>
      </div>
    )
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const navBtnStyle = (active: boolean): React.CSSProperties => ({
    border:'none', borderRadius:10, padding:'8px 0',
    background: active ? '#990033' : 'transparent',
    color: active ? '#ffcc66' : 'rgba(255,204,102,0.5)',
    fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:'inherit',
    transition:'all 0.2s', display:'flex', flexDirection:'column', alignItems:'center', gap:2,
  })

  return (
    <div style={{ minHeight:'100vh', background:'#f5f0e8', fontFamily:"'DM Sans',sans-serif", color:'#000', overflowX:'hidden', position:'relative' }}>
      <Notif msg={notif} />

      <div style={{ position:'relative', zIndex:1, maxWidth:480, margin:'0 auto', padding:'0 16px 48px' }}>

        {/* Header */}
        <div style={{ padding:'22px 0 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ marginBottom:3 }}>
              <span style={{ fontSize:22, fontWeight:900, letterSpacing:-0.5, color:'#660033' }}>Court Connections</span>
            </div>
            <div style={{ fontSize:12, color:'#660033' }}>Connect with players at your level.</div>
          </div>
          {currentUser && (()=>{
            const rd = liveRating ? ratingToLevel(liveRating) : ratingToLevel(3.5)
            return (
              <div style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}
                onClick={() => { setEditName(currentUser.name); setEditLevel(currentUser.level); setEditSlots(currentUser.availability); setView('profile') }}>
                <Avatar initials={currentUser.avatar} size={34} level={rd.level} />
                <div style={{ background:'#660033', border:'1px solid #990033', borderRadius:10, padding:'5px 14px', textAlign:'center', minWidth:90 }}>
                  <div style={{ fontSize:17, fontWeight:900, color:'#ffcc66', lineHeight:1.1 }}>
                    {liveRating ? liveRating.toFixed(1) : '--'}
                  </div>
                  <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,204,102,0.85)', marginTop:2, whiteSpace:'nowrap' }}>
                    L{rd.level} · {rd.desc}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Nav */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', background:'#660033', borderRadius:14, padding:4, marginBottom:22, gap:2 }}>
          {([['home','🏠','Home'],['board','📋','Board'],['arena','⚔️','Arena'],['matches','📅','Schedule']] as const).map(([v,icon,label]) => (
            <button key={v} onClick={() => setView(v)} style={{ ...navBtnStyle(view===v), position:'relative' }}>
              <span style={{ fontSize:14 }}>{icon}</span>
              <span>{label}</span>
              {v==='board' && openPosts.length > 0 && (
                <span style={{ position:'absolute', top:2, right:6, background:'#ffcc66', color:'#660033', borderRadius:'50%', width:15, height:15, fontSize:9, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {openPosts.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══ HOME ══ */}
        {view==='home' && (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div style={{ background:'#f0ebe0', border:'1px solid #d4c9b8', borderRadius:20, padding:'26px 22px' }}>
              <div style={{ fontSize:27, fontWeight:900, lineHeight:1.2, color:'#1a0a0a', marginBottom:10 }}>
                Need players?<br /><span style={{ color:'#990033' }}>No problem.</span>
              </div>
              <div style={{ fontSize:13, color:'#6b5050', lineHeight:1.6, marginBottom:18 }}>
                Post when you need players and get matched by level. Track your rating in The Arena.
              </div>
              <div style={{ display:'flex', gap:9 }}>
                <button onClick={() => setView('board')} style={{ flex:1, background:'#990033', border:'none', borderRadius:12, padding:'12px 0', color:'#ffcc66', fontWeight:800, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Game Board</button>
                <button onClick={() => setView('arena')} style={{ flex:1, background:'transparent', border:'1px solid #bbb', borderRadius:12, padding:'12px 0', color:'#555', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>The Arena</button>
              </div>
            </div>

            {/* Level Guide */}
            <div style={{ background:'#fff', border:'1px solid #e0d8cc', borderRadius:14, overflow:'hidden' }}>
              <button onClick={() => setShowLevelGuide(v => !v)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'transparent', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#6b5050' }}>What do the levels mean?</span>
                <span style={{ fontSize:11, color:'#555', transform: showLevelGuide ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform 0.2s', display:'inline-block' }}>▼</span>
              </button>
              {showLevelGuide && (
                <div style={{ padding:'0 14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    { level:'1', name:'Elite', range:'5.6 – 7.0', color:'#cc9900', bg:'rgba(204,153,0,0.12)',
                      desc:'You compete at a high level and have done so for a while. Your wall play is automatic, your shot selection is deliberate, and you understand how to construct a point. You have likely played in tournaments or at a club competitive level. Matches at this tier are fast, technical, and unforgiving.' },
                    { level:'2', name:'Competitive', range:'4.1 – 5.5', color:levelColor['2'], bg:levelBg['2'],
                      desc:'A solid club player with real technical ability. You are comfortable with the glass, can execute a bandeja and vibora under pressure, and you move well as a unit with your partner. You win more than you lose at casual club level and you are starting to play with real tactical intent.' },
                    { level:'3', name:'Casual', range:'2.6 – 4.0', color:levelColor['3'], bg:levelBg['3'],
                      desc:'You have found your feet on the court and can hold a rally. Wall bounces do not panic you anymore and you are developing your shot repertoire. Games at this level are fun, social, and competitive without being intense. You are building consistency and starting to think tactically.' },
                    { level:'4', name:'Beginner', range:'1.0 – 2.5', color:'#990033', bg:'rgba(153,0,51,0.12)',
                      desc:'New to padel or still finding your footing. You are learning the rules, getting comfortable with the walls, and figuring out court positioning. Every session teaches you something new. Everyone starts here. The only way is up.' },
                  ].map(l => (
                    <div key={l.level} style={{ background:l.bg, border:`1px solid ${l.color}25`, borderLeft:`3px solid ${l.color}`, borderRadius:12, padding:'13px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:13, fontWeight:900, color:l.color }}>L{l.level}</span>
                          <span style={{ fontSize:13, fontWeight:700, color:'#4a3030' }}>{l.name}</span>
                        </div>
                        <span style={{ fontSize:11, color:l.color, fontWeight:700, background:`${l.color}18`, borderRadius:8, padding:'2px 8px' }}>{l.range}</span>
                      </div>
                      <div style={{ fontSize:12, color:'#4a3030', lineHeight:1.6 }}>{l.desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>



            <div>
              <div style={{ fontSize:12, fontWeight:800, color:'#660033', textTransform:'uppercase', letterSpacing:0.8, marginBottom:10, display:'flex', justifyContent:'space-between' }}>
                <span>Open Games</span>
                <button onClick={() => setView('board')} style={{ background:'none', border:'none', color:'#990033', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>See all →</button>
              </div>
              {openPosts.slice(0,3).map(p => (
                <div key={p.id} onClick={() => { setBoardLevel(p.level); setView('board') }} style={{ background:'#fff', border:`1px solid ${levelColor[p.level]}20`, borderLeft:`3px solid ${levelColor[p.level]}`, borderRadius:12, padding:'11px 14px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:8 }}>
                  <Avatar initials={p.player_avatar} size={32} level={p.level} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'#4a3030' }}>{p.player_name}</div>
                    <div style={{ fontSize:11, color:'#555' }}>{p.slot}</div>
                  </div>
                  <div style={{ flexShrink:0, textAlign:'right' }}>
                    <LevelBadge level={p.level} small />
                    <div style={{ fontSize:10, color:'#4ade80', fontWeight:700, marginTop:3 }}>{p.spots_needed - p.interested_ids.length} spot{(p.spots_needed - p.interested_ids.length)!==1?'s':''} open</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ BOARD ══ */}
        {view==='board' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:17, fontWeight:900, color:'#660033' }}>Game Board</div>
                <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Players looking to fill their game</div>
              </div>
              {!showForm && (
                <button onClick={() => setShowForm(true)} style={{ background:'#660033', border:'none', borderRadius:12, padding:'9px 15px', color:'#ffcc66', fontWeight:800, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>+ Post Game</button>
              )}
            </div>

            {/* Post form */}
            {showForm && currentUser && (
              <div style={{ background:'#fff', border:`1px solid ${levelColor[currentUser.level]}30`, borderRadius:18, padding:'18px 16px', display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ fontWeight:800, fontSize:14, color:'#660033' }}>Post a Game Request</div>
                <div>
                  <div style={{ fontSize:11, color:'#555', fontWeight:700, marginBottom:7, textTransform:'uppercase', letterSpacing:0.5 }}>When?</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <select value={fDay} onChange={e => setFDay(e.target.value)} style={{ background:'#fff', border:'1px solid #ddd', borderRadius:10, padding:'10px 12px', color: fDay ? '#660033' : '#aaa', fontSize:13, fontFamily:'inherit', outline:'none', cursor:'pointer', width:'100%' }}>
                      <option value="" disabled>Day</option>
                      {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                        <option key={d} value={d} style={{ background:'#1a1a1a', color:'#4a3030' }}>{d}</option>
                      ))}
                    </select>
                    <select value={fTime} onChange={e => setFTime(e.target.value)} style={{ background:'#fff', border:'1px solid #ddd', borderRadius:10, padding:'10px 12px', color: fTime ? '#660033' : '#aaa', fontSize:13, fontFamily:'inherit', outline:'none', cursor:'pointer', width:'100%' }}>
                      <option value="" disabled>Time</option>
                      {Array.from({ length: 31 }, (_, i) => {
                        const totalMins = 7 * 60 + i * 30
                        const h24 = Math.floor(totalMins / 60)
                        const mins = totalMins % 60
                        const h12 = h24 % 12 === 0 ? 12 : h24 % 12
                        const ampm = h24 < 12 ? 'am' : 'pm'
                        const label = `${h12}:${mins.toString().padStart(2,'0')} ${ampm}`
                        return <option key={label} value={label} style={{ background:'#1a1a1a', color:'#4a3030' }}>{label}</option>
                      })}
                    </select>
                  </div>
                  {fDay && fTime && (
                    <div style={{ marginTop:7, fontSize:12, color:'#990033', fontWeight:600 }}>
                      📅 {fDay} at {fTime}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize:11, color:'#555', fontWeight:700, marginBottom:7, textTransform:'uppercase', letterSpacing:0.5 }}>Duration</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {['60 min','90 min'].map(d => (
                      <button key={d} onClick={() => setFDuration(d)} style={{
                        border:`1px solid ${fDuration===d?'#990033':'#ddd'}`,
                        background: fDuration===d?'#660033':'rgba(0,0,0,0.02)',
                        color: fDuration===d?'#ffcc66':'#888',
                        borderRadius:10, padding:'11px 0', fontSize:13, fontWeight:700,
                        cursor:'pointer', fontFamily:'inherit',
                      }}>{d}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'#555', fontWeight:700, marginBottom:7, textTransform:'uppercase', letterSpacing:0.5 }}>Open to levels (select all that apply)</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                    {levels.map(l => (
                      <button key={l} onClick={() => setFLevels(prev => prev.includes(l) ? prev.filter(x=>x!==l) : [...prev,l])} style={{
                        border:`1px solid ${fLevels.includes(l)?levelColor[l]+'80':'rgba(102,0,51,0.15)'}`,
                        background: fLevels.includes(l)?levelBg[l]:'rgba(0,0,0,0.02)',
                        color: fLevels.includes(l)?levelColor[l]:'#888',
                        borderRadius:10, padding:'10px 0', fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                        display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                      }}>
                        <span style={{ fontSize:14, fontWeight:900 }}>L{l}</span>
                        <span style={{ fontSize:10, opacity:0.8 }}>{levelDesc[l]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'#555', fontWeight:700, marginBottom:7, textTransform:'uppercase', letterSpacing:0.5 }}>Players needed</div>
                  <div style={{ display:'flex', gap:8 }}>
                    {[1,2,3].map(n => (
                      <button key={n} onClick={() => setFSpots(n)} style={{ flex:1, border:`1px solid ${fSpots===n?'#990033':'#ddd'}`, background:fSpots===n?'#660033':'transparent', color:fSpots===n?'#ffcc66':'#888', borderRadius:8, padding:'9px 0', fontSize:18, fontWeight:900, cursor:'pointer', fontFamily:'inherit' }}>{n}</button>
                    ))}
                  </div>
                </div>
                <textarea value={fNote} onChange={e => setFNote(e.target.value)} placeholder="Optional message…" maxLength={120} style={{ width:'100%', boxSizing:'border-box', resize:'none', background:'rgba(102,0,51,0.04)', border:'1px solid #ddd', borderRadius:10, padding:'10px 12px', color:'#888', fontSize:13, fontFamily:'inherit', outline:'none', height:60 }} />
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setShowForm(false)} style={{ flex:1, background:'transparent', border:'1px solid #ddd', borderRadius:10, padding:'10px 0', color:'#555', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                  <button onClick={handlePostSubmit} style={{ flex:2, background:'#660033', border:'none', borderRadius:10, padding:'10px 0', color:'#ffcc66', fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>Post →</button>
                </div>
              </div>
            )}

            {/* Level tabs */}
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
              <button onClick={() => setBoardLevel('All')} style={{ border:`1px solid ${boardLevel==='All'?'#990033':'#ddd'}`, background:boardLevel==='All'?'#660033':'rgba(102,0,51,0.04)', color:boardLevel==='All'?'#ffcc66':'#888', borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'inherit', flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
                All
                <span style={{ background:boardLevel==='All'?'#ffcc66':'rgba(102,0,51,0.1)', color:boardLevel==='All'?'#660033':'#888', borderRadius:'50%', width:18, height:18, fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>{openPosts.length}</span>
              </button>
              {levels.map(l => (
                <button key={l} onClick={() => setBoardLevel(l)} style={{ border:`1px solid ${boardLevel===l?levelColor[l]+'60':'#ddd'}`, background:boardLevel===l?levelBg[l]:'rgba(102,0,51,0.03)', color:boardLevel===l?levelColor[l]:'#888', borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'inherit', flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
                  L{l} · {levelDesc[l]}
                  {openByLevel[l]>0 && <span style={{ background:boardLevel===l?levelColor[l]:'rgba(102,0,51,0.1)', color:boardLevel===l?'#fff':'#888', borderRadius:'50%', width:18, height:18, fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>{openByLevel[l]}</span>}
                </button>
              ))}
            </div>

            {/* Posts */}
            {boardPosts.length===0 ? (
              <div style={{ textAlign:'center', padding:'40px 0' }}>
                <div style={{ fontSize:30 }}>📋</div>
                <div style={{ color:'#660033', fontWeight:700, marginTop:10 }}>{boardLevel==='All'?'No games posted yet':`No posts for L${boardLevel} yet`}</div>
                <div style={{ fontSize:12, color:'#888', marginTop:5 }}>Be the first to post a game!</div>
              </div>
            ) : boardPosts.map(post => {
              const isOwner   = currentUser?.id === post.player_id
              const alreadyIn = currentUser && post.interested_ids.includes(currentUser.id)
              const spotsLeft = Math.max(0, post.spots_needed - post.interested_ids.length)
              const full      = spotsLeft === 0
              const c         = levelColor[post.level]
              return (
                <div key={post.id} style={{ background:'#fff', border:`1px solid ${c}20`, borderLeft:`3px solid ${c}`, borderRadius:16, padding:'15px 16px', display:'flex', flexDirection:'column', gap:11 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:11 }}>
                    <Avatar initials={post.player_avatar} size={38} level={post.level} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                        <span style={{ fontWeight:800, fontSize:14, color:'#660033' }}>{post.player_name}</span>
                        <LevelBadge level={post.level} small />
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3, flexWrap:'wrap' }}>
                        {(post.allowed_levels || [post.level]).map((l: string) => (
                          <span key={l} style={{ background:levelBg[l], color:levelColor[l], border:`1px solid ${levelColor[l]}40`, borderRadius:6, padding:'1px 6px', fontSize:9, fontWeight:800 }}>L{l}</span>
                        ))}
                        <span style={{ fontSize:10, color:'#555' }}>{timeAgo(post.created_at)}</span>
                      </div>
                    </div>
                    {isOwner && <button onClick={() => handleDeletePost(post.id)} style={{ background:'none', border:'none', color:'#444', cursor:'pointer', fontSize:16, padding:'2px 4px', lineHeight:1 }}>✕</button>}
                  </div>
                  {/* Time display */}
                  <div style={{ display:'flex', gap:7, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ background:'rgba(0,0,153,0.07)', color:'#000099', border:'1px solid rgba(0,0,153,0.18)', borderRadius:8, padding:'3px 10px', fontSize:12, fontWeight:700 }}>
                      📅 {formatSlotDisplay(post.slot)}
                    </span>
                  </div>
                  {post.note && <div style={{ fontSize:13, color:'#6b5050', lineHeight:1.5, fontStyle:'italic' }}>"{post.note}"</div>}

                  {/* Player slots */}
                  {(()=>{
                    const totalSlots = post.spots_needed + 1
                    const interestedPlayers = players.filter(p => post.interested_ids.includes(p.id))
                    const organiser = players.find(p => p.id === post.player_id)
                    const filledSlots = [organiser, ...interestedPlayers].filter(Boolean)
                    const emptySlots = Math.max(0, totalSlots - filledSlots.length)
                    const canJoin = !isOwner && currentUser && !alreadyIn && !full
                    const allowedLevels = post.allowed_levels || [post.level]
                    const levelAllowed = currentUser && allowedLevels.includes(currentUser.level)
                    return (
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:'#660033', textTransform:'uppercase', letterSpacing:0.5, marginBottom:7 }}>Players ({filledSlots.length}/{totalSlots})</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                          {filledSlots.map((p:any, i:number) => p && (
                            <div key={p.id} style={{ background:i===0?`${levelColor[p.level]}15`:'rgba(0,102,51,0.07)', border:`1px solid ${i===0?levelColor[p.level]+'40':'rgba(0,102,51,0.22)'}`, borderRadius:10, padding:'8px 10px', display:'flex', alignItems:'center', gap:7 }}>
                              <Avatar initials={p.avatar} size={24} level={p.level} />
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:'#4a3030', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name.split(' ')[0]}</div>
                                <div style={{ fontSize:9, color:i===0?levelColor[p.level]:'#006633', fontWeight:700 }}>{i===0?'Organiser':'Joined'}</div>
                              </div>
                            </div>
                          ))}
                          {Array.from({length:emptySlots}).map((_,i)=>(
                            <button key={`empty-${i}`}
                              onClick={()=>canJoin&&levelAllowed?handleInterest(post.id):!levelAllowed&&currentUser?showNotif(`This game is for ${allowedLevels.map((l:string)=>`L${l}`).join(', ')} only`):null}
                              style={{ background:'#fff', border:`1px solid ${canJoin&&levelAllowed?'rgba(153,0,51,0.3)':'#ddd'}`, borderRadius:10, padding:'8px 10px', cursor:canJoin&&levelAllowed?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', gap:6, minHeight:44 }}>
                              <span style={{ fontSize:14, color:canJoin&&levelAllowed?'#990033':'#bbb' }}>{canJoin&&levelAllowed?'+':'○'}</span>
                              <span style={{ fontSize:11, fontWeight:700, color:canJoin&&levelAllowed?'#990033':'#aaa' }}>{canJoin&&levelAllowed?'Join':'Open'}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                  {alreadyIn && !isOwner && (
                    <button onClick={()=>handleInterest(post.id)} style={{ background:'rgba(153,0,51,0.06)', border:'1px solid rgba(153,0,51,0.25)', borderRadius:10, padding:'8px 0', cursor:'pointer', color:'#990033', fontWeight:700, fontSize:13, fontFamily:'inherit', width:'100%' }}>
                      Cancel my spot
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {/* ══ ARENA ══ */}
        {view==='arena' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16, paddingTop:8 }}>
            <div style={{ textAlign:'center', paddingBottom:4 }}>
              <div style={{ fontSize:32, marginBottom:10 }}>⚔️</div>
              <div style={{ fontSize:20, fontWeight:900, color:'#660033', marginBottom:6 }}>The Arena</div>
              <div style={{ fontSize:12, color:'#990033', fontWeight:600 }}>Ratings · Leaderboard · Match Log</div>
            </div>
            <div style={{ background:'#fff', border:'1px solid #e0d8cc', borderRadius:16, padding:'18px 16px' }}>
              <div style={{ fontSize:14, color:'#6b5050', lineHeight:1.8 }}>
                Every match counts — <span style={{ color:'#4a3030', fontWeight:600 }}>yes, even that one you'd rather forget.</span>
                {' '}The Arena is your club's live rating system. Log your results, track your rating on the <span style={{ color:'#990033', fontWeight:700 }}>1.0–7.0 scale</span>, and see exactly where you stand on the leaderboard.
              </div>
              <div style={{ fontSize:14, color:'#6b5050', lineHeight:1.8, marginTop:12 }}>
                The more you play, the sharper your rating gets — which means better matchups, more competitive games, and <span style={{ color:'#4a3030', fontWeight:600 }}>no more being destroyed by someone who "said they were a beginner".</span>
              </div>
              <div style={{ fontSize:14, color:'#6b5050', lineHeight:1.8, marginTop:12 }}>
                Fair matches. Happy players. <span style={{ color:'#990033', fontWeight:700 }}>Zero excuses.</span>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {[['🏆','Leaderboard','See club rankings'],['🎾','Log Match','Record results'],['📈','My Results','Track your rating']].map(([icon,title,desc]) => (
                <div key={title as string} style={{ background:'#fff', border:'1px solid rgba(102,0,51,0.12)', borderRadius:12, padding:'12px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:20, marginBottom:6 }}>{icon}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#4a3030', marginBottom:3 }}>{title}</div>
                  <div style={{ fontSize:10, color:'#888', lineHeight:1.4 }}>{desc}</div>
                </div>
              ))}
            </div>
            <button onClick={() => router.push('/ratings')} style={{ width:'100%', background:'#660033', border:'none', borderRadius:12, padding:'14px 0', color:'#ffcc66', fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
              Enter The Arena →
            </button>
          </div>
        )}

        {/* ══ MY SCHEDULE ══ */}
        {view==='matches' && (()=>{
          if (!currentUser) return (
            <div style={{ textAlign:'center', padding:'48px 20px' }}>
              <div style={{ fontSize:32 }}>📅</div>
              <div style={{ color:'#555', fontWeight:600, marginTop:10 }}>Log in to see your schedule</div>
            </div>
          )

          const myPosts = posts.filter(p => p.player_id === currentUser.id)
          const joinedPosts = posts.filter(p => p.interested_ids.includes(currentUser.id))

          return (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <Avatar initials={currentUser.avatar} size={46} level={currentUser.level} />
                <div>
                  <div style={{ fontSize:17, fontWeight:800, color:'#660033' }}>{currentUser.name}'s Schedule</div>
                  <div style={{ fontSize:12, color:'#888' }}>{myPosts.length + joinedPosts.length} active games</div>
                </div>
              </div>

              {/* Games I posted */}
              <div>
                <div style={{ fontSize:12, fontWeight:800, color:'#555', textTransform:'uppercase', letterSpacing:0.8, marginBottom:10 }}>
                  Games I posted ({myPosts.length})
                </div>
                {myPosts.length === 0 ? (
                  <div style={{ background:'rgba(0,0,0,0.02)', border:'1px solid rgba(102,0,51,0.12)', borderRadius:14, padding:'20px', textAlign:'center' }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>📋</div>
                    <div style={{ fontSize:13, color:'#6b5050' }}>You haven't posted any games yet</div>
                    <button onClick={() => setView('board')} style={{ marginTop:12, background:'rgba(153,0,51,0.08)', border:'1px solid rgba(153,0,51,0.3)', borderRadius:10, padding:'8px 18px', color:'#990033', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Post a game →</button>
                  </div>
                ) : myPosts.map(p => {
                  const spotsLeft = Math.max(0, p.spots_needed - p.interested_ids.length)
                  const full = spotsLeft === 0
                  return (
                    <div key={p.id} style={{ background:'#fff', border:`1px solid ${levelColor[p.level]}25`, borderLeft:`3px solid ${levelColor[p.level]}`, borderRadius:14, padding:'14px 16px', marginBottom:9, display:'flex', flexDirection:'column', gap:9 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div>
                          <span style={{ background:'rgba(0,0,153,0.07)', color:'#000099', border:'1px solid rgba(0,0,153,0.18)', borderRadius:8, padding:'3px 10px', fontSize:12, fontWeight:700 }}>🕐 {p.slot}</span>
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color: full ? '#00c6a2' : '#888' }}>
                          {full ? '✓ Full' : `${spotsLeft} spot${spotsLeft!==1?'s':''} left`}
                        </span>
                      </div>
                      {p.note && <div style={{ fontSize:13, color:'#777', fontStyle:'italic' }}>"{p.note}"</div>}
                      {p.interested_ids.length > 0 && (
                        <div style={{ fontSize:12, color:'#555' }}>
                          <span style={{ color:'#4ade80', fontWeight:700 }}>{p.interested_ids.length}</span> player{p.interested_ids.length!==1?'s':''} interested
                        </div>
                      )}
                      <button onClick={() => handleDeletePost(p.id)} style={{ background:'transparent', border:'1px solid rgba(248,113,113,0.3)', borderRadius:9, padding:'7px 0', color:'#f87171', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                        Remove post
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Games I joined */}
              <div>
                <div style={{ fontSize:12, fontWeight:800, color:'#555', textTransform:'uppercase', letterSpacing:0.8, marginBottom:10 }}>
                  Games I joined ({joinedPosts.length})
                </div>
                {joinedPosts.length === 0 ? (
                  <div style={{ background:'rgba(0,0,0,0.02)', border:'1px solid rgba(102,0,51,0.12)', borderRadius:14, padding:'20px', textAlign:'center' }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>🎾</div>
                    <div style={{ fontSize:13, color:'#6b5050' }}>You haven't joined any games yet</div>
                    <button onClick={() => setView('board')} style={{ marginTop:12, background:'rgba(153,0,51,0.08)', border:'1px solid rgba(153,0,51,0.3)', borderRadius:10, padding:'8px 18px', color:'#990033', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Browse the board →</button>
                  </div>
                ) : joinedPosts.map(p => {
                  const spotsLeft = Math.max(0, p.spots_needed - p.interested_ids.length)
                  const full = spotsLeft === 0
                  return (
                    <div key={p.id} style={{ background:'#fff', border:`1px solid ${levelColor[p.level]}25`, borderLeft:`3px solid ${levelColor[p.level]}`, borderRadius:14, padding:'14px 16px', marginBottom:9, display:'flex', flexDirection:'column', gap:9 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <Avatar initials={p.player_avatar} size={32} level={p.level} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:'#4a3030' }}>{p.player_name}'s game</div>
                          <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{p.slot}</div>
                        </div>
                        <LevelBadge level={p.level} small />
                      </div>
                      {p.note && <div style={{ fontSize:13, color:'#777', fontStyle:'italic' }}>"{p.note}"</div>}
                      <div style={{ fontSize:12, color: full ? '#00c6a2' : '#888', fontWeight:600 }}>
                        {full ? '✓ Game is full' : `${spotsLeft} spot${spotsLeft!==1?'s':''} still open`}
                      </div>
                      <button onClick={() => handleInterest(p.id)} style={{ background:'transparent', border:'1px solid rgba(248,113,113,0.3)', borderRadius:9, padding:'7px 0', color:'#f87171', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                        Cancel interest
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ══ PROFILE ══ */}
        {view==='profile' && currentUser && (
          <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <Avatar initials={currentUser.avatar} size={52} level={currentUser.level} />
              <div>
                <div style={{ fontSize:18, fontWeight:900, color:'#660033' }}>{currentUser.name}</div>
                <div style={{ fontSize:12, color:'#555', marginTop:2 }}>L{currentUser.level} · {levelDesc[currentUser.level]}</div>
              </div>
            </div>

            <div style={{ background:'#fff', border:'1px solid #e0d8cc', borderRadius:16, padding:'18px' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#990033', marginBottom:16, textTransform:'uppercase', letterSpacing:0.5 }}>Edit Profile</div>

              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:0.5, marginBottom:7 }}>Name</div>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.05)', border:'1px solid #ddd', borderRadius:10, padding:'11px 13px', color:'#4a3030', fontSize:14, fontFamily:'inherit', outline:'none' }}
                />
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:0.5, marginBottom:7 }}>Skill Level</div>
                <div style={{ background:'#fff', border:'1px solid #e0d8cc', borderRadius:10, padding:'11px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:13, color:'#6b5050' }}>Assigned by assessment</span>
                  <span style={{ background:levelBg[currentUser.level], color:levelColor[currentUser.level], border:`1px solid ${levelColor[currentUser.level]}40`, borderRadius:20, padding:'3px 12px', fontSize:12, fontWeight:800 }}>L{currentUser.level} · {levelDesc[currentUser.level]}</span>
                </div>
                <div style={{ fontSize:11, color:'#888', marginTop:6 }}>To change your level, contact your club admin.</div>
              </div>

              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:0.5, marginBottom:10 }}>
                  Availability
                </div>
                <AvailabilityPicker value={editSlots} onChange={setEditSlots} />
              </div>

              <button
                disabled={editLoading || !editName.trim() || editSlots.length === 0}
                onClick={async () => {
                  if (!editName.trim() || editSlots.length === 0) return
                  setEditLoading(true)
                  const initials = editName.trim().split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()
                  const { error } = await supabase.from('profiles').update({
                    name: editName.trim(),
                    avatar: initials,
                    availability: editSlots,
                  }).eq('id', currentUser.id)
                  setEditLoading(false)
                  if (!error) {
                    showNotif('Profile updated!')
                    supabase.auth.getSession().then(({ data: { session } }) => {
                      if (session?.user) loadData(session.user.id)
                    })
                    setView('home')
                  } else {
                    showNotif('Error saving — try again')
                  }
                }}
                style={{
                  width:'100%',
                  background: editLoading ? 'rgba(102,0,51,0.1)' : '#660033',
                  border:'none', borderRadius:12, padding:'13px 0', color:'#ffcc66',
                  fontWeight:800, fontSize:14, cursor: editLoading ? 'default' : 'pointer', fontFamily:'inherit',
                  opacity: editLoading ? 0.6 : 1
                }}
              >
                {editLoading ? 'Saving…' : 'Save Changes'}
              </button>

              <button
                onClick={handleSignOut}
                style={{
                  width:'100%', background:'transparent',
                  border:'1px solid rgba(153,0,51,0.3)', borderRadius:12, padding:'13px 0',
                  color:'#990033', fontWeight:700, fontSize:14,
                  cursor:'pointer', fontFamily:'inherit', marginTop:8
                }}
              >
                Sign Out
              </button>
            </div>


          </div>
        )}

      </div>
    </div>
  )
}
