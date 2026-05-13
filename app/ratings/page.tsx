'use client'
import React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Rating, Match } from '@/lib/types'

// ─── Rating Engine ────────────────────────────────────────────────────────────
// UPDATED: band colours aligned with staff portal palette
const BANDS = [
  { label:'Starter',  min:1.0, max:1.9, color:'#990033', bg:'rgba(153,0,51,0.10)'    },
  { label:'Social',   min:2.0, max:2.9, color:'#990033', bg:'rgba(153,0,51,0.10)'    },
  { label:'Club',     min:3.0, max:4.4, color:'#0077aa', bg:'rgba(0,119,170,0.10)'   },
  { label:'Premier',  min:4.5, max:5.9, color:'#000099', bg:'rgba(0,0,153,0.10)'     },
  { label:'Elite',    min:6.0, max:7.0, color:'#cc9900', bg:'rgba(204,153,0,0.12)'   },
]

function getBand(r: number) {
  return BANDS.find(b => r >= b.min && r <= b.max) || BANDS[0]
}

function getConf(n: number): { label: string; color: string; bg: string } {
  if (n < 5)  return { label:'NC', color:'rgba(26,58,42,0.4)', bg:'rgba(26,58,42,0.08)'  }
  if (n < 10) return { label:'Calibrating', color:'#888',  bg:'rgba(85,85,85,0.10)' }
  const pct = Math.min((n - 10) * 10, 100)
  return { label:`${pct}% confident`, color:'#014a09', bg:'rgba(26,58,42,0.10)' }
}

function getK(n: number) {
  if (n < 10) return 0.48
  const conf = Math.min((n - 10) * 10, 100)
  return Math.round((0.48 - 0.36 * conf / 100) * 1000) / 1000
}

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
// UPDATED: solid band-coloured circle, white initials
function Avatar({ initials, size = 40, rating }: { initials: string; size?: number; rating: number }) {
  const b = getBand(rating)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: b.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 500, fontSize: size * 0.32, flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

function ConfBadge({ n }: { n: number }) {
  const c = getConf(n)
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 10,
      background: c.bg, color: c.color, letterSpacing: '0.04em',
    }}>{c.label}</span>
  )
}

function Notif({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div style={{
      position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(26,58,42,0.1)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(45,92,66,0.35)', borderRadius: 14,
      padding: '11px 22px', zIndex: 9999, color: '#014a09',
      fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', letterSpacing: '0.02em',
    }}>{msg}</div>
  )
}

// ─── Score row component ──────────────────────────────────────────────────────
function SetRow({
  label,
  va, setVa, vb, setVb,
  tba, setTba, tbb, setTbb,
  aWinning, bWinning,
}: {
  label: string
  va: string; setVa: (v: string) => void
  vb: string; setVb: (v: string) => void
  tba: string; setTba: (v: string) => void
  tbb: string; setTbb: (v: string) => void
  aWinning: boolean; bWinning: boolean
}) {
  const a = parseInt(va) || 0
  const b = parseInt(vb) || 0
  const showTb = (a === 7 && b === 6) || (a === 6 && b === 7)
  const hasVal = va !== '' || vb !== ''

  const aRowWin = hasVal && a > b
  const bRowWin = hasVal && b > a

  function inputStyle(side: 'a' | 'b', rowWin: boolean, rowLose: boolean): React.CSSProperties {
    const win  = { bg: 'rgba(26,92,53,0.07)',   border: 'rgba(26,92,53,0.4)',   color: '#1a5c35' }
    const lose = { bg: 'rgba(139,32,32,0.07)',  border: 'rgba(139,32,32,0.4)', color: '#8b2020' }
    const neu  = { bg: 'rgba(26,58,42,0.04)',   border: 'rgba(26,58,42,0.15)', color: 'rgba(26,58,42,0.4)' }
    const { bg, border, color } = rowWin ? win : rowLose ? lose : neu
    return {
      background: bg, border: `1px solid ${border}`,
      borderRadius: 9, padding: '9px 0',
      color, fontSize: 20, fontWeight: 500, textAlign: 'center',
      fontFamily: 'inherit', outline: 'none', width: '100%',
      transition: 'all 0.15s',
    }
  }

  function tbStyle(side: 'a' | 'b', rowWin: boolean, rowLose: boolean): React.CSSProperties {
    const win  = { bg: 'rgba(26,92,53,0.05)',   border: 'rgba(26,92,53,0.35)',   color: '#1a5c35' }
    const lose = { bg: 'rgba(139,32,32,0.05)',  border: 'rgba(139,32,32,0.35)', color: '#8b2020' }
    const neu  = { bg: 'rgba(26,58,42,0.02)',   border: 'rgba(26,58,42,0.2)',   color: 'rgba(26,58,42,0.35)' }
    const { bg, border, color } = rowWin ? win : rowLose ? lose : neu
    return {
      background: bg, border: `1px dashed ${border}`,
      borderRadius: 7, padding: '5px 0',
      color, fontSize: 14, fontWeight: 500, textAlign: 'center',
      fontFamily: 'inherit', outline: 'none', width: '100%',
      transition: 'all 0.15s',
    }
  }

  return (
    <div style={{ marginBottom: showTb ? 4 : 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 20px 1fr', gap: 6, alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: 'rgba(26,58,42,0.45)', fontWeight: 400, letterSpacing: '0.04em' }}>
          {label}
        </div>
        <input
          type="number" min="0" max="7" placeholder="—"
          value={va} onChange={e => setVa(e.target.value)}
          style={inputStyle('a', aRowWin, bRowWin)}
        />
        <div style={{ textAlign: 'center', color: 'rgba(26,58,42,0.35)', fontWeight: 400, fontSize: 13 }}>–</div>
        <input
          type="number" min="0" max="7" placeholder="—"
          value={vb} onChange={e => setVb(e.target.value)}
          style={inputStyle('b', bRowWin, aRowWin)}
        />
      </div>

      {showTb && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '50px 1fr 20px 1fr',
          gap: 6, alignItems: 'center',
          marginTop: 4, marginBottom: 8,
          animation: 'fadeSlideIn 0.15s ease',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(26,58,42,0.35)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            TB
          </div>
          <input
            type="number" min="0" max="20" placeholder="TB"
            value={tba} onChange={e => setTba(e.target.value)}
            style={tbStyle('a', aRowWin, bRowWin)}
          />
          <div style={{ textAlign: 'center', color: 'rgba(26,58,42,0.2)', fontWeight: 400, fontSize: 11 }}>–</div>
          <input
            type="number" min="0" max="20" placeholder="TB"
            value={tbb} onChange={e => setTbb(e.target.value)}
            style={tbStyle('b', bRowWin, aRowWin)}
          />
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RatingsPage() {
  const router = useRouter()
  const [ratings,     setRatings]     = useState<Rating[]>([])
  const [history,     setHistory]     = useState<Match[]>([])
  const [currentUser, setCurrentUser] = useState<Rating | null>(null)
  const [userId,      setUserId]      = useState<string | null>(null)
  const [view,        setView]        = useState<'leaderboard' | 'log' | 'league'>('leaderboard')
  const [loading,     setLoading]     = useState(true)
  const [notif,       setNotif]       = useState<string | null>(null)

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

  const [tb1a, setTb1a] = useState('')
  const [tb1b, setTb1b] = useState('')
  const [tb2a, setTb2a] = useState('')
  const [tb2b, setTb2b] = useState('')
  const [tb3a, setTb3a] = useState('')
  const [tb3b, setTb3b] = useState('')

  const [submitting,    setSubmitting]    = useState(false)
  const [pickingFor,    setPickingFor]    = useState<'a1'|'a2'|'b1'|'b2'|null>(null)
  const [lockedPlayers, setLockedPlayers] = useState<string[]>([])
  const [viewingPlayer, setViewingPlayer] = useState<Rating|null>(null)
  const [prefillPostId, setPrefillPostId] = useState<number|null>(null)
  const [pool,          setPool]          = useState<Rating[]>([])
  const [poolInitialized, setPoolInitialized] = useState(false)
  const [draggedPlayer, setDraggedPlayer] = useState<Rating | null>(null)

  const notifRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showNotif(msg: string) {
    if (notifRef.current) clearTimeout(notifRef.current)
    setNotif(msg)
    notifRef.current = setTimeout(() => setNotif(null), 3000)
  }

  const loadData = useCallback(async () => {
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
    if (me) { setCurrentUser(me); setSelA1(me) }
    setLoading(false)
  }, [router])

  useEffect(() => {
    loadData()
    const tab = sessionStorage.getItem('arenaTab')
    if (tab === 'league') {
      sessionStorage.removeItem('arenaTab')
      router.push('/league')
    } else if (tab === 'log' || tab === 'leaderboard') {
      setView(tab as 'leaderboard'|'log')
      sessionStorage.removeItem('arenaTab')
    }
  }, [loadData])

  useEffect(() => {
    const viewPlayerId = sessionStorage.getItem('viewPlayer')
    if (!viewPlayerId || ratings.length === 0) return
    sessionStorage.removeItem('viewPlayer')
    const player = ratings.find(r => r.player_id === viewPlayerId)
    if (player) setViewingPlayer(player)
  }, [ratings])

  useEffect(() => {
    const prefill = sessionStorage.getItem('prefillGame')
    if (!prefill || ratings.length === 0) return
    sessionStorage.removeItem('prefillGame')
    try {
      const { playerIds, postId } = JSON.parse(prefill)
      if (!playerIds || playerIds.length < 4) return
      const ratingPlayers = playerIds.map((id: string) => ratings.find(r => r.player_id === id)).filter(Boolean)
      if (ratingPlayers.length >= 4) {
        setSelA1(ratingPlayers[0]); setSelA2(ratingPlayers[1])
        setSelB1(ratingPlayers[2]); setSelB2(ratingPlayers[3])
        setLockedPlayers(playerIds)
        if (postId) setPrefillPostId(postId)
        setPickingFor(null)
      }
    } catch(e) { console.error('prefill parse error', e) }
  }, [ratings])

  function setWinner(a: string, b: string): 'a' | 'b' | null {
    const av = parseInt(a), bv = parseInt(b)
    if (isNaN(av) || isNaN(bv) || (av === 0 && bv === 0)) return null
    if (av > bv) return 'a'
    if (bv > av) return 'b'
    return null
  }

  const set1Winner = setWinner(s1a, s1b)
  const set2Winner = setWinner(s2a, s2b)
  const showSet3   = set1Winner !== null && set2Winner !== null && set1Winner !== set2Winner

  useEffect(() => {
    if (!showSet3) { setS3a(''); setS3b(''); setTb3a(''); setTb3b('') }
  }, [showSet3])

  function calcPreview() {
    if (!selA1 || !selA2 || !selB1 || !selB2) return null
    const s1av = parseInt(s1a)||0, s1bv = parseInt(s1b)||0
    const s2av = parseInt(s2a)||0, s2bv = parseInt(s2b)||0
    const s3av = parseInt(s3a)||0, s3bv = parseInt(s3b)||0
    const aGames = s1av + s2av + s3av, bGames = s1bv + s2bv + s3bv
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

    const updates = await Promise.all([
      supabase.from('ratings').update({ rating: preview.a1.after, match_count: selA1.match_count + 1 }).eq('player_id', selA1.player_id).select(),
      supabase.from('ratings').update({ rating: preview.a2.after, match_count: selA2.match_count + 1 }).eq('player_id', selA2.player_id).select(),
      supabase.from('ratings').update({ rating: preview.b1.after, match_count: selB1.match_count + 1 }).eq('player_id', selB1.player_id).select(),
      supabase.from('ratings').update({ rating: preview.b2.after, match_count: selB2.match_count + 1 }).eq('player_id', selB2.player_id).select(),
    ])
    const updateErrors = updates.filter((r: any) => r.error)
    if (updateErrors.length > 0) showNotif('Match logged but ratings need RLS fix in Supabase')
    else showNotif('Match logged! Ratings updated')

    if (prefillPostId) {
      await supabase.from('post_interests').delete().eq('post_id', prefillPostId)
      await supabase.from('posts').delete().eq('id', prefillPostId)
      setPrefillPostId(null)
    }
    setLockedPlayers([])
    setSelA1(null); setSelA2(null); setSelB1(null); setSelB2(null)
    setS1a(''); setS1b(''); setS2a(''); setS2b(''); setS3a(''); setS3b('')
    setTb1a(''); setTb1b(''); setTb2a(''); setTb2b(''); setTb3a(''); setTb3b('')
    setPickingFor(null)
    setSubmitting(false)
    setView('leaderboard')
    setTimeout(() => loadData(), 500)
    setTimeout(() => loadData(), 2000)
  }

  function assignPlayer(r: Rating) {
    if (!pickingFor) return
    const already = [selA1, selA2, selB1, selB2].find(p => p?.player_id === r.player_id)
    if (already) return
    if (pickingFor === 'a1') setSelA1(r)
    if (pickingFor === 'a2') setSelA2(r)
    if (pickingFor === 'b1') setSelB1(r)
    if (pickingFor === 'b2') setSelB2(r)
    const next = pickingFor === 'a1' ? 'a2' : pickingFor === 'a2' ? 'b1' : pickingFor === 'b1' ? 'b2' : null
    setPickingFor(next)
  }

  // UPDATED design tokens
  const s: Record<string, React.CSSProperties> = {
    page:  { minHeight:'100vh', background:'#f9f6f0', fontFamily:"'Jost',sans-serif", color:'#014a09', overflowX:'hidden' },
    inner: { maxWidth:480, margin:'0 auto', padding:'0 16px 80px' },
    lbl:   { fontSize:9, fontWeight:500, color:'rgba(26,58,42,0.38)', textTransform:'uppercase' as const, letterSpacing:'1.2px' as const, marginBottom:8 },
  }

  if (loading) return (
    <div style={{ ...s.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'#2d5c42', fontSize:14, fontWeight:400, letterSpacing:'0.04em' }}>Loading ratings…</div>
    </div>
  )

  const myId = currentUser?.player_id || userId

  return (
    <div style={s.page}>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <Notif msg={notif} />
      <div style={s.inner}>

        {/* ── UPDATED Header — Playfair Display ── */}
        <div style={{ margin:'0 -16px', background:'#1a3a2a', padding:'max(env(safe-area-inset-top), 10px) 16px 8px', borderBottom:'1px solid rgba(184,150,62,0.2)', marginBottom:10 }}>
          <div style={{ fontFamily:"'Playfair Display',serif", color:'#b8963e', fontSize:20, fontWeight:400, letterSpacing:-0.3 }}>The Arena</div>
          <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11, marginTop:3, fontWeight:300, letterSpacing:'0.04em' }}>Live ratings · match history</div>
        </div>

        {/* ── UPDATED Nav pills ── */}
        <div style={{ display:'flex', gap:7, marginBottom:18 }}>
          {(['leaderboard','log','league'] as const).map(v => (
            <button key={v} onClick={() => v === 'league' ? router.push('/league') : setView(v)}
              style={{
                background: view===v ? '#1a3a2a' : 'transparent',
                color: view===v ? '#b8963e' : 'rgba(26,58,42,0.45)',
                fontSize: 11, fontWeight: view===v ? 500 : 400,
                padding: '7px 16px', borderRadius: 20, cursor: 'pointer',
                border: view===v ? 'none' : '1px solid rgba(26,58,42,0.18)',
                fontFamily: 'inherit', whiteSpace: 'nowrap' as const,
                transition: 'all 0.15s', letterSpacing: '0.04em',
              }}>
              {v === 'leaderboard' ? 'Leaderboard' : v === 'log' ? 'Log Match' : 'League'}
            </button>
          ))}
        </div>

        {/* ══ LEADERBOARD ══ */}
        {view === 'leaderboard' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <div style={{ width:14, height:1, background:'#b8963e' }} />
              <div style={{ fontSize:9, fontWeight:500, color:'rgba(26,58,42,0.38)', textTransform:'uppercase' as const, letterSpacing:'1.2px' }}>
                Club rankings · {ratings.length} members
              </div>
            </div>
            {ratings.map((r, i) => {
              const b = getBand(r.rating)
              const isMe = r.player_id === myId
              const rankColor = i === 0 ? '#ffcc66' : i === 1 ? '#888' : i === 2 ? '#a05c2a' : 'rgba(26,58,42,0.22)'
              return (
                <div key={r.id} onClick={() => !isMe && setViewingPlayer(r)}
                  style={{
                    display:'flex', alignItems:'center', gap:12,
                    padding:'12px 14px', borderRadius:14, marginBottom:7,
                    background: isMe ? 'rgba(26,58,42,0.07)' : 'rgba(255,255,255,0.75)',
                    border: isMe ? '1.5px solid rgba(26,58,42,0.2)' : '1px solid rgba(26,58,42,0.08)',
                    cursor: isMe ? 'default' : 'pointer',
                  }}>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:14, fontWeight:400, color: rankColor, width:20, textAlign:'center', flexShrink:0 }}>
                    {i + 1}
                  </div>
                  <Avatar initials={r.avatar} size={38} rating={r.rating} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:500, color: isMe ? '#2d5c42' : '#014a09' }}>
                      {r.player_name}{isMe ? ' (you)' : ''}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
                      <ConfBadge n={r.match_count} />
                      <span style={{ fontSize:11, color:'rgba(26,58,42,0.4)', fontWeight:300 }}>{r.match_count} match{r.match_count !== 1 ? 'es' : ''}</span>
                      <span style={{ fontSize:11, color: b.color, fontWeight:500 }}>{b.label}</span>
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:24, fontWeight:400, color:'#014a09', letterSpacing:-0.5 }}>{r.rating.toFixed(1)}</div>
                    <div style={{ height:2, width:50, background:'rgba(26,58,42,0.08)', borderRadius:4, overflow:'hidden', marginTop:5 }}>
                      <div style={{ width:`${((r.rating-1)/6)*100}%`, height:'100%', background: b.color, borderRadius:4, transition:'width 0.3s' }} />
                    </div>
                  </div>
                </div>
              )
            })}
            {ratings.length === 0 && (
              <div style={{ textAlign:'center', padding:'40px 0', color:'rgba(26,58,42,0.4)', fontWeight:300 }}>No ratings yet — log a match to start!</div>
            )}
          </div>
        )}

        {/* ══ LOG MATCH ══ */}
        {view === 'log' && (() => {
          const isFromSchedule = lockedPlayers.length > 0

          if (isFromSchedule && !poolInitialized && (selA1||selA2||selB1||selB2)) {
            const allFour = [selA1,selA2,selB1,selB2].filter(Boolean) as Rating[]
            if (allFour.length > 0) {
              setTimeout(() => {
                setPool(allFour)
                setSelA1(null); setSelA2(null); setSelB1(null); setSelB2(null)
                setPoolInitialized(true)
              }, 0)
            }
          }

          function assignToSlot(player: Rating, slot: 'a1'|'a2'|'b1'|'b2') {
            if (slot==='a1') setSelA1(player)
            else if (slot==='a2') setSelA2(player)
            else if (slot==='b1') setSelB1(player)
            else setSelB2(player)
            if (isFromSchedule) setPool(prev => prev.filter(p=>p.player_id !== player.player_id))
          }

          function handleDragStart(e: React.DragEvent<HTMLDivElement>, player: Rating) {
            setDraggedPlayer(player)
            e.dataTransfer.effectAllowed = 'move'
          }

          function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }

          function handleDropOnSlot(e: React.DragEvent<HTMLDivElement>, slot: 'a1'|'a2'|'b1'|'b2') {
            e.preventDefault()
            if (!draggedPlayer) return
            const already = [selA1, selA2, selB1, selB2].find(p => p?.player_id === draggedPlayer.player_id)
            if (already && already.player_id !== draggedPlayer.player_id) return
            assignToSlot(draggedPlayer, slot)
            setDraggedPlayer(null)
          }

          function removeFromTeam(player: Rating, slot: 'a1'|'a2'|'b1'|'b2') {
            if (slot==='a1') setSelA1(null)
            else if (slot==='a2') setSelA2(null)
            else if (slot==='b1') setSelB1(null)
            else setSelB2(null)
            if (isFromSchedule) setPool(prev => [...prev, player])
          }

          const allFourSelected = !!(selA1 && selA2 && selB1 && selB2)

          const aTotal   = (parseInt(s1a)||0) + (parseInt(s2a)||0) + (parseInt(s3a)||0)
          const bTotal   = (parseInt(s1b)||0) + (parseInt(s2b)||0) + (parseInt(s3b)||0)
          const aLeading = aTotal > bTotal
          const bLeading = bTotal > aTotal
          const hasScores = aTotal > 0 || bTotal > 0

          const getTeamAStyle = () => {
            if (!hasScores) return { border: 'rgba(26,58,42,0.15)', bg: 'rgba(0,0,0,0.02)', text: 'rgba(26,58,42,0.45)' }
            if (aLeading) return { border: 'rgba(26,92,53,0.4)',   bg: 'rgba(26,92,53,0.07)',  text: '#1a5c35' }
            if (bLeading) return { border: 'rgba(139,32,32,0.4)',  bg: 'rgba(139,32,32,0.07)', text: '#8b2020' }
            return { border: 'rgba(26,58,42,0.15)', bg: 'rgba(0,0,0,0.02)', text: 'rgba(26,58,42,0.45)' }
          }

          const getTeamBStyle = () => {
            if (!hasScores) return { border: 'rgba(26,58,42,0.15)', bg: 'rgba(0,0,0,0.02)', text: 'rgba(26,58,42,0.45)' }
            if (bLeading) return { border: 'rgba(26,92,53,0.4)',   bg: 'rgba(26,92,53,0.07)',  text: '#1a5c35' }
            if (aLeading) return { border: 'rgba(139,32,32,0.4)',  bg: 'rgba(139,32,32,0.07)', text: '#8b2020' }
            return { border: 'rgba(26,58,42,0.15)', bg: 'rgba(0,0,0,0.02)', text: 'rgba(26,58,42,0.45)' }
          }

          const teamAStyle = getTeamAStyle()
          const teamBStyle = getTeamBStyle()

          return (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

              {isFromSchedule && pool.length > 0 && (
                <div>
                  <div style={{ ...s.lbl, marginBottom:8 }}>Drag players to assign teams</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                    {pool.map(r => (
                      <div key={r.player_id} draggable onDragStart={(e) => handleDragStart(e, r)}
                        style={{ background:'rgba(255,255,255,0.75)', borderRadius:12, padding:'10px 12px', display:'flex', alignItems:'center', gap:8, cursor:'grab', transition:'opacity 0.2s', opacity: draggedPlayer?.player_id === r.player_id ? 0.5 : 1, border:'1px solid rgba(26,58,42,0.08)' }}>
                        <Avatar initials={r.avatar} size={28} rating={r.rating} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, fontWeight:500, color:'#014a09' }}>{r.player_name}</div>
                          <div style={{ fontSize:10, color:'rgba(26,58,42,0.4)', fontWeight:300 }}>{r.rating.toFixed(1)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Team A */}
              <div>
                <div style={{ ...s.lbl, marginBottom:8 }}>Team A</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                  {([['a1', selA1], ['a2', selA2]] as const).map(([slot, sel]) => (
                    <div key={slot} onDragOver={handleDragOver} onDrop={(e) => handleDropOnSlot(e, slot)}
                      style={{ padding:'10px 12px', borderRadius:11, border:`${sel ? '1px solid' : '2px dashed'} ${sel?teamAStyle.border:draggedPlayer?'rgba(26,92,53,0.4)':'rgba(26,58,42,0.15)'}`, background:sel?teamAStyle.bg:'rgba(0,0,0,0.02)', display:'flex', alignItems:'center', gap:8, minHeight:52, transition:'all 0.2s', cursor: !isFromSchedule && !sel ? 'pointer' : 'default' }}
                      onClick={() => !isFromSchedule && !sel && setPickingFor(slot)}>
                      {sel ? (
                        <>
                          <Avatar initials={sel.avatar} size={28} rating={sel.rating} />
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:500, color:teamAStyle.text, transition:'color 0.2s' }}>{sel.player_name}</div>
                            <div style={{ fontSize:10, color:'rgba(26,58,42,0.4)', fontWeight:300 }}>{sel.rating.toFixed(1)}</div>
                          </div>
                          <span onClick={e=>{e.stopPropagation();removeFromTeam(sel,slot)}} style={{ color:'rgba(26,58,42,0.35)', fontSize:14, cursor:'pointer' }}>✕</span>
                        </>
                      ) : (
                        <div style={{ fontSize:12, color:'rgba(26,58,42,0.4)', fontWeight:400 }}>
                          {isFromSchedule ? 'Drag player here' : (pickingFor===slot ? 'Select player…' : `+ Player ${slot==='a1'?'1':'2'}`)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Team B */}
              <div>
                <div style={{ ...s.lbl, marginBottom:8 }}>Team B</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                  {([['b1', selB1], ['b2', selB2]] as const).map(([slot, sel]) => (
                    <div key={slot} onDragOver={handleDragOver} onDrop={(e) => handleDropOnSlot(e, slot)}
                      style={{ padding:'10px 12px', borderRadius:11, border:`${sel ? '1px solid' : '2px dashed'} ${sel?teamBStyle.border:draggedPlayer?'rgba(26,92,53,0.4)':'rgba(26,58,42,0.15)'}`, background:sel?teamBStyle.bg:'rgba(0,0,0,0.02)', display:'flex', alignItems:'center', gap:8, minHeight:52, transition:'all 0.2s', cursor: !isFromSchedule && !sel ? 'pointer' : 'default' }}
                      onClick={() => !isFromSchedule && !sel && setPickingFor(slot)}>
                      {sel ? (
                        <>
                          <Avatar initials={sel.avatar} size={28} rating={sel.rating} />
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:500, color:teamBStyle.text, transition:'color 0.2s' }}>{sel.player_name}</div>
                            <div style={{ fontSize:10, color:'rgba(26,58,42,0.4)', fontWeight:300 }}>{sel.rating.toFixed(1)}</div>
                          </div>
                          <span onClick={e=>{e.stopPropagation();removeFromTeam(sel,slot)}} style={{ color:'rgba(26,58,42,0.35)', fontSize:14, cursor:'pointer' }}>✕</span>
                        </>
                      ) : (
                        <div style={{ fontSize:12, color:'rgba(26,58,42,0.4)', fontWeight:400 }}>
                          {isFromSchedule ? 'Drag player here' : (pickingFor===slot ? 'Select player…' : `+ Player ${slot==='b1'?'1':'2'}`)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Player picker */}
              {!isFromSchedule && pickingFor && (
                <div style={{ background:'rgba(255,255,255,0.8)', borderRadius:14, padding:'10px 12px', border:'1px solid rgba(26,58,42,0.08)' }}>
                  <div style={{ ...s.lbl, marginBottom:8 }}>Select player</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {ratings.filter(r => ![selA1,selA2,selB1,selB2].find(p=>p?.player_id===r.player_id)).map(r => (
                      <button key={r.id} onClick={() => assignPlayer(r)}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'transparent', border:'1px solid rgba(26,58,42,0.1)', borderRadius:9, cursor:'pointer', fontFamily:'inherit' }}>
                        <Avatar initials={r.avatar} size={30} rating={r.rating} />
                        <div style={{ flex:1, textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:500, color:'#014a09' }}>{r.player_name}</div>
                          <div style={{ fontSize:11, color:'rgba(26,58,42,0.4)', fontWeight:300 }}>{getBand(r.rating).label} · {r.rating.toFixed(1)}</div>
                        </div>
                        <ConfBadge n={r.match_count} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Scores */}
              {allFourSelected && (() => {
                const aCol = !hasScores ? 'rgba(26,58,42,0.45)' : aLeading ? '#1a5c35' : bLeading ? '#8b2020' : 'rgba(26,58,42,0.45)'
                const bCol = !hasScores ? 'rgba(26,58,42,0.45)' : bLeading ? '#1a5c35' : aLeading ? '#8b2020' : 'rgba(26,58,42,0.45)'

                return (
                  <div>
                    <div style={s.lbl}>Scores</div>
                    <div style={{ display:'grid', gridTemplateColumns:'50px 1fr 20px 1fr', gap:6, marginBottom:6 }}>
                      <div />
                      <div style={{ textAlign:'center', fontSize:11, fontWeight:500, color: aCol, transition:'color 0.2s', letterSpacing:'0.04em' }}>Team A</div>
                      <div />
                      <div style={{ textAlign:'center', fontSize:11, fontWeight:500, color: bCol, transition:'color 0.2s', letterSpacing:'0.04em' }}>Team B</div>
                    </div>

                    <SetRow label="Set 1" va={s1a} setVa={setS1a} vb={s1b} setVb={setS1b} tba={tb1a} setTba={setTb1a} tbb={tb1b} setTbb={setTb1b} aWinning={aLeading} bWinning={bLeading} />
                    <SetRow label="Set 2" va={s2a} setVa={setS2a} vb={s2b} setVb={setS2b} tba={tb2a} setTba={setTb2a} tbb={tb2b} setTbb={setTb2b} aWinning={aLeading} bWinning={bLeading} />

                    {showSet3 && (
                      <div style={{ animation:'fadeSlideIn 0.18s ease' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, marginTop:2 }}>
                          <div style={{ height:1, flex:1, background:'rgba(26,58,42,0.1)' }} />
                          <span style={{ fontSize:9, fontWeight:500, color:'rgba(26,58,42,0.35)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Deciding set</span>
                          <div style={{ height:1, flex:1, background:'rgba(26,58,42,0.1)' }} />
                        </div>
                        <SetRow label="Set 3" va={s3a} setVa={setS3a} vb={s3b} setVb={setS3b} tba={tb3a} setTba={setTb3a} tbb={tb3b} setTbb={setTb3b} aWinning={aLeading} bWinning={bLeading} />
                      </div>
                    )}
                  </div>
                )
              })()}

              {allFourSelected && (
                <button onClick={handleSubmit} disabled={submitting || !s1a || !s1b} style={{
                  width:'100%',
                  background: (!s1a||!s1b||submitting) ? 'rgba(26,58,42,0.06)' : '#014a09',
                  border:'none', borderRadius:12, padding:'15px 0',
                  color: (!s1a||!s1b||submitting) ? 'rgba(26,58,42,0.3)' : '#b8963e',
                  fontWeight:500, fontSize:15,
                  cursor: (!s1a||!s1b||submitting) ? 'default' : 'pointer',
                  fontFamily:'inherit', letterSpacing:'0.06em', transition:'all 0.15s',
                }}>
                  {submitting ? 'Logging…' : 'Confirm & Log Match →'}
                </button>
              )}
            </div>
          )
        })()}

        {/* Rating preview */}
        {preview && (
          <div style={{ background:'rgba(255,255,255,0.8)', border:'1px solid rgba(26,58,42,0.1)', borderRadius:14, padding:'13px 15px', marginTop:16 }}>
            <div style={{ fontSize:10, fontWeight:500, color:'#014a09', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>
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
                <div key={p.player_id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:`1px solid ${won?'rgba(26,92,53,0.08)':'rgba(139,32,32,0.08)'}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <Avatar initials={p.avatar} size={24} rating={p.rating} />
                    <span style={{ fontSize:12, fontWeight:500, color: won?'#014a09':'rgba(139,32,32,0.8)' }}>{p.player_name}</span>
                  </div>
                  <span style={{ fontFamily:"'Playfair Display',serif", fontSize:14, fontWeight:400, color: won ? '#1a5c35' : '#8b2020' }}>
                    {r.before.toFixed(1)} → {r.after.toFixed(1)} ({delta >= 0 ? '+' : ''}{delta.toFixed(1)})
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* ══ LEAGUE ══ */}
        {view === 'league' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ background:'rgba(255,255,255,0.75)', border:'1px solid rgba(26,58,42,0.08)', borderLeft:`3px solid #b8963e`, borderRadius:'0 14px 14px 0', padding:'24px 20px', textAlign:'center' as const }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:400, color:'#014a09', marginBottom:8 }}>Leagues coming soon</div>
              <div style={{ fontSize:13, color:'rgba(26,58,42,0.5)', lineHeight:1.6, fontWeight:300 }}>Create and join club leagues, track standings, and compete in organised seasons.</div>
            </div>
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
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }}
            onClick={() => setViewingPlayer(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background:'#f9f6f0', borderRadius:'20px 20px 0 0', padding:'24px 20px 40px', width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <Avatar initials={vp.avatar} size={48} rating={vp.rating} />
                  <div>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:400, color:'#014a09' }}>{vp.player_name}</div>
                    <div style={{ fontSize:12, color:'rgba(26,58,42,0.45)', fontWeight:300 }}>Rank #{vpRank} · {b.label}</div>
                  </div>
                </div>
                <button onClick={() => setViewingPlayer(null)} style={{ background:'none', border:'none', color:'rgba(26,58,42,0.35)', fontSize:20, cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ background:'#014a09', borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:16, borderLeft:`3px solid #b8963e` }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:38, fontWeight:400, color:'#ffcc66', lineHeight:1 }}>{vp.rating.toFixed(1)}</div>
                <div>
                  <div style={{ fontSize:10, color:'rgba(184,150,62,0.6)', marginBottom:3, letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:300 }}>Current rating</div>
                  <div style={{ fontSize:14, fontWeight:500, color:'#fff' }}>{b.label}</div>
                  <div style={{ fontSize:11, color:'rgba(184,150,62,0.55)', marginTop:3, fontWeight:300 }}>{vp.match_count} match{vp.match_count!==1?'es':''} played</div>
                </div>
              </div>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <div style={{ width:12, height:1, background:'#b8963e' }} />
                  <div style={{ fontSize:9, fontWeight:500, color:'rgba(26,58,42,0.38)', textTransform:'uppercase', letterSpacing:'1.2px' }}>Match history ({vpHistory.length})</div>
                </div>
                {vpHistory.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'20px 0', fontSize:13, color:'rgba(26,58,42,0.4)', fontWeight:300 }}>No matches logged yet</div>
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
                  const wc = won ? '#1a5c35' : '#8b2020'
                  const wbg = won ? 'rgba(26,92,53,0.07)' : 'rgba(139,32,32,0.07)'
                  const wborder = won ? 'rgba(26,92,53,0.2)' : 'rgba(139,32,32,0.22)'
                  return (
                    <div key={m.id} style={{ background:'rgba(255,255,255,0.8)', border:'1px solid rgba(26,58,42,0.08)', borderLeft:`3px solid ${wc}`, borderRadius:'0 12px 12px 0', padding:'11px 14px', marginBottom:7 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <div style={{ fontSize:11, color:'rgba(26,58,42,0.4)', fontWeight:300 }}>{new Date(m.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
                        <div style={{ fontSize:12, fontWeight:500, color:wc }}>{won?'W':'L'} · {sets}</div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:7 }}>
                        <div style={{ padding:'6px 8px', borderRadius:8, background:wbg, border:`1px solid ${wborder}` }}>
                          <div style={{ fontSize:9, fontWeight:500, color:wc, textTransform:'uppercase', marginBottom:2, letterSpacing:'0.06em' }}>{won?'Won':'Lost'}</div>
                          <div style={{ fontSize:11, color:wc, fontWeight:400 }}>{vp.player_name}<br/>{partner}</div>
                        </div>
                        <div style={{ padding:'6px 8px', borderRadius:8, background:won?'rgba(139,32,32,0.07)':'rgba(26,92,53,0.07)', border:`1px solid ${won?'rgba(139,32,32,0.22)':'rgba(26,92,53,0.2)'}` }}>
                          <div style={{ fontSize:9, fontWeight:500, color:won?'#8b2020':'#1a5c35', textTransform:'uppercase', marginBottom:2, letterSpacing:'0.06em' }}>{won?'Lost':'Won'}</div>
                          <div style={{ fontSize:11, color:won?'#8b2020':'#1a5c35', fontWeight:400 }}>{opp1}<br/>{opp2}</div>
                        </div>
                      </div>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:14, fontWeight:400, color:delta>=0?'#1a5c35':'#8b2020' }}>{before.toFixed(1)} → {after.toFixed(1)} ({delta>=0?'+':''}{delta.toFixed(1)} rating)</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Bottom Nav — UPDATED colours ── */}
      <nav style={{ position:'fixed', bottom:0, left:0, right:0, background:'#1a3a2a', padding:'6px 0 10px', zIndex:100, borderTop:'1px solid rgba(184,150,62,0.15)' }}>
        <div style={{ maxWidth:480, margin:'0 auto', display:'flex', width:'100%' }}>
          {([
            { label:'Home',    active:false, action:() => router.push('/') },
            { label:'Board',   active:false, action:() => { sessionStorage.setItem('mainView','board'); router.push('/') } },
            { label:'Arena',   active:true,  action:() => {} },
            { label:'Profile', active:false, action:() => { sessionStorage.setItem('mainView','profile'); router.push('/') } },
          ] as const).map(({ label, active, action }) => {
            const icons: Record<string, React.ReactNode> = {
              Home:    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>,
              Board:   <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"></path></>,
              Arena:   <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
              Profile: <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"></path></>,
            }
            return (
              <button key={label} onClick={action} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:9, color:active?'#b8963e':'rgba(184,150,62,0.35)', fontWeight:active?500:400, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                <svg width="18" height="18" fill="none" stroke={active?'#b8963e':'rgba(184,150,62,0.35)'} strokeWidth="1.6" viewBox="0 0 24 24">{icons[label]}</svg>
                {label}
                {active && <div style={{ width:3, height:3, borderRadius:'50%', background:'#b8963e', marginTop:1 }} />}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

