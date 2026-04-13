'use client'
import React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Rating, Match } from '@/lib/types'

// ─── Rating Engine ────────────────────────────────────────────────────────────
const BANDS = [
  { label:'Beginner',        min:1.0, max:2.5, color:'#990033', bg:'rgba(153,0,51,0.10)'  },
  { label:'Intermediate',    min:2.6, max:4.0, color:'#006633', bg:'rgba(0,102,51,0.10)'  },
  { label:'Advanced',        min:4.1, max:5.5, color:'#000099', bg:'rgba(0,0,153,0.10)'   },
  { label:'Competitive',     min:5.6, max:6.5, color:'#cc9900', bg:'rgba(204,153,0,0.12)' },
  { label:'Elite',           min:6.6, max:7.0, color:'#cc9900', bg:'rgba(204,153,0,0.15)' },
]

function getBand(r: number) {
  return BANDS.find(b => r >= b.min && r <= b.max) || BANDS[0]
}

function getConf(n: number): { label: string; color: string; bg: string } {
  if (n < 5)  return { label:'NC', color:'#888',    bg:'rgba(136,136,136,0.12)' }
  if (n < 10) return { label:'LC', color:'#014a09', bg:'rgba(1,74,9,0.10)'    }
  if (n < 20) return { label:'MC', color:'#000099', bg:'rgba(0,0,153,0.10)'     }
  return             { label:'HC', color:'#006633', bg:'rgba(0,102,51,0.10)'    }
}

function getK(n: number) { return n < 5 ? 0.4 : n < 10 ? 0.3 : n < 20 ? 0.22 : 0.16 }

function marginMult(wG: number, lG: number) {
  const d = wG - lG
  return d >= 8 ? 1.3 : d >= 5 ? 1.15 : d >= 2 ? 1.0 : 0.85
}

function calcNewRating(myR: number, teamAvg: number, oppAvg: number, won: boolean, wG: number, lG: number, n: number) {
  const K = getK(n)
  const E = 1 / (1 + Math.pow(10, (oppAvg - teamAvg) / 4))
  const S = won ? 1 : 0
  const raw = myR + K * (S - E) * marginMult(wG, lG)
  return Math.round(Math.max(1.0, Math.min(7.0, raw)) * 10) / 10
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Avatar({ initials, size = 40, rating }: { initials: string; size?: number; rating: number }) {
  const b = getBand(rating)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: b.bg, border: `2px solid ${b.color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: b.color, fontWeight: 900, fontSize: size * 0.32, flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

function ConfBadge({ n }: { n: number }) {
  const c = getConf(n)
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
      background: c.bg, color: c.color,
    }}>{c.label}</span>
  )
}

function Notif({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div style={{
      position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(1,74,9,0.12)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(2,107,13,0.4)', borderRadius: 14,
      padding: '11px 22px', zIndex: 9999, color: '#014a09',
      fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
    }}>{msg}</div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RatingsPage() {
  const router = useRouter()
  const [ratings,     setRatings]     = useState<Rating[]>([])
  const [history,     setHistory]     = useState<Match[]>([])
  const [currentUser, setCurrentUser] = useState<Rating | null>(null)
  const [userId,      setUserId]      = useState<string | null>(null)
  const [view,        setView]        = useState<'leaderboard' | 'log' | 'my'>('leaderboard')
  const [loading,     setLoading]     = useState(true)
  const [notif,       setNotif]       = useState<string | null>(null)

  // Log match state
  const [selA1, setSelA1] = useState<Rating | null>(null)
  const [selA2, setSelA2] = useState<Rating | null>(null)
  const [selB1, setSelB1] = useState<Rating | null>(null)
  const [selB2, setSelB2] = useState<Rating | null>(null)
  const [s1a, setS1a] = useState('')
  const [s1b, setS1b] = useState('')
  const [s2a, setS2a] = useState('')
  const [s2b, setS2b] = useState('')
  const [s3a, setS3a] = useState('')
  const [s3b, setS3b] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pickingFor, setPickingFor] = useState<'a1'|'a2'|'b1'|'b2'|null>(null)
  const [lockedPlayers, setLockedPlayers] = useState<string[]>([]) // player_ids locked from prefill
  const [viewingPlayer, setViewingPlayer] = useState<Rating|null>(null) // for player profile modal
  const [prefillPostId, setPrefillPostId] = useState<number|null>(null)

  const notifRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showNotif(msg: string) {
    if (notifRef.current) clearTimeout(notifRef.current)
    setNotif(msg)
    notifRef.current = setTimeout(() => setNotif(null), 3000)
  }

  const loadData = useCallback(async () => {
    // Retry session check up to 5 times to handle navigation timing
    let session = null
    for (let i = 0; i < 5; i++) {
      const { data } = await supabase.auth.getSession()
      if (data.session) { session = data.session; break }
      await new Promise(r => setTimeout(r, 400))
    }
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)

    const [ratingsRes, matchesRes] = await Promise.all([
      supabase.from('ratings').select('*').order('rating', { ascending: false }),
      supabase.from('matches').select('*').order('created_at', { ascending: false }),
    ])

    const all: Rating[] = ratingsRes.data || []
    setRatings(all)
    setHistory(matchesRes.data || [])
    const me = all.find(r => r.player_id === session.user.id)
    if (me) {
      setCurrentUser(me)
      // Pre-fill current user as Team A Player 1
      setSelA1(me)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    loadData()
    const tab = sessionStorage.getItem('arenaTab')
    if (tab === 'log' || tab === 'my' || tab === 'leaderboard') {
      setView(tab as 'leaderboard'|'log'|'my')
      sessionStorage.removeItem('arenaTab')
    }
  }, [loadData])

  // Open player profile when navigated from schedule
  useEffect(() => {
    const viewPlayerId = sessionStorage.getItem('viewPlayer')
    if (!viewPlayerId || ratings.length === 0) return
    sessionStorage.removeItem('viewPlayer')
    const player = ratings.find(r => r.player_id === viewPlayerId)
    if (player) setViewingPlayer(player)
  }, [ratings])

  // Pre-fill teams from schedule game once ratings are loaded
  useEffect(() => {
    const prefill = sessionStorage.getItem('prefillGame')
    if (!prefill || ratings.length === 0) return
    sessionStorage.removeItem('prefillGame')
    try {
      const { playerIds, postId } = JSON.parse(prefill)
      if (!playerIds || playerIds.length < 4) return
      const ratingPlayers = playerIds.map((id: string) => ratings.find(r => r.player_id === id)).filter(Boolean)
      if (ratingPlayers.length >= 4) {
        setSelA1(ratingPlayers[0])
        setSelA2(ratingPlayers[1])
        setSelB1(ratingPlayers[2])
        setSelB2(ratingPlayers[3])
        setLockedPlayers(playerIds) // lock all 4 — no swapping allowed
        if (postId) setPrefillPostId(postId)
        setPickingFor(null)
      }
    } catch(e) { console.error('prefill parse error', e) }
  }, [ratings])

  // ── Rating preview calc ───────────────────────────────────────────────────
  function calcPreview() {
    if (!selA1 || !selA2 || !selB1 || !selB2) return null
    const s1av = parseInt(s1a) || 0, s1bv = parseInt(s1b) || 0
    const s2av = parseInt(s2a) || 0, s2bv = parseInt(s2b) || 0
    const s3av = parseInt(s3a) || 0, s3bv = parseInt(s3b) || 0
    const aGames = s1av + s2av + s3av
    const bGames = s1bv + s2bv + s3bv
    if (aGames === 0 && bGames === 0) return null
    const aWon = aGames > bGames
    const wG = Math.max(aGames, bGames), lG = Math.min(aGames, bGames)
    const teamA = (selA1.rating + selA2.rating) / 2
    const teamB = (selB1.rating + selB2.rating) / 2
    return {
      a1: { before: selA1.rating, after: calcNewRating(selA1.rating, teamA, teamB, aWon, wG, lG, selA1.match_count) },
      a2: { before: selA2.rating, after: calcNewRating(selA2.rating, teamA, teamB, aWon, wG, lG, selA2.match_count) },
      b1: { before: selB1.rating, after: calcNewRating(selB1.rating, teamB, teamA, !aWon, wG, lG, selB1.match_count) },
      b2: { before: selB2.rating, after: calcNewRating(selB2.rating, teamB, teamA, !aWon, wG, lG, selB2.match_count) },
      aWon,
    }
  }

  const preview = calcPreview()

  // ── Submit match ──────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!selA1 || !selA2 || !selB1 || !selB2 || !preview) { showNotif('Select 4 players and enter scores'); return }
    if (!s1a || !s1b) { showNotif('Set 1 is required'); return }
    setSubmitting(true)

    const sets_a = [parseInt(s1a)||0, parseInt(s2a)||0, parseInt(s3a)||0].filter((_,i) => i===0 || (s2a&&i===1) || (s3a&&i===2))
    const sets_b = [parseInt(s1b)||0, parseInt(s2b)||0, parseInt(s3b)||0].filter((_,i) => i===0 || (s2b&&i===1) || (s3b&&i===2))

    const { error: matchError } = await supabase.from('matches').insert({
      team_a1_id: selA1.player_id, team_a1_name: selA1.player_name,
      team_a2_id: selA2.player_id, team_a2_name: selA2.player_name,
      team_b1_id: selB1.player_id, team_b1_name: selB1.player_name,
      team_b2_id: selB2.player_id, team_b2_name: selB2.player_name,
      sets_a, sets_b,
      rating_a1_before: preview.a1.before, rating_a1_after: preview.a1.after,
      rating_a2_before: preview.a2.before, rating_a2_after: preview.a2.after,
      rating_b1_before: preview.b1.before, rating_b1_after: preview.b1.after,
      rating_b2_before: preview.b2.before, rating_b2_after: preview.b2.after,
    })

    if (matchError) { showNotif('Error: ' + matchError.message); setSubmitting(false); return }

    // Update all 4 ratings and check for errors
    const updates = await Promise.all([
      supabase.from('ratings').update({ rating: preview.a1.after, match_count: selA1.match_count + 1 }).eq('player_id', selA1.player_id).select(),
      supabase.from('ratings').update({ rating: preview.a2.after, match_count: selA2.match_count + 1 }).eq('player_id', selA2.player_id).select(),
      supabase.from('ratings').update({ rating: preview.b1.after, match_count: selB1.match_count + 1 }).eq('player_id', selB1.player_id).select(),
      supabase.from('ratings').update({ rating: preview.b2.after, match_count: selB2.match_count + 1 }).eq('player_id', selB2.player_id).select(),
    ])
    const updateErrors = updates.filter((r: any) => r.error)
    if (updateErrors.length > 0) {
      console.error('Rating update errors:', updateErrors.map((r: any) => r.error))
      showNotif('Match logged but ratings need RLS fix in Supabase')
    } else {
      showNotif('Match logged! Ratings updated')
    }
    // If this match came from a scheduled game, remove the post
    if (prefillPostId) {
      await supabase.from('post_interests').delete().eq('post_id', prefillPostId)
      await supabase.from('posts').delete().eq('id', prefillPostId)
      setPrefillPostId(null)
    }
    setLockedPlayers([])
    setSelA1(null); setSelA2(null); setSelB1(null); setSelB2(null)
    setS1a(''); setS1b(''); setS2a(''); setS2b(''); setS3a(''); setS3b('')
    setPickingFor(null)
    setSubmitting(false)
    setView('my')
    setTimeout(() => loadData(), 500)
    setTimeout(() => loadData(), 2000)
  }

  // ── Player picker ─────────────────────────────────────────────────────────
  function assignPlayer(r: Rating) {
    if (!pickingFor) return
    const already = [selA1, selA2, selB1, selB2].find(p => p?.player_id === r.player_id)
    if (already) return
    if (pickingFor === 'a1') setSelA1(r)
    if (pickingFor === 'a2') setSelA2(r)
    if (pickingFor === 'b1') setSelB1(r)
    if (pickingFor === 'b2') setSelB2(r)
    // Auto-advance to next empty slot
    const next = pickingFor === 'a1' ? 'a2' : pickingFor === 'a2' ? 'b1' : pickingFor === 'b1' ? 'b2' : null
    setPickingFor(next)
  }

  const s: Record<string, React.CSSProperties> = {
    page:  { minHeight:'100vh', background:'#f5f0e8', fontFamily:"'DM Sans',sans-serif", color:'#014a09', overflowX:'hidden' },
    inner: { maxWidth:480, margin:'0 auto', padding:'0 16px 56px' },
    lbl:   { fontSize:10, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:10 },
  }

  const navBtn = (active: boolean) => ({
    flex:1, background: active ? '#026b0d' : 'transparent',
    border:'none', borderRadius:9, padding:'9px 0',
    fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
    color: active ? '#ffcc66' : 'rgba(255,204,102,0.5)', transition:'all 0.15s',
  } as React.CSSProperties)

  if (loading) return (
    <div style={{ ...s.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'#026b0d', fontSize:14, fontWeight:700 }}>Loading ratings…</div>
    </div>
  )

  const myId = currentUser?.player_id || userId
  const myHistory = history.filter(m =>
    myId && [m.team_a1_id, m.team_a2_id, m.team_b1_id, m.team_b2_id].includes(myId)
  )

  const myRank = currentUser ? ratings.findIndex(r => r.player_id === myId) + 1 : 0

  return (
    <div style={s.page}>
      <Notif msg={notif} />
      <div style={s.inner}>

        {/* Header */}
        <div style={{ padding:'22px 0 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:20, fontWeight:900, color:'#014a09' }}>The Arena</div>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Ratings · Matches · Leaderboard</div>
          </div>
          <button onClick={() => router.push('/')} style={{ background:'#f0ebe0', border:'1px solid #d4c9b8', borderRadius:10, padding:'7px 14px', color:'#014a09', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            ← App
          </button>
        </div>

        {/* Nav */}
        <div style={{ display:'flex', background:'#014a09', borderRadius:12, padding:3, marginBottom:20, gap:2 }}>
          <button style={navBtn(view==='leaderboard')} onClick={() => setView('leaderboard')}>Leaderboard</button>
          <button style={navBtn(view==='log')}         onClick={() => setView('log')}>Log Match</button>
          <button style={navBtn(view==='my')}          onClick={() => setView('my')}>My Results</button>
        </div>

        {/* ══ LEADERBOARD ══ */}
        {view === 'leaderboard' && (
          <div>
            <div style={s.lbl}>Club rankings · {ratings.length} members</div>
            {ratings.map((r, i) => {
              const b = getBand(r.rating)
              const isMe = r.player_id === myId
              return (
                <div key={r.id} onClick={() => !isMe && setViewingPlayer(r)}
                  style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'12px 4px', borderBottom:'1px solid rgba(1,74,9,0.08)',
                  background: isMe ? 'rgba(1,74,9,0.05)' : 'transparent',
                  borderRadius: isMe ? 8 : 0,
                  margin: isMe ? '0 -4px' : 0,
                  cursor: isMe ? 'default' : 'pointer',
                }}>
                  <div style={{ fontSize:13, fontWeight:900, color: i < 3 ? '#014a09' : '#aaa', width:20, textAlign:'center', flexShrink:0, background: i < 3 ? 'rgba(1,74,9,0.1)' : 'transparent', borderRadius:'50%', height:20, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {i + 1}
                  </div>
                  <Avatar initials={r.avatar} size={38} rating={r.rating} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color: isMe ? '#026b0d' : '#014a09' }}>
                      {r.player_name}{isMe ? ' (you)' : ''}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
                      <ConfBadge n={r.match_count} />
                      <span style={{ fontSize:11, color:'#888' }}>{r.match_count} match{r.match_count !== 1 ? 'es' : ''}</span>
                      <span style={{ fontSize:11, color: b.color, fontWeight:700 }}>{b.label}</span>
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:22, fontWeight:900, color:'#014a09' }}>{r.rating.toFixed(1)}</div>
                    <div style={{ height:4, width:60, background:'#e8e0d5', borderRadius:4, overflow:'hidden', marginTop:4 }}>
                      <div style={{ width:`${((r.rating-1)/6)*100}%`, height:'100%', background: b.color, borderRadius:4 }} />
                    </div>
                  </div>
                </div>
              )
            })}
            {ratings.length === 0 && (
              <div style={{ textAlign:'center', padding:'40px 0', color:'#888' }}>No ratings yet — log a match to start!</div>
            )}
          </div>
        )}

        {/* ══ LOG MATCH ══ */}
        {view === 'log' && (()=>{
          // When players are locked from schedule, show drag-to-team UI
          const isFromSchedule = lockedPlayers.length > 0
          // poolPlayers = unassigned players when coming from schedule
          const allFour = [selA1,selA2,selB1,selB2].filter(Boolean) as Rating[]
          const assignedIds = allFour.map(p=>p.player_id)
          // For schedule flow: start with all 4 in pool, unassigned
          const [pool, setPool] = React.useState<Rating[]>([])
          const [initialized, setInitialized] = React.useState(false)

          React.useEffect(()=>{
            if (isFromSchedule && !initialized && allFour.length === 4) {
              setPool(allFour)
              setSelA1(null); setSelA2(null); setSelB1(null); setSelB2(null)
              setInitialized(true)
            }
          },[isFromSchedule, allFour.length])

          function assignToTeam(player: Rating, team: 'a'|'b') {
            const teamSlots = team==='a' ? [selA1,selA2] : [selB1,selB2]
            const setSlots = team==='a' ? [setSelA1,setSelA2] : [setSelB1,setSelB2]
            const emptyIdx = teamSlots.findIndex(s=>!s)
            if (emptyIdx === -1) return // team full
            setSlots[emptyIdx](player)
            setPool(prev => prev.filter(p=>p.player_id !== player.player_id))
          }

          function removeFromTeam(player: Rating, slot: 'a1'|'a2'|'b1'|'b2') {
            if (slot==='a1') setSelA1(null)
            else if (slot==='a2') setSelA2(null)
            else if (slot==='b1') setSelB1(null)
            else setSelB2(null)
            if (isFromSchedule) setPool(prev => [...prev, player])
          }

          return (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Player pool — only shown in schedule flow when players need assigning */}
            {isFromSchedule && pool.length > 0 && (
              <div>
                <div style={{ ...s.lbl, marginBottom:8 }}>Tap to assign players to a team</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                  {pool.map(r => (
                    <div key={r.player_id} style={{ background:'#fff', border:'1px solid rgba(1,74,9,0.2)', borderRadius:11, padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}>
                      <Avatar initials={r.avatar} size={28} rating={r.rating} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#014a09' }}>{r.player_name.split(' ')[0]}</div>
                        <div style={{ fontSize:10, color:'#888' }}>{r.rating.toFixed(1)}</div>
                      </div>
                      <div style={{ display:'flex', gap:5 }}>
                        <button onClick={()=>assignToTeam(r,'a')} disabled={!!(selA1&&selA2)} style={{ background: selA1&&selA2?'#eee':'rgba(0,102,51,0.1)', border:`1px solid ${selA1&&selA2?'#ddd':'rgba(0,102,51,0.3)'}`, borderRadius:7, padding:'4px 8px', color: selA1&&selA2?'#bbb':'#006633', fontSize:10, fontWeight:700, cursor: selA1&&selA2?'default':'pointer', fontFamily:'inherit' }}>W</button>
                        <button onClick={()=>assignToTeam(r,'b')} disabled={!!(selB1&&selB2)} style={{ background: selB1&&selB2?'#eee':'rgba(153,0,51,0.08)', border:`1px solid ${selB1&&selB2?'#ddd':'rgba(153,0,51,0.3)'}`, borderRadius:7, padding:'4px 8px', color: selB1&&selB2?'#bbb':'#990033', fontSize:10, fontWeight:700, cursor: selB1&&selB2?'default':'pointer', fontFamily:'inherit' }}>L</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team A — Winners */}
            <div>
              <div style={{ ...s.lbl, color:'#006633', marginBottom:8 }}>Team A — Winners</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                {([['a1', selA1], ['a2', selA2]] as const).map(([slot, sel]) => (
                  <div key={slot} style={{ padding:'10px 12px', borderRadius:11, border:`1px solid ${sel?'rgba(0,102,51,0.4)':'rgba(0,102,51,0.15)'}`, background:sel?'rgba(0,102,51,0.07)':'rgba(0,0,0,0.02)', display:'flex', alignItems:'center', gap:8, minHeight:52 }}>
                    {sel ? (
                      <>
                        <Avatar initials={sel.avatar} size={28} rating={sel.rating} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'#014a09' }}>{sel.player_name.split(' ')[0]}</div>
                          <div style={{ fontSize:10, color:'#888' }}>{sel.rating.toFixed(1)}</div>
                        </div>
                        <span onClick={()=>removeFromTeam(sel, slot)} style={{ color:'#888', fontSize:14, cursor:'pointer' }}>✕</span>
                      </>
                    ) : (
                      <div style={{ fontSize:12, color:'rgba(0,102,51,0.4)', fontWeight:700 }}>
                        {isFromSchedule ? 'Tap W above' : `+ Player ${slot==='a1'?'1':'2'}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Team B — Losers */}
            <div>
              <div style={{ ...s.lbl, color:'#990033', marginBottom:8 }}>Team B — Losers</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                {([['b1', selB1], ['b2', selB2]] as const).map(([slot, sel]) => (
                  <div key={slot} style={{ padding:'10px 12px', borderRadius:11, border:`1px solid ${sel?'rgba(153,0,51,0.4)':'rgba(153,0,51,0.15)'}`, background:sel?'rgba(153,0,51,0.07)':'rgba(0,0,0,0.02)', display:'flex', alignItems:'center', gap:8, minHeight:52 }}>
                    {sel ? (
                      <>
                        <Avatar initials={sel.avatar} size={28} rating={sel.rating} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'#990033' }}>{sel.player_name.split(' ')[0]}</div>
                          <div style={{ fontSize:10, color:'#888' }}>{sel.rating.toFixed(1)}</div>
                        </div>
                        <span onClick={()=>removeFromTeam(sel, slot)} style={{ color:'#888', fontSize:14, cursor:'pointer' }}>✕</span>
                      </>
                    ) : (
                      <div style={{ fontSize:12, color:'rgba(153,0,51,0.4)', fontWeight:700 }}>
                        {isFromSchedule ? 'Tap L above' : `+ Player ${slot==='b1'?'1':'2'}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Player picker — only for manual (non-schedule) entry */}
            {!isFromSchedule && pickingFor && (
              <div style={{ background:'#fff', border:'1px solid #e0d8cc', borderRadius:12, padding:'10px 12px' }}>
                <div style={{ ...s.lbl, marginBottom:8 }}>Select player</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {ratings.filter(r => ![selA1,selA2,selB1,selB2].find(p=>p?.player_id===r.player_id)).map(r => (
                    <button key={r.id} onClick={() => assignPlayer(r)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#fff', border:'1px solid #e0d8cc', borderRadius:10, cursor:'pointer', fontFamily:'inherit' }}>
                      <Avatar initials={r.avatar} size={30} rating={r.rating} />
                      <div style={{ flex:1, textAlign:'left' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#014a09' }}>{r.player_name}</div>
                        <div style={{ fontSize:11, color:'#888' }}>{getBand(r.rating).label} · {r.rating.toFixed(1)}</div>
                      </div>
                      <ConfBadge n={r.match_count} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Set scores */}
            {selA1 && selA2 && selB1 && selB2 && (
              <div>
                <div style={s.lbl}>Set scores</div>
                {[['Set 1 *', s1a, setS1a, s1b, setS1b], ['Set 2', s2a, setS2a, s2b, setS2b], ['Set 3', s3a, setS3a, s3b, setS3b]].map(([label, va, sa, vb, sb]: any) => (
                  <div key={label as string} style={{ display:'grid', gridTemplateColumns:'50px 1fr 20px 1fr', gap:6, alignItems:'center', marginBottom:8 }}>
                    <div style={{ fontSize:11, color:'#888', fontWeight:700 }}>{label}</div>
                    <input type="number" min="0" max="7" placeholder="—" value={va} onChange={e => sa(e.target.value)}
                      style={{ background:'rgba(0,102,51,0.07)', border:'1px solid rgba(0,102,51,0.3)', borderRadius:9, padding:'9px 0', color:'#006633', fontSize:20, fontWeight:900, textAlign:'center', fontFamily:'inherit', outline:'none', width:'100%' }} />
                    <div style={{ textAlign:'center', color:'#888', fontWeight:700, fontSize:13 }}>–</div>
                    <input type="number" min="0" max="7" placeholder="—" value={vb} onChange={e => sb(e.target.value)}
                      style={{ background:'rgba(153,0,51,0.07)', border:'1px solid rgba(153,0,51,0.3)', borderRadius:9, padding:'9px 0', color:'#990033', fontSize:20, fontWeight:900, textAlign:'center', fontFamily:'inherit', outline:'none', width:'100%' }} />
                  </div>
                ))}
              </div>
            )}
          </div>
          )
        })()}

            {/* Rating preview */}
            {preview && (
              <div style={{ background:'rgba(2,107,13,0.06)', border:'1px solid rgba(2,107,13,0.2)', borderRadius:12, padding:'12px 14px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#026b0d', textTransform:'uppercase', letterSpacing:0.5, marginBottom:10 }}>
                  Rating preview · {preview.aWon ? 'Team A wins' : 'Team B wins'}
                </div>
                {[
                  { p: selA1, r: preview.a1, won: preview.aWon },
                  { p: selA2, r: preview.a2, won: preview.aWon },
                  { p: selB1, r: preview.b1, won: !preview.aWon },
                  { p: selB2, r: preview.b2, won: !preview.aWon },
                ].map(({ p, r, won }) => {
                  if (!p) return null
                  const delta = Math.round((r.after - r.before) * 10) / 10
                  return (
                    <div key={p.player_id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <Avatar initials={p.avatar} size={22} rating={p.rating} />
                        <span style={{ fontSize:12, color:'#6b5050' }}>{p.player_name.split(' ')[0]}</span>
                      </div>
                      <span style={{ fontSize:13, fontWeight:700, color: won ? '#006633' : '#026b0d' }}>
                        {r.before.toFixed(1)} → {r.after.toFixed(1)} ({delta >= 0 ? '+' : ''}{delta.toFixed(1)})
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {selA1 && selA2 && selB1 && selB2 && (
              <button onClick={handleSubmit} disabled={submitting || !s1a || !s1b} style={{
                width:'100%', background: (!s1a||!s1b||submitting) ? 'rgba(1,74,9,0.08)' : '#014a09',
                border:'none', borderRadius:12, padding:'14px 0', color: (!s1a||!s1b||submitting) ? '#aaa' : '#ffcc66',
                fontWeight:800, fontSize:15, cursor: (!s1a||!s1b||submitting) ? 'default' : 'pointer', fontFamily:'inherit',
              }}>
                {submitting ? 'Logging…' : 'Confirm & Log Match →'}
              </button>
            )}
          </div>
          )
        })()}

        {/* ══ MY RESULTS ══ */}
        {view === 'my' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {currentUser ? (
              <>
                {/* My rating card */}
                <div style={{ background:'rgba(2,107,13,0.06)', border:'1px solid rgba(2,107,13,0.2)', borderRadius:16, padding:'16px', display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ fontSize:40, fontWeight:900, color:'#026b0d', lineHeight:1 }}>
                    {currentUser.rating.toFixed(1)}
                  </div>
                  <div>
                    <div style={{ fontSize:12, color:'#888', marginBottom:3 }}>Your current rating</div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#014a09' }}>{currentUser.player_name}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:6 }}>
                      <ConfBadge n={myHistory.length} />
                      <span style={{ fontSize:11, color:'#888' }}>{myHistory.length} matches · rank #{myRank}</span>
                    </div>
                  </div>
                </div>

                {/* Band indicator */}
                <div style={{ background:'#fff', border:'1px solid rgba(1,74,9,0.12)', borderRadius:12, padding:'12px 14px' }}>
                  <div style={{ ...s.lbl, marginBottom:8 }}>Rating bands</div>
                  {BANDS.map(b => {
                    const active = currentUser.rating >= b.min && currentUser.rating <= b.max
                    return (
                      <div key={b.label} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0' }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background: active ? b.color : '#ddd', flexShrink:0 }} />
                        <div style={{ flex:1, fontSize:12, color: active ? b.color : '#888', fontWeight: active ? 700 : 400 }}>{b.label}</div>
                        <div style={{ fontSize:11, color: active ? b.color : '#aaa' }}>{b.min.toFixed(1)}–{b.max.toFixed(1)}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Match history */}
                <div style={s.lbl}>All matches ({myHistory.length})</div>
                {myHistory.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'30px 0', color:'#888', fontSize:13 }}>No matches logged yet</div>
                ) : myHistory.map(m => {
                  const onA = [m.team_a1_id, m.team_a2_id].includes(myId!)
                  const won = onA
                    ? (m.sets_a.reduce((a:number,b:number)=>a+b,0) > m.sets_b.reduce((a:number,b:number)=>a+b,0))
                    : (m.sets_b.reduce((a:number,b:number)=>a+b,0) > m.sets_a.reduce((a:number,b:number)=>a+b,0))
                  const isA1 = m.team_a1_id === myId
                  const isA2 = m.team_a2_id === myId
                  const before = isA1 ? m.rating_a1_before : isA2 ? m.rating_a2_before : m.team_b1_id === myId ? m.rating_b1_before : m.rating_b2_before
                  const after  = isA1 ? m.rating_a1_after  : isA2 ? m.rating_a2_after  : m.team_b1_id === myId ? m.rating_b1_after  : m.rating_b2_after
                  const delta  = Math.round((after - before) * 10) / 10
                  const sets = m.sets_a.map((a:number,i:number) => `${a}-${m.sets_b[i]}`).join(', ')
                  const partner = onA
                    ? (isA1 ? m.team_a2_name : m.team_a1_name)
                    : (m.team_b1_id === myId ? m.team_b2_name : m.team_b1_name)
                  const opp1 = onA ? m.team_b1_name : m.team_a1_name
                  const opp2 = onA ? m.team_b2_name : m.team_a2_name

                  return (
                    <div key={m.id} style={{
                      background:'#fff', border:'1px solid rgba(1,74,9,0.12)',
                      borderLeft:`3px solid ${won?'#006633':'#026b0d'}`, borderRadius:12, padding:'12px 14px', marginBottom:6,
                    }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                        <div style={{ fontSize:11, color:'#888' }}>{new Date(m.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
                        <div style={{ fontSize:13, fontWeight:700, color: won ? '#006633' : '#026b0d' }}>
                          {won ? 'W' : 'L'} · {sets}
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                        <div style={{ padding:'7px 9px', borderRadius:8, background: won?'rgba(0,102,51,0.07)':'rgba(2,107,13,0.05)', border:`1px solid ${won?'rgba(0,102,51,0.2)':'rgba(2,107,13,0.15)'}` }}>
                          <div style={{ fontSize:9, fontWeight:700, color: won?'#006633':'#026b0d', textTransform:'uppercase', marginBottom:3 }}>{won?'Won':'Lost'}</div>
                          <div style={{ fontSize:11, color:'#6b5050', lineHeight:1.5 }}>You<br/>{partner.split(' ')[0]}</div>
                        </div>
                        <div style={{ padding:'7px 9px', borderRadius:8, background: !won?'rgba(0,102,51,0.07)':'rgba(2,107,13,0.05)', border:`1px solid ${!won?'rgba(0,102,51,0.2)':'rgba(2,107,13,0.15)'}` }}>
                          <div style={{ fontSize:9, fontWeight:700, color: !won?'#006633':'#026b0d', textTransform:'uppercase', marginBottom:3 }}>{!won?'Won':'Lost'}</div>
                          <div style={{ fontSize:11, color:'#6b5050', lineHeight:1.5 }}>{opp1.split(' ')[0]}<br/>{opp2.split(' ')[0]}</div>
                        </div>
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color: delta >= 0 ? '#006633' : '#026b0d' }}>
                        {before.toFixed(1)} → {after.toFixed(1)} ({delta >= 0 ? '+' : ''}{delta.toFixed(1)} rating)
                      </div>
                    </div>
                  )
                })}
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'40px 20px' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>🎾</div>
                <div style={{ fontSize:15, fontWeight:700, color:'#014a09', marginBottom:8 }}>You're not in the ratings yet</div>
                <div style={{ fontSize:13, color:'#888', marginBottom:20 }}>Log a match to get your first rating</div>
                <button onClick={() => setView('log')} style={{ background:'#014a09', border:'none', borderRadius:12, padding:'12px 28px', color:'#ffcc66', fontWeight:800, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>
                  Log a match →
                </button>
              </div>
            )}
          </div>
        )}

      </div>
      {/* Player profile modal */}
      {viewingPlayer && (() => {
        const vp = viewingPlayer
        const b = getBand(vp.rating)
        const vpHistory = history.filter(m =>
          [m.team_a1_id, m.team_a2_id, m.team_b1_id, m.team_b2_id].includes(vp.player_id)
        )
        const vpRank = ratings.findIndex(r => r.player_id === vp.player_id) + 1
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }}
            onClick={() => setViewingPlayer(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background:'#f5f0e8', borderRadius:'20px 20px 0 0', padding:'24px 20px 40px', width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <Avatar initials={vp.avatar} size={48} rating={vp.rating} />
                  <div>
                    <div style={{ fontSize:18, fontWeight:900, color:'#014a09' }}>{vp.player_name}</div>
                    <div style={{ fontSize:12, color:'#888' }}>Rank #{vpRank} · {b.label}</div>
                  </div>
                </div>
                <button onClick={() => setViewingPlayer(null)} style={{ background:'none', border:'none', color:'#888', fontSize:20, cursor:'pointer' }}>✕</button>
              </div>
              {/* Rating card */}
              <div style={{ background:'#014a09', border:'1px solid #026b0d', borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ fontSize:38, fontWeight:900, color:'#ffcc66', lineHeight:1 }}>{vp.rating.toFixed(1)}</div>
                <div>
                  <div style={{ fontSize:11, color:'rgba(255,204,102,0.7)', marginBottom:3 }}>Current rating</div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{b.label}</div>
                  <div style={{ fontSize:11, color:'rgba(255,204,102,0.6)', marginTop:3 }}>{vp.match_count} match{vp.match_count!==1?'es':''} played</div>
                </div>
              </div>
              {/* Match history */}
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'#014a09', textTransform:'uppercase', letterSpacing:0.6, marginBottom:10 }}>Match history ({vpHistory.length})</div>
                {vpHistory.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'20px 0', fontSize:13, color:'#888' }}>No matches logged yet</div>
                ) : vpHistory.slice(0,10).map((m:any) => {
                  const onA = [m.team_a1_id, m.team_a2_id].includes(vp.player_id)
                  const won = onA
                    ? (m.sets_a.reduce((a:number,b:number)=>a+b,0) > m.sets_b.reduce((a:number,b:number)=>a+b,0))
                    : (m.sets_b.reduce((a:number,b:number)=>a+b,0) > m.sets_a.reduce((a:number,b:number)=>a+b,0))
                  const isA1 = m.team_a1_id === vp.player_id
                  const isA2 = m.team_a2_id === vp.player_id
                  const before = isA1?m.rating_a1_before:isA2?m.rating_a2_before:m.team_b1_id===vp.player_id?m.rating_b1_before:m.rating_b2_before
                  const after  = isA1?m.rating_a1_after :isA2?m.rating_a2_after :m.team_b1_id===vp.player_id?m.rating_b1_after :m.rating_b2_after
                  const delta  = Math.round((after - before) * 10) / 10
                  const sets   = m.sets_a.map((a:number,i:number)=>`${a}-${m.sets_b[i]}`).join(', ')
                  const partner = onA?(isA1?m.team_a2_name:m.team_a1_name):(m.team_b1_id===vp.player_id?m.team_b2_name:m.team_b1_name)
                  const opp1 = onA?m.team_b1_name:m.team_a1_name
                  const opp2 = onA?m.team_b2_name:m.team_a2_name
                  return (
                    <div key={m.id} style={{ background:'#fff', border:'1px solid rgba(1,74,9,0.1)', borderLeft:`3px solid ${won?'#006633':'#990033'}`, borderRadius:12, padding:'11px 14px', marginBottom:7 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <div style={{ fontSize:11, color:'#888' }}>{new Date(m.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:won?'#006633':'#990033' }}>{won?'W':'L'} · {sets}</div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:7 }}>
                        <div style={{ padding:'6px 8px', borderRadius:8, background:won?'rgba(0,102,51,0.07)':'rgba(153,0,51,0.05)', border:`1px solid ${won?'rgba(0,102,51,0.2)':'rgba(153,0,51,0.15)'}` }}>
                          <div style={{ fontSize:9, fontWeight:700, color:won?'#006633':'#990033', textTransform:'uppercase', marginBottom:2 }}>{won?'Won':'Lost'}</div>
                          <div style={{ fontSize:11, color:'#014a09' }}>{vp.player_name.split(' ')[0]}<br/>{partner.split(' ')[0]}</div>
                        </div>
                        <div style={{ padding:'6px 8px', borderRadius:8, background:!won?'rgba(0,102,51,0.07)':'rgba(153,0,51,0.05)', border:`1px solid ${!won?'rgba(0,102,51,0.2)':'rgba(153,0,51,0.15)'}` }}>
                          <div style={{ fontSize:9, fontWeight:700, color:!won?'#006633':'#990033', textTransform:'uppercase', marginBottom:2 }}>{!won?'Won':'Lost'}</div>
                          <div style={{ fontSize:11, color:'#014a09' }}>{opp1.split(' ')[0]}<br/>{opp2.split(' ')[0]}</div>
                        </div>
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color:delta>=0?'#006633':'#990033' }}>{before.toFixed(1)} → {after.toFixed(1)} ({delta>=0?'+':''}{delta.toFixed(1)} rating)</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

