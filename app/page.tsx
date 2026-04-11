'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Post } from '@/lib/types'

// ─── Constants ───────────────────────────────────────────────────────────────
const allSlots  = ['Sat AM','Sat PM','Sun AM','Sun PM','Mon PM','Wed PM','Thu PM','Fri PM']
const levels    = ['1','2','3','4']
const levelColor: Record<string,string> = { '1':'#f87171','2':'#fb923c','3':'#facc15','4':'#4ade80' }
const levelBg:    Record<string,string> = { '1':'rgba(248,113,113,0.12)','2':'rgba(251,146,60,0.12)','3':'rgba(250,204,21,0.12)','4':'rgba(74,222,128,0.12)' }
const levelDesc:  Record<string,string> = { '1':'Elite','2':'Competitive','3':'Casual','4':'Beginner' }

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
    <div style={{ position:'fixed', top:18, left:'50%', transform:'translateX(-50%)', background:'rgba(0,198,162,0.15)', backdropFilter:'blur(12px)', border:'1px solid rgba(0,198,162,0.4)', borderRadius:14, padding:'11px 22px', zIndex:9999, color:'#00c6a2', fontWeight:700, fontSize:14, whiteSpace:'nowrap', boxShadow:'0 4px 24px rgba(0,198,162,0.2)' }}>
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
  const [view,        setView]        = useState<'home'|'board'|'browse'|'matches'>('home')
  const [boardLevel,  setBoardLevel]  = useState('1')
  const [selected,    setSelected]    = useState<Profile|null>(null)
  const [filter,      setFilter]      = useState({ level:'All', slot:'All' })
  const [showForm,    setShowForm]    = useState(false)
  const [notif,       setNotif]       = useState<string|null>(null)
  const [loading,     setLoading]     = useState(true)

  // Post form state
  const [fSlot,    setFSlot]    = useState('')
  const [fSpots,   setFSpots]   = useState(2)
  const [fNote,    setFNote]    = useState('')

  function showNotif(msg: string) {
    setNotif(msg)
    setTimeout(() => setNotif(null), 2800)
  }

  // ── Load session + data ───────────────────────────────────────────────────
  const loadData = useCallback(async (userId: string) => {
    try {
      const profileRes = await supabase.from('profiles').select('*').eq('id', userId).single()

      if (profileRes.error) {
        console.log('Profile error:', profileRes.error)
        router.push('/onboarding')
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
    if (!currentUser || !fSlot) { showNotif('Pick a time slot'); return }
    const { error } = await supabase.from('posts').insert({
      player_id: currentUser.id,
      player_name: currentUser.name,
      player_avatar: currentUser.avatar,
      level: currentUser.level,
      slot: fSlot,
      spots_needed: fSpots,
      note: fNote.trim(),
    })
    if (error) { showNotif('Error posting: ' + error.message); return }
    setShowForm(false); setFSlot(''); setFSpots(2); setFNote('')
    showNotif('Game posted! 🎾')
    loadData()
  }

  async function handleInterest(postId: number) {
    if (!currentUser) return
    const post = posts.find(p => p.id === postId)
    if (!post) return
    const already = post.interested_ids.includes(currentUser.id)
    if (already) {
      await supabase.from('post_interests').delete().eq('post_id', postId).eq('player_id', currentUser.id)
    } else {
      await supabase.from('post_interests').insert({ post_id: postId, player_id: currentUser.id })
    }
    loadData()
  }

  async function handleDeletePost(postId: number) {
    await supabase.from('posts').delete().eq('id', postId)
    showNotif('Post removed')
    loadData()
  }

  function handleSignOut() {
    supabase.auth.signOut().then(() => router.push('/login'))
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const boardPosts  = posts.filter(p => p.level === boardLevel)
  const openPosts   = posts.filter(p => p.interested_ids.length < p.spots_needed)
  const openByLevel = Object.fromEntries(levels.map(l => [l, posts.filter(p => p.level===l && p.interested_ids.length < p.spots_needed).length]))

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
      <div style={{ minHeight:'100vh', background:'#0a0a0f', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
        <div style={{ fontSize:32 }}>🎾</div>
        <div style={{ color:'#00c6a2', fontSize:14, fontWeight:600 }}>Loading Court Connections…</div>
        <button onClick={() => { window.location.href = '/login' }} style={{ marginTop:8, background:'transparent', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, padding:'8px 20px', color:'#555', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
          Not loading? Click here
        </button>
      </div>
    )
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const navBtnStyle = (active: boolean): React.CSSProperties => ({
    border:'none', borderRadius:10, padding:'8px 0',
    background: active ? 'rgba(0,198,162,0.18)' : 'transparent',
    color: active ? '#00c6a2' : '#555',
    fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:'inherit',
    transition:'all 0.2s', display:'flex', flexDirection:'column', alignItems:'center', gap:2,
    borderBottom: active ? '2px solid #00c6a2' : '2px solid transparent'
  })

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0f', fontFamily:"'DM Sans',sans-serif", color:'#e8e8e8', overflowX:'hidden', position:'relative' }}>
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, background:'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,198,162,0.1) 0%, transparent 60%)' }} />
      <Notif msg={notif} />

      <div style={{ position:'relative', zIndex:1, maxWidth:480, margin:'0 auto', padding:'0 16px 48px' }}>

        {/* Header */}
        <div style={{ padding:'22px 0 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
              <span style={{ fontSize:22 }}>🎾</span>
              <span style={{ fontSize:22, fontWeight:900, letterSpacing:-0.5, color:'#fff' }}>Court Connections</span>
            </div>
            <div style={{ fontSize:12, color:'#555' }}>Connect with players at your level.</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {currentUser && (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:20, padding:'4px 10px 4px 6px', cursor:'pointer' }} onClick={() => setView('matches')} title="My profile">
                  <Avatar initials={currentUser.avatar} size={22} level={currentUser.level} />
                  <span style={{ fontSize:12, fontWeight:700, color:'#ccc' }}>{currentUser.name.split(' ')[0]}</span>
                </div>
                <button onClick={handleSignOut} title="Sign out" style={{ background:'none', border:'none', color:'#444', cursor:'pointer', fontSize:12, padding:'4px 6px', fontFamily:'inherit' }}>↩</button>
              </div>
            )}
            <div style={{ background:'rgba(0,198,162,0.1)', border:'1px solid rgba(0,198,162,0.2)', borderRadius:20, padding:'4px 12px', fontSize:12, color:'#00c6a2', fontWeight:600 }}>
              {players.length} members
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', background:'rgba(255,255,255,0.05)', borderRadius:14, padding:4, marginBottom:22, gap:2 }}>
          {([['home','🏠','Home'],['board','📋','Board'],['browse','🔍','Browse'],['matches','🎯','Matches']] as const).map(([v,icon,label]) => (
            <button key={v} onClick={() => setView(v)} style={{ ...navBtnStyle(view===v), position:'relative' }}>
              <span style={{ fontSize:14 }}>{icon}</span>
              <span>{label}</span>
              {v==='board' && openPosts.length > 0 && (
                <span style={{ position:'absolute', top:2, right:6, background:'#f87171', color:'#fff', borderRadius:'50%', width:15, height:15, fontSize:9, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {openPosts.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══ HOME ══ */}
        {view==='home' && (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div style={{ background:'linear-gradient(135deg,rgba(0,198,162,0.14) 0%,rgba(0,122,255,0.09) 100%)', border:'1px solid rgba(0,198,162,0.2)', borderRadius:20, padding:'26px 22px' }}>
              <div style={{ fontSize:27, fontWeight:900, lineHeight:1.2, color:'#fff', marginBottom:10 }}>
                Need players?<br /><span style={{ color:'#00c6a2' }}>No problem.</span>
              </div>
              <div style={{ fontSize:13, color:'#777', lineHeight:1.6, marginBottom:18 }}>
                Post when you need players, browse who's looking, and get matched by level.
              </div>
              <div style={{ display:'flex', gap:9 }}>
                <button onClick={() => setView('board')} style={{ flex:1, background:'linear-gradient(90deg,#00c6a2,#007aff)', border:'none', borderRadius:12, padding:'12px 0', color:'#fff', fontWeight:800, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>📋 Game Board</button>
                <button onClick={() => setView('browse')} style={{ flex:1, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'12px 0', color:'#ccc', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Browse Players</button>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:9 }}>
              {levels.map(lvl => (
                <button key={lvl} onClick={() => { setBoardLevel(lvl); setView('board') }} style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${levelColor[lvl]}25`, borderRadius:14, padding:'14px 6px', textAlign:'center', cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <div style={{ fontSize:13, fontWeight:900, color:levelColor[lvl] }}>L{lvl}</div>
                  <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1 }}>{players.filter(p=>p.level===lvl).length}</div>
                  <div style={{ fontSize:9, color:'#444', fontWeight:700 }}>{levelDesc[lvl]}</div>
                  {openByLevel[lvl]>0 && <div style={{ background:`${levelColor[lvl]}22`, color:levelColor[lvl], fontSize:9, fontWeight:800, borderRadius:6, padding:'1px 6px', marginTop:2 }}>{openByLevel[lvl]} open</div>}
                </button>
              ))}
            </div>

            <div>
              <div style={{ fontSize:12, fontWeight:800, color:'#444', textTransform:'uppercase', letterSpacing:0.8, marginBottom:10, display:'flex', justifyContent:'space-between' }}>
                <span>Open Games</span>
                <button onClick={() => setView('board')} style={{ background:'none', border:'none', color:'#00c6a2', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>See all →</button>
              </div>
              {openPosts.slice(0,3).map(p => (
                <div key={p.id} onClick={() => { setBoardLevel(p.level); setView('board') }} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${levelColor[p.level]}20`, borderLeft:`3px solid ${levelColor[p.level]}`, borderRadius:12, padding:'11px 14px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:8 }}>
                  <Avatar initials={p.player_avatar} size={32} level={p.level} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'#e8e8e8' }}>{p.player_name}</div>
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
                <div style={{ fontSize:17, fontWeight:900, color:'#fff' }}>Game Board</div>
                <div style={{ fontSize:12, color:'#444', marginTop:2 }}>Players looking to fill their game</div>
              </div>
              {!showForm && (
                <button onClick={() => setShowForm(true)} style={{ background:'linear-gradient(90deg,#00c6a2,#007aff)', border:'none', borderRadius:12, padding:'9px 15px', color:'#fff', fontWeight:800, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>+ Post Game</button>
              )}
            </div>

            {/* Post form */}
            {showForm && currentUser && (
              <div style={{ background:levelBg[currentUser.level], border:`1px solid ${levelColor[currentUser.level]}30`, borderRadius:18, padding:'18px 16px', display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ fontWeight:800, fontSize:14, color:'#fff' }}>Post a Game Request</div>
                <div>
                  <div style={{ fontSize:11, color:'#555', fontWeight:700, marginBottom:7, textTransform:'uppercase', letterSpacing:0.5 }}>When?</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {allSlots.map(s => (
                      <button key={s} onClick={() => setFSlot(s)} style={{ border:`1px solid ${fSlot===s?'rgba(0,122,255,0.5)':'rgba(255,255,255,0.1)'}`, background:fSlot===s?'rgba(0,122,255,0.12)':'transparent', color:fSlot===s?'#60a5fa':'#555', borderRadius:8, padding:'5px 11px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'#555', fontWeight:700, marginBottom:7, textTransform:'uppercase', letterSpacing:0.5 }}>Players needed</div>
                  <div style={{ display:'flex', gap:8 }}>
                    {[1,2,3].map(n => (
                      <button key={n} onClick={() => setFSpots(n)} style={{ flex:1, border:`1px solid ${fSpots===n?`${levelColor[currentUser.level]}50`:'rgba(255,255,255,0.1)'}`, background:fSpots===n?levelBg[currentUser.level]:'transparent', color:fSpots===n?levelColor[currentUser.level]:'#555', borderRadius:8, padding:'9px 0', fontSize:18, fontWeight:900, cursor:'pointer', fontFamily:'inherit' }}>{n}</button>
                    ))}
                  </div>
                </div>
                <textarea value={fNote} onChange={e => setFNote(e.target.value)} placeholder="Optional message…" maxLength={120} style={{ width:'100%', boxSizing:'border-box', resize:'none', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 12px', color:'#ddd', fontSize:13, fontFamily:'inherit', outline:'none', height:60 }} />
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setShowForm(false)} style={{ flex:1, background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 0', color:'#555', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                  <button onClick={handlePostSubmit} style={{ flex:2, background:`linear-gradient(90deg,${levelColor[currentUser.level]},${levelColor[currentUser.level]}99)`, border:'none', borderRadius:10, padding:'10px 0', color:'#fff', fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>Post →</button>
                </div>
              </div>
            )}

            {/* Level tabs */}
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
              {levels.map(l => (
                <button key={l} onClick={() => setBoardLevel(l)} style={{ border:`1px solid ${boardLevel===l?levelColor[l]+'60':'rgba(255,255,255,0.1)'}`, background:boardLevel===l?levelBg[l]:'rgba(255,255,255,0.03)', color:boardLevel===l?levelColor[l]:'#555', borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'inherit', flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
                  L{l} · {levelDesc[l]}
                  {openByLevel[l]>0 && <span style={{ background:boardLevel===l?levelColor[l]:'rgba(255,255,255,0.15)', color:boardLevel===l?'#000':'#888', borderRadius:'50%', width:18, height:18, fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>{openByLevel[l]}</span>}
                </button>
              ))}
            </div>

            {/* Posts */}
            {boardPosts.length===0 ? (
              <div style={{ textAlign:'center', padding:'40px 0' }}>
                <div style={{ fontSize:30 }}>📋</div>
                <div style={{ color:'#444', fontWeight:700, marginTop:10 }}>No posts for L{boardLevel} yet</div>
                <div style={{ fontSize:12, color:'#333', marginTop:5 }}>Be the first to post a game!</div>
              </div>
            ) : boardPosts.map(post => {
              const isOwner   = currentUser?.id === post.player_id
              const alreadyIn = currentUser && post.interested_ids.includes(currentUser.id)
              const spotsLeft = Math.max(0, post.spots_needed - post.interested_ids.length)
              const full      = spotsLeft === 0
              const c         = levelColor[post.level]
              return (
                <div key={post.id} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${c}20`, borderLeft:`3px solid ${c}`, borderRadius:16, padding:'15px 16px', display:'flex', flexDirection:'column', gap:11 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:11 }}>
                    <Avatar initials={post.player_avatar} size={38} level={post.level} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                        <span style={{ fontWeight:800, fontSize:14, color:'#f0f0f0' }}>{post.player_name}</span>
                        <LevelBadge level={post.level} small />
                      </div>
                      <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{timeAgo(post.created_at)}</div>
                    </div>
                    {isOwner && <button onClick={() => handleDeletePost(post.id)} style={{ background:'none', border:'none', color:'#444', cursor:'pointer', fontSize:16, padding:'2px 4px', lineHeight:1 }}>✕</button>}
                  </div>
                  <div style={{ display:'flex', gap:7, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ background:'rgba(0,122,255,0.12)', color:'#60a5fa', border:'1px solid rgba(0,122,255,0.2)', borderRadius:8, padding:'2px 9px', fontSize:11, fontWeight:700 }}>🕐 {post.slot}</span>
                    <span style={{ background:full?'rgba(248,113,113,0.12)':`${c}18`, color:full?'#f87171':c, border:`1px solid ${full?'rgba(248,113,113,0.3)':c+'35'}`, borderRadius:8, padding:'2px 9px', fontSize:12, fontWeight:700 }}>
                      {full ? '⛔ Full' : `${spotsLeft} spot${spotsLeft!==1?'s':''} open`}
                    </span>
                  </div>
                  {post.note && <div style={{ fontSize:13, color:'#888', lineHeight:1.5, fontStyle:'italic' }}>"{post.note}"</div>}
                  {post.interested_ids.length>0 && <div style={{ fontSize:11, color:'#555' }}><span style={{ color:'#4ade80', fontWeight:700 }}>{post.interested_ids.length}</span> interested of {post.spots_needed} needed</div>}
                  {!isOwner && currentUser && (
                    <button onClick={() => handleInterest(post.id)} disabled={full && !alreadyIn} style={{ background:alreadyIn?'rgba(248,113,113,0.1)':full?'rgba(255,255,255,0.03)':`${c}18`, border:`1px solid ${alreadyIn?'rgba(248,113,113,0.4)':full?'rgba(255,255,255,0.08)':c+'50'}`, borderRadius:10, padding:'9px 0', cursor:full&&!alreadyIn?'default':'pointer', color:alreadyIn?'#f87171':full?'#333':c, fontWeight:700, fontSize:13, fontFamily:'inherit' }}>
                      {alreadyIn ? '✓ I\'m in — tap to cancel' : full ? 'Game is full' : '🙋 I\'m Interested!'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ══ BROWSE ══ */}
        {view==='browse' && (
          <div style={{ display:'flex', flexDirection:'column', gap:15 }}>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>All Players</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {([['Level','level',['All',...levels],(o:string)=>o==='All'?'All':`L${o} ${levelDesc[o]}`],['Time','slot',['All',...allSlots],(o:string)=>o]] as const).map(([label,key,opts,fmt]) => (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:12, color:'#444', fontWeight:600, width:40, flexShrink:0 }}>{label}</span>
                  <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
                    {([...opts] as string[]).map(o => (
                      <button key={o} onClick={() => setFilter(f => ({ ...f, [key]:o }))} style={{ border:`1px solid ${filter[key as 'level'|'slot']===o?'rgba(0,198,162,0.5)':'rgba(255,255,255,0.1)'}`, background:filter[key as 'level'|'slot']===o?'rgba(0,198,162,0.12)':'transparent', color:filter[key as 'level'|'slot']===o?'#00c6a2':'#555', borderRadius:20, padding:'4px 11px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}>{fmt(o)}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, color:'#444', fontWeight:600 }}>{filtered.length} players</div>
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              {filtered.map(p => (
                <div key={p.id} style={{ background:'rgba(255,255,255,0.035)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:'15px 16px', display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                    <Avatar initials={p.avatar} size={42} level={p.level} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:15, color:'#f0f0f0' }}>{p.name}</div>
                    </div>
                    <LevelBadge level={p.level} />
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                    {p.availability.map(s => <span key={s} style={{ background:'rgba(0,122,255,0.1)', color:'#60a5fa', border:'1px solid rgba(0,122,255,0.2)', borderRadius:8, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{s}</span>)}
                  </div>
                  <button onClick={() => { setSelected(p); setView('matches') }} style={{ background:'linear-gradient(90deg,#00c6a2,#007aff)', border:'none', borderRadius:10, padding:'8px 0', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Find Matches →</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ MATCHES ══ */}
        {view==='matches' && (
          <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
            {selected ? (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <Avatar initials={selected.avatar} size={46} level={selected.level} />
                  <div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>Matches for {selected.name.split(' ')[0]}</div>
                    <div style={{ fontSize:12, color:'#555' }}>{matches.length} compatible players</div>
                  </div>
                </div>
                {matches.map(m => {
                  const shared = selected.availability.filter(s => m.availability.includes(s))
                  const pct = Math.min(100, Math.round((m.score / 13) * 100))
                  return (
                    <div key={m.id} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(0,198,162,0.18)', borderRadius:14, padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                        <Avatar initials={m.avatar} size={38} level={m.level} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:14, color:'#f0f0f0' }}>{m.name}</div>
                          <div style={{ fontSize:11, color:'#555' }}>L{m.level} · {levelDesc[m.level]}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:17, fontWeight:800, color:'#00c6a2' }}>{pct}%</div>
                          <div style={{ fontSize:9, color:'#444', fontWeight:600 }}>MATCH</div>
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1, height:4, borderRadius:4, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`, height:'100%', borderRadius:4, background:'linear-gradient(90deg,#00c6a2,#007aff)' }} />
                        </div>
                        <LevelBadge level={m.level} small />
                      </div>
                      {shared.length>0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                          {shared.map(s => <span key={s} style={{ background:'rgba(0,198,162,0.1)', color:'#00c6a2', border:'1px solid rgba(0,198,162,0.25)', borderRadius:8, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{s}</span>)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'48px 20px' }}>
                <div style={{ fontSize:32 }}>👤</div>
                <div style={{ color:'#555', fontWeight:600, marginTop:10 }}>No player selected</div>
                <button onClick={() => setView('browse')} style={{ marginTop:14, background:'rgba(0,198,162,0.1)', border:'1px solid rgba(0,198,162,0.3)', borderRadius:12, padding:'10px 22px', color:'#00c6a2', fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>Browse Players</button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
