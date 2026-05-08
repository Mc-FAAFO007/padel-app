'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Post, Rating, Match } from '@/lib/types'

type AdminTab = 'dashboard' | 'users' | 'posts' | 'ratings' | 'matches' | 'analytics' | 'league'

// ── UPDATED to staff portal palette ──
const C = {
  bg:         '#f9f6f0',
  dark:       '#1a3a2a',
  mid:        '#2d5c42',
  gold:       '#b8963e',
  win:        '#1a5c35',
  loss:       '#8b2020',
  cardBorder: 'rgba(26,58,42,0.12)',
}

function ratingToLevel(rating: number): { level: string; color: string; bg: string; desc: string } {
  if (rating >= 6.0) return { level:'1', color:'#cc9900', bg:'rgba(204,153,0,0.12)',  desc:'Elite' }
  if (rating >= 4.5) return { level:'2', color:'#000099', bg:'rgba(0,0,153,0.10)',    desc:'Premier' }
  if (rating >= 3.0) return { level:'3', color:'#0077aa', bg:'rgba(0,119,170,0.10)',  desc:'Club' }
  if (rating >= 2.0) return { level:'4', color:'#990033', bg:'rgba(153,0,51,0.12)',   desc:'Social' }
  return                     { level:'5', color:'#555555', bg:'rgba(85,85,85,0.10)',   desc:'Starter' }
}

// Shared pill helper — consistent with rest of app
function tabPill(active: boolean): React.CSSProperties {
  return active
    ? { background:'#1a3a2a', color:'#b8963e', fontSize:10, fontWeight:500, padding:'6px 14px', borderRadius:20, cursor:'pointer', border:'none', fontFamily:'inherit', whiteSpace:'nowrap' as const, letterSpacing:'0.06em', textTransform:'capitalize' as const, transition:'all 0.15s' }
    : { background:'transparent', color:'rgba(26,58,42,0.45)', fontSize:10, fontWeight:400, padding:'6px 14px', borderRadius:20, cursor:'pointer', border:'1px solid rgba(26,58,42,0.18)', fontFamily:'inherit', whiteSpace:'nowrap' as const, letterSpacing:'0.06em', textTransform:'capitalize' as const, transition:'all 0.15s' }
}

export default function AdminPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [tab,         setTab]         = useState<AdminTab>('dashboard')
  const [loading,     setLoading]     = useState(true)
  const [notif,       setNotif]       = useState<string | null>(null)
  const [users,       setUsers]       = useState<Profile[]>([])
  const [posts,       setPosts]       = useState<Post[]>([])
  const [ratings,     setRatings]     = useState<Rating[]>([])
  const [matches,     setMatches]     = useState<Match[]>([])
  const [editingRating, setEditingRating] = useState<Partial<Rating> | null>(null)

  const [leagueStep,             setLeagueStep]             = useState(1)
  const [leagueName,             setLeagueName]             = useState('')
  const [leagueStart,            setLeagueStart]            = useState('')
  const [leagueEnd,              setLeagueEnd]              = useState('')
  const [leagueFreq,             setLeagueFreq]             = useState<'weekly'|'fortnightly'|'monthly'>('weekly')
  const [leaguePlayers,          setLeaguePlayers]          = useState<string[]>([])
  const [leagueGroups,           setLeagueGroups]           = useState(2)
  const [leagueFormat,           setLeagueFormat]           = useState<'round_robin'|'groups_knockout'>('round_robin')
  const [leaguePointsWin,        setLeaguePointsWin]        = useState(3)
  const [leaguePointsSetsLoss,   setLeaguePointsSetsLoss]   = useState(true)
  const [leaguePointsAllSets,    setLeaguePointsAllSets]    = useState(false)
  const [leaguePointsBagel,      setLeaguePointsBagel]      = useState(true)
  const [leagueGeneratedGroups,  setLeagueGeneratedGroups]  = useState<string[][]>([])
  const [leagueSeedMap,          setLeagueSeedMap]          = useState<Record<string,number>>({})
  const [leagueDay,              setLeagueDay]              = useState('Tuesday')
  const [leagueCreating,         setLeagueCreating]         = useState(false)
  const [leagueCreated,          setLeagueCreated]          = useState(false)
  const [leagueError,            setLeagueError]            = useState('')
  const [leagueSearch,           setLeagueSearch]           = useState('')
  const [leagueLevelFilter,      setLeagueLevelFilter]      = useState<string|null>(null)
  const [existingLeagues,        setExistingLeagues]        = useState<any[]>([])
  const [editingLeague,          setEditingLeague]          = useState<any|null>(null)
  const [editBoxes,              setEditBoxes]              = useState<any[]>([])
  const [editBoxPlayers,         setEditBoxPlayers]         = useState<any[]>([])
  const [editAddSearch,          setEditAddSearch]          = useState('')
  const [editAddLevel,           setEditAddLevel]           = useState<string|null>(null)

  const showNotif = (msg: string) => { setNotif(msg); setTimeout(() => setNotif(null), 3000) }

  function snakeSeed(playerIds: string[], numGroups: number): { groups: string[][], seedMap: Record<string, number> } {
    const sorted = [...playerIds].sort((a, b) => {
      const rA = ratings.find(r => r.player_id === a)?.rating || 0
      const rB = ratings.find(r => r.player_id === b)?.rating || 0
      return rB - rA
    })
    // seed = overall rank by rating (1 = best) — stays within group size after modulo
    const seedMap: Record<string, number> = {}
    sorted.forEach((pid, i) => { seedMap[pid] = (i % 4) + 1 })

    const groups: string[][] = Array.from({ length: numGroups }, () => [])
    sorted.forEach((pid, i) => {
      const round = Math.floor(i / numGroups)
      const pos   = i % numGroups
      const idx   = round % 2 === 0 ? pos : numGroups - 1 - pos
      groups[idx].push(pid)
    })
    return { groups, seedMap }
  }

  async function handleCreateLeague() {
    if (!leagueName || leaguePlayers.length < 4) { showNotif('Need a name and at least 4 players'); return }
    setLeagueCreating(true); setLeagueError('')
    try {
      const { data: league, error: leagueErr } = await supabase.from('leagues').insert({
        name: leagueName, sport: 'padel', status: 'active',
        day_of_week: leagueDay, start_date: leagueStart || null, end_date: leagueEnd || null,
        frequency: leagueFreq, format: leagueFormat, total_rounds: 3,
        points_win: leaguePointsWin, points_sets_loss: leaguePointsSetsLoss,
        points_all_sets: leaguePointsAllSets, points_bagel: leaguePointsBagel,
      }).select().single()
      if (leagueErr || !league) { const msg = leagueErr?.message || 'Unknown error'; setLeagueError(msg); showNotif('Error: ' + msg); setLeagueCreating(false); return }

      for (let gi = 0; gi < leagueGeneratedGroups.length; gi++) {
        const group = leagueGeneratedGroups[gi]
        const { data: box, error: boxErr } = await supabase.from('league_boxes').insert({
          league_id: league.id, box_number: gi + 1, name: 'Group ' + String.fromCharCode(65 + gi)
        }).select().single()
        if (boxErr) { const m = 'Box insert: ' + boxErr.message; setLeagueError(m); showNotif(m); setLeagueCreating(false); return }
        if (!box) continue

        const { error: playersErr } = await supabase.from('league_box_players').insert(
          group.map((pid: string, idx: number) => ({ box_id: box.id, player_id: pid, seed: idx + 1 }))
        )
        if (playersErr) { const m = 'Players insert: ' + playersErr.message; setLeagueError(m); showNotif(m); setLeagueCreating(false); return }

        if (group.length >= 2) {
          const pairs: {t1p1:string,t1p2:string,t2p1:string,t2p2:string,round:number}[] = []
          if (group.length === 4) {
            pairs.push(
              { t1p1:group[0], t1p2:group[1], t2p1:group[2], t2p2:group[3], round:1 },
              { t1p1:group[0], t1p2:group[2], t2p1:group[1], t2p2:group[3], round:2 },
              { t1p1:group[0], t1p2:group[3], t2p1:group[1], t2p2:group[2], round:3 },
            )
          } else if (group.length === 3) {
            pairs.push(
              { t1p1:group[0], t1p2:group[0], t2p1:group[1], t2p2:group[2], round:1 },
              { t1p1:group[1], t1p2:group[1], t2p1:group[0], t2p2:group[2], round:2 },
              { t1p1:group[2], t1p2:group[2], t2p1:group[0], t2p2:group[1], round:3 },
            )
          } else if (group.length === 2) {
            pairs.push({ t1p1:group[0], t1p2:group[0], t2p1:group[1], t2p2:group[1], round:1 })
          }
          const { error: fixErr } = await supabase.from('league_fixtures').insert(pairs.map(f => ({
            league_id: league.id, box_id: box.id, round: f.round, court: gi + 1,
            status: 'upcoming', team_1_p1: f.t1p1, team_1_p2: f.t1p2, team_2_p1: f.t2p1, team_2_p2: f.t2p2,
            scheduled_date: leagueStart || new Date().toISOString().split('T')[0], scheduled_time: '19:00',
          })))
          if (fixErr) { const m = 'Fixtures insert: ' + fixErr.message; setLeagueError(m); showNotif(m); setLeagueCreating(false); return }
        }
      }
      setLeagueCreated(true); showNotif('League created!')
    } catch(e: any) { showNotif('Error: ' + e.message) }
    setLeagueCreating(false)
  }

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: profileData } = await supabase.from('profiles').select('*, is_admin').eq('id', session.user.id).single()
    if (!profileData?.is_admin) { router.push('/'); return }
    setCurrentUser(profileData)
    const [usersRes, postsRes, ratingsRes, matchesRes] = await Promise.all([
      supabase.from('profiles').select('*, is_admin').order('created_at'),
      supabase.from('posts').select('*').order('created_at', { ascending: false }),
      supabase.from('ratings').select('*').order('rating', { ascending: false }),
      supabase.from('matches').select('*').order('created_at', { ascending: false }),
    ])
    setUsers((usersRes.data as Profile[]) || [])
    setPosts(postsRes.data as Post[] || [])
    setRatings(ratingsRes.data as Rating[] || [])
    setMatches(matchesRes.data as Match[] || [])
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  const loadExistingLeagues = async () => {
    const { data } = await supabase.from('leagues').select('*').order('created_at', { ascending: false })
    setExistingLeagues(data || [])
  }

  const loadLeagueForEdit = async (league: any) => {
    setEditingLeague(league)
    const { data: boxes } = await supabase.from('league_boxes').select('*').eq('league_id', league.id).order('box_number')
    setEditBoxes(boxes || [])
    const boxIds = (boxes || []).map((b: any) => b.id)
    if (boxIds.length > 0) {
      const { data: players } = await supabase.from('league_box_players').select('*').in('box_id', boxIds)
      setEditBoxPlayers(players || [])
    } else { setEditBoxPlayers([]) }
  }

  const handleRemoveFromLeague = async (playerId: string) => {
    const boxIds = editBoxes.map((b: any) => b.id)
    await supabase.from('league_box_players').delete().eq('player_id', playerId).in('box_id', boxIds)
    setEditBoxPlayers(prev => prev.filter((p: any) => p.player_id !== playerId))
    showNotif('Player removed')
  }

  const handleAddToLeague = async (playerId: string, boxId: string) => {
    const existingInBox = editBoxPlayers.filter((p: any) => p.box_id === boxId)
    const seed = existingInBox.length + 1
    const { error } = await supabase.from('league_box_players').insert({ box_id: boxId, player_id: playerId, seed })
    if (error) { showNotif('Error: ' + error.message); return }
    setEditBoxPlayers((prev: any[]) => [...prev, { box_id: boxId, player_id: playerId, seed }])
    showNotif('Player added')
  }

  const handleMovePlayer = async (playerId: string, newBoxId: string) => {
    const boxIds = editBoxes.map((b: any) => b.id)
    await supabase.from('league_box_players').delete().eq('player_id', playerId).in('box_id', boxIds)
    const existingInBox = editBoxPlayers.filter((p: any) => p.box_id === newBoxId && p.player_id !== playerId)
    const seed = existingInBox.length + 1
    const { error } = await supabase.from('league_box_players').insert({ box_id: newBoxId, player_id: playerId, seed })
    if (error) { showNotif('Error: ' + error.message); return }
    setEditBoxPlayers((prev: any[]) => [...prev.filter((p: any) => p.player_id !== playerId), { box_id: newBoxId, player_id: playerId, seed }])
    showNotif('Player moved')
  }

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background: C.bg, fontFamily:"'Jost',sans-serif" }}>
      <div style={{ fontSize:14, fontWeight:400, color: C.dark, letterSpacing:'0.04em' }}>Loading admin panel…</div>
    </div>
  )

  if (!currentUser) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background: C.bg, fontFamily:"'Jost',sans-serif" }}>
      <div style={{ fontSize:14, fontWeight:400, color: C.loss }}>Access denied. Admin only.</div>
    </div>
  )

  const tabs: AdminTab[] = ['dashboard','users','posts','ratings','matches','analytics','league']

  // ── Shared field style for forms ──
  const fieldStyle: React.CSSProperties = {
    width:'100%', boxSizing:'border-box', background:'rgba(26,58,42,0.03)',
    border:'1px solid rgba(26,58,42,0.12)', borderRadius:9,
    padding:'10px 13px', color: C.dark, fontSize:13, fontFamily:'inherit', outline:'none',
  }

  return (
    <div style={{ minHeight:'100vh', background: C.bg, fontFamily:"'Jost',sans-serif", color: C.dark }}>

      {/* Notif */}
      {notif && (
        <div style={{ position:'fixed', top:18, left:'50%', transform:'translateX(-50%)', background:'rgba(26,58,42,0.1)', backdropFilter:'blur(12px)', border:'1px solid rgba(45,92,66,0.35)', borderRadius:14, padding:'11px 22px', zIndex:9999, color: C.dark, fontWeight:500, fontSize:14, whiteSpace:'nowrap', letterSpacing:'0.02em' }}>
          {notif}
        </div>
      )}

      {/* Header */}
      <div style={{ background: C.dark, padding:'16px 16px 12px', borderBottom:`1px solid rgba(184,150,62,0.2)` }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", color: C.gold, fontSize:20, fontWeight:400, letterSpacing:-0.3 }}>Admin Panel</div>
            <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11, marginTop:3, fontWeight:300, letterSpacing:'0.04em' }}>{currentUser.name}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => router.push('/')} style={{ background:'rgba(184,150,62,0.12)', border:'1px solid rgba(184,150,62,0.2)', borderRadius:20, padding:'7px 16px', color: C.gold, fontWeight:500, fontSize:11, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.06em' }}>← Back to App</button>
            <button onClick={() => { supabase.auth.signOut(); router.push('/login') }} style={{ background:'rgba(139,32,32,0.25)', border:'none', borderRadius:20, padding:'7px 16px', color:'#ffaaaa', fontWeight:500, fontSize:11, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.06em' }}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ background: C.bg, padding:'8px 0', borderBottom:`1px solid rgba(26,58,42,0.08)` }}>
        <div style={{ maxWidth:900, margin:'0 auto', padding:'0 16px', display:'flex', gap:6, overflowX:'auto' }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={tabPill(tab===t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:900, margin:'0 auto', padding:'20px 16px 60px', minHeight:'calc(100vh - 110px)' }}>

        {/* ── DASHBOARD ── */}
        {tab==='dashboard' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
            {[
              { label:'Total Users',    val:users.length,                              color: C.dark },
              { label:'Open Posts',     val:posts.filter(p=>p.spots_needed>0).length,  color: C.mid  },
              { label:'Active Ratings', val:ratings.length,                            color:'#2d3a8a' },
              { label:'Total Matches',  val:matches.length,                            color: C.gold },
              { label:'Admins',         val:users.filter(u=>u.is_admin).length,        color: C.loss },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background:'#fff', border:`1px solid ${C.cardBorder}`, borderRadius:14, padding:'16px 18px' }}>
                <div style={{ fontSize:9, fontWeight:500, color:'rgba(26,58,42,0.4)', textTransform:'uppercase', letterSpacing:'1.1px', marginBottom:10 }}>{label}</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:400, color }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── USERS ── */}
        {tab==='users' && (
          <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:`1px solid ${C.cardBorder}` }}>
            <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.cardBorder}`, display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:14, height:1, background: C.gold }} />
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark }}>Users ({users.length})</div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'rgba(26,58,42,0.03)' }}>
                    {['Name','Level','Admin','Joined','Actions'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', fontWeight:500, color: C.dark, textAlign: h==='Actions'||h==='Admin' ? 'center' : 'left', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderTop:`1px solid ${C.cardBorder}` }}>
                      <td style={{ padding:'11px 14px', fontWeight:500 }}>{u.name}</td>
                      <td style={{ padding:'11px 14px', color:'rgba(26,58,42,0.45)', fontWeight:300 }}>L{u.level}</td>
                      <td style={{ padding:'11px 14px', textAlign:'center' }}>
                        <input type="checkbox" checked={!!u.is_admin} onChange={async e => {
                          await supabase.from('profiles').update({ is_admin: e.target.checked }).eq('id', u.id)
                          setUsers(users.map(x => x.id===u.id ? { ...x, is_admin: e.target.checked } : x))
                          showNotif(`${u.name} ${e.target.checked ? 'is now admin' : 'removed from admin'}`)
                        }} style={{ cursor:'pointer', width:16, height:16 }} />
                      </td>
                      <td style={{ padding:'11px 14px', fontSize:12, color:'rgba(26,58,42,0.45)', fontWeight:300 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td style={{ padding:'11px 14px', textAlign:'center' }}>
                        <button onClick={async () => {
                          if (confirm(`Delete ${u.name}?`)) {
                            await supabase.from('profiles').delete().eq('id', u.id)
                            setUsers(users.filter(x => x.id!==u.id))
                            showNotif(`${u.name} deleted`)
                          }
                        }} style={{ background:'rgba(139,32,32,0.1)', border:'1px solid rgba(139,32,32,0.25)', borderRadius:7, padding:'5px 12px', color: C.loss, fontWeight:500, cursor:'pointer', fontFamily:'inherit', fontSize:11 }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── POSTS ── */}
        {tab==='posts' && (
          <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:`1px solid ${C.cardBorder}` }}>
            <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.cardBorder}`, display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:14, height:1, background: C.gold }} />
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark }}>Game Posts ({posts.length})</div>
            </div>
            <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
              {posts.map(p => (
                <div key={p.id} style={{ border:`1px solid ${C.cardBorder}`, borderRadius:10, background:'rgba(26,58,42,0.02)', padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                  <div>
                    <div style={{ fontWeight:500, fontSize:13, marginBottom:3 }}>{p.player_name}</div>
                    <div style={{ fontSize:11, color:'rgba(26,58,42,0.45)', fontWeight:300 }}>L{p.level} · {p.slot} · {p.spots_needed} spots</div>
                    {p.note && <div style={{ fontSize:11, color:'rgba(26,58,42,0.55)', marginTop:2, fontStyle:'italic', fontWeight:300 }}>"{p.note}"</div>}
                  </div>
                  <button onClick={async () => {
                    if (confirm(`Delete ${p.player_name}'s post?`)) {
                      await supabase.from('post_interests').delete().eq('post_id', p.id)
                      await supabase.from('posts').delete().eq('id', p.id)
                      setPosts(posts.filter(x => x.id!==p.id))
                      showNotif('Post deleted')
                    }
                  }} style={{ background:'rgba(139,32,32,0.1)', border:'1px solid rgba(139,32,32,0.25)', borderRadius:7, padding:'6px 12px', color: C.loss, fontWeight:500, cursor:'pointer', fontFamily:'inherit', fontSize:11, flexShrink:0 }}>Delete</button>
                </div>
              ))}
              {posts.length===0 && <div style={{ textAlign:'center', padding:'30px', color:'rgba(26,58,42,0.4)', fontWeight:300 }}>No posts</div>}
            </div>
          </div>
        )}

        {/* ── RATINGS ── */}
        {tab==='ratings' && (
          <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:`1px solid ${C.cardBorder}` }}>
            <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.cardBorder}`, display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:14, height:1, background: C.gold }} />
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark }}>Ratings ({ratings.length})</div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'rgba(26,58,42,0.03)' }}>
                    {['Player','Rating','Matches','Updated','Actions'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', fontWeight:500, color: C.dark, textAlign: h==='Actions'||h==='Rating'||h==='Matches' ? 'center' : 'left', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ratings.map(r => (
                    <tr key={r.id} style={{ borderTop:`1px solid ${C.cardBorder}` }}>
                      <td style={{ padding:'11px 14px', fontWeight:500 }}>{r.player_name}</td>
                      <td style={{ padding:'11px 14px', textAlign:'center', fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark }}>{r.rating.toFixed(1)}</td>
                      <td style={{ padding:'11px 14px', textAlign:'center', color:'rgba(26,58,42,0.5)', fontWeight:300 }}>{r.match_count}</td>
                      <td style={{ padding:'11px 14px', fontSize:11, color:'rgba(26,58,42,0.45)', fontWeight:300 }}>{new Date(r.updated_at).toLocaleDateString()}</td>
                      <td style={{ padding:'11px 14px', textAlign:'center' }}>
                        <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                          <button onClick={() => setEditingRating(r)} style={{ background: C.dark, border:'none', borderRadius:7, padding:'5px 12px', color: C.gold, fontWeight:500, cursor:'pointer', fontFamily:'inherit', fontSize:11 }}>Edit</button>
                          <button onClick={async () => {
                            if (confirm(`Delete rating for ${r.player_name}?`)) {
                              await supabase.from('ratings').delete().eq('id', r.id)
                              setRatings(ratings.filter(x => x.id!==r.id))
                              showNotif('Rating deleted')
                            }
                          }} style={{ background:'rgba(139,32,32,0.1)', border:'1px solid rgba(139,32,32,0.25)', borderRadius:7, padding:'5px 12px', color: C.loss, fontWeight:500, cursor:'pointer', fontFamily:'inherit', fontSize:11 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Edit Rating Modal */}
            {editingRating && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
                <div style={{ background: C.bg, borderRadius:18, padding:24, maxWidth:380, width:'90%', fontFamily:"'Jost',sans-serif", border:`1px solid ${C.cardBorder}` }}>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark, marginBottom:16 }}>Edit Rating — {editingRating.player_name}</div>
                  {[
                    { label:'Rating (1.0–7.0)', key:'rating',      type:'number', step:'0.1', min:'1', max:'7' },
                    { label:'Match Count',       key:'match_count', type:'number', min:'0' },
                  ].map(({ label, key, ...rest }) => (
                    <div key={key} style={{ marginBottom:14 }}>
                      <div style={{ fontSize:10, fontWeight:500, color:'rgba(26,58,42,0.45)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.1em' }}>{label}</div>
                      <input
                        {...rest}
                        value={(editingRating as any)[key] || 0}
                        onChange={e => setEditingRating({ ...editingRating, [key]: parseFloat(e.target.value) })}
                        style={{ ...fieldStyle, fontSize:15, fontWeight:500 }}
                      />
                    </div>
                  ))}
                  <div style={{ display:'flex', gap:10, marginTop:18 }}>
                    <button onClick={async () => {
                      const newLevel = ratingToLevel(editingRating.rating!).level
                      await supabase.from('ratings').update({ rating: editingRating.rating, match_count: editingRating.match_count, updated_at: new Date().toISOString() }).eq('id', editingRating.id)
                      await supabase.from('profiles').update({ level: newLevel }).eq('id', editingRating.player_id)
                      setRatings(ratings.map(r => r.id===editingRating.id ? { ...r, ...editingRating } as Rating : r))
                      setEditingRating(null); showNotif('Rating updated')
                    }} style={{ flex:1, background: C.dark, border:'none', borderRadius:10, padding:'12px', color: C.gold, fontWeight:500, cursor:'pointer', fontFamily:'inherit', fontSize:13, letterSpacing:'0.04em' }}>Save</button>
                    <button onClick={() => setEditingRating(null)} style={{ flex:1, background:'rgba(26,58,42,0.07)', border:'none', borderRadius:10, padding:'12px', color: C.dark, fontWeight:400, cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MATCHES ── */}
        {tab==='matches' && (
          <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:`1px solid ${C.cardBorder}` }}>
            <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.cardBorder}`, display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:14, height:1, background: C.gold }} />
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark }}>Match History ({matches.length})</div>
            </div>
            <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
              {matches.slice(0,30).map(m => (
                <div key={m.id} style={{ border:`1px solid ${C.cardBorder}`, borderRadius:10, background:'rgba(26,58,42,0.02)', padding:'12px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div style={{ fontSize:13, fontWeight:500, color: C.dark, lineHeight:1.5 }}>
                      {m.team_a1_name} & {m.team_a2_name}
                      <span style={{ fontWeight:300, color:'rgba(26,58,42,0.4)', fontSize:11 }}> vs </span>
                      {m.team_b1_name} & {m.team_b2_name}
                    </div>
                    <button onClick={async () => {
                      if (confirm('Delete this match?')) {
                        await supabase.from('matches').delete().eq('id', m.id)
                        setMatches(matches.filter(x => x.id!==m.id))
                        showNotif('Match deleted')
                      }
                    }} style={{ background:'rgba(139,32,32,0.1)', border:'1px solid rgba(139,32,32,0.25)', borderRadius:6, padding:'5px 10px', color: C.loss, fontWeight:500, cursor:'pointer', fontFamily:'inherit', fontSize:11, flexShrink:0, marginLeft:8 }}>Delete</button>
                  </div>
                  <div style={{ fontSize:11, color:'rgba(26,58,42,0.45)', display:'flex', gap:16, fontWeight:300 }}>
                    <span>A: {m.sets_a.join('-')}</span>
                    <span>B: {m.sets_b.join('-')}</span>
                    <span>{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              {matches.length===0 && <div style={{ textAlign:'center', padding:'30px', color:'rgba(26,58,42,0.4)', fontWeight:300 }}>No matches</div>}
            </div>
          </div>
        )}

        {/* ── LEAGUE WIZARD ── */}
        {tab === 'league' && (
          <div style={{ maxWidth:560 }}>

            {/* ── Existing Leagues ── */}
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.dark, letterSpacing:'0.05em' }}>EXISTING LEAGUES</div>
                <button onClick={loadExistingLeagues} style={{ fontSize:11, color:C.mid, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>↻ Load</button>
              </div>
              {existingLeagues.length === 0 ? (
                <div style={{ fontSize:12, color:'rgba(26,58,42,0.35)', padding:'8px 0' }}>No leagues loaded — click ↻ Load</div>
              ) : existingLeagues.map((lg: any) => (
                <div key={lg.id} style={{ background:'#fff', borderRadius:12, padding:'14px 16px', marginBottom:8, border:`1px solid ${C.cardBorder}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:C.dark }}>{lg.name}</div>
                      <div style={{ fontSize:11, color:'rgba(26,58,42,0.4)', marginTop:2 }}>{lg.status} · {(lg.format||'').replace('_',' ')}</div>
                    </div>
                    <button onClick={() => editingLeague?.id === lg.id ? setEditingLeague(null) : loadLeagueForEdit(lg)}
                      style={{ background: editingLeague?.id===lg.id ? 'rgba(26,58,42,0.08)' : C.dark, color: editingLeague?.id===lg.id ? C.dark : C.gold, border:'none', borderRadius:8, padding:'5px 14px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                      {editingLeague?.id === lg.id ? 'Close' : 'Edit'}
                    </button>
                  </div>

                  {editingLeague?.id === lg.id && (
                    <div style={{ marginTop:14, borderTop:`1px solid ${C.cardBorder}`, paddingTop:14 }}>

                      {editBoxes.map((box: any) => {
                        const boxPs = editBoxPlayers.filter((p: any) => p.box_id === box.id)
                        return (
                          <div key={box.id} style={{ marginBottom:14 }}>
                            <div style={{ fontSize:11, fontWeight:700, color:C.dark, marginBottom:6, letterSpacing:'0.05em' }}>{box.name} — {boxPs.length} players</div>
                            {boxPs.length === 0 && <div style={{ fontSize:11, color:'rgba(26,58,42,0.35)', paddingLeft:4, marginBottom:4 }}>Empty</div>}
                            {boxPs.map((bp: any) => {
                              const u = users.find((u: any) => u.id === bp.player_id)
                              const r = ratings.find((r: any) => r.player_id === bp.player_id)
                              return u ? (
                                <div key={bp.player_id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background:'rgba(26,58,42,0.03)', borderRadius:8, marginBottom:4, border:'1px solid rgba(26,58,42,0.06)' }}>
                                  <div style={{ flex:1 }}>
                                    <span style={{ fontSize:12, fontWeight:500, color:C.dark }}>{u.name}</span>
                                    <span style={{ fontSize:10, color:'rgba(26,58,42,0.4)', marginLeft:8 }}>L{u.level} · {r?.rating?.toFixed(1)||'N/A'}</span>
                                  </div>
                                  {editBoxes.length > 1 && (
                                    <select onChange={e => e.target.value && handleMovePlayer(bp.player_id, e.target.value)} defaultValue=""
                                      style={{ fontSize:10, border:'1px solid rgba(26,58,42,0.15)', borderRadius:6, padding:'2px 6px', background:'transparent', color:C.dark, cursor:'pointer', fontFamily:'inherit' }}>
                                      <option value="">Move →</option>
                                      {editBoxes.filter((b: any) => b.id !== box.id).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                  )}
                                  <button onClick={() => handleRemoveFromLeague(bp.player_id)}
                                    style={{ background:'rgba(153,0,51,0.08)', border:'none', borderRadius:6, padding:'3px 9px', fontSize:10, color:'#990033', cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>✕</button>
                                </div>
                              ) : null
                            })}
                          </div>
                        )
                      })}

                      <div style={{ borderTop:`1px solid ${C.cardBorder}`, paddingTop:12, marginTop:4 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:C.dark, marginBottom:8, letterSpacing:'0.04em' }}>ADD PLAYER</div>
                        <div style={{ display:'flex', gap:5, marginBottom:8, flexWrap:'wrap' as const }}>
                          {[['1','Elite','#cc9900'],['2','Premier','#000099'],['3','Club','#0077aa'],['4','Social','#990033'],['5','Starter','#555555']].map(([lvl,label,col]) => (
                            <button key={lvl} onClick={() => setEditAddLevel(editAddLevel === lvl ? null : lvl)}
                              style={{ padding:'3px 10px', borderRadius:20, border:`1.5px solid ${editAddLevel===lvl?col:'rgba(26,58,42,0.12)'}`, background:editAddLevel===lvl?col:'transparent', color:editAddLevel===lvl?'#fff':'rgba(26,58,42,0.5)', fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
                              L{lvl} {label}
                            </button>
                          ))}
                        </div>
                        <input placeholder="Search player to add…" value={editAddSearch} onChange={e => setEditAddSearch(e.target.value)}
                          style={{ width:'100%', padding:'8px 12px', border:'1px solid rgba(26,58,42,0.15)', borderRadius:8, fontSize:12, fontFamily:'inherit', background:'rgba(26,58,42,0.02)', color:C.dark, outline:'none', boxSizing:'border-box' as const, marginBottom:6 }} />
                        {editAddSearch.length > 0 && (
                          <div style={{ maxHeight:160, overflowY:'auto', display:'flex', flexDirection:'column', gap:4 }}>
                            {users
                              .filter((u: any) => !editBoxPlayers.find((p: any) => p.player_id === u.id))
                              .filter((u: any) => u.name.toLowerCase().includes(editAddSearch.toLowerCase()))
                              .filter((u: any) => !editAddLevel || String(u.level) === editAddLevel)
                              .slice(0, 8)
                              .map((u: any) => {
                                const r = ratings.find((rt: any) => rt.player_id === u.id)
                                return (
                                  <div key={u.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background:'rgba(26,58,42,0.03)', borderRadius:8, border:'1px solid rgba(26,58,42,0.06)' }}>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:12, fontWeight:500, color:C.dark }}>{u.name}</div>
                                      <div style={{ fontSize:10, color:'rgba(26,58,42,0.4)' }}>L{u.level} · {r?.rating?.toFixed(1)||'N/A'}</div>
                                    </div>
                                    <select onChange={e => { if(e.target.value){ handleAddToLeague(u.id,e.target.value); setEditAddSearch('') } }} defaultValue=""
                                      style={{ fontSize:11, border:'1px solid rgba(26,58,42,0.2)', borderRadius:8, padding:'4px 8px', background:C.dark, color:C.gold, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                                      <option value="">Add to…</option>
                                      {editBoxes.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                  </div>
                                )
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ borderTop:`1px solid ${C.cardBorder}`, paddingTop:16, marginBottom:4 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.dark, letterSpacing:'0.05em', marginBottom:12 }}>CREATE NEW LEAGUE</div>
            </div>

            {leagueCreated ? (
              <div style={{ background:'#fff', borderRadius:14, padding:'32px', textAlign:'center' as const, border:`1px solid ${C.cardBorder}` }}>
                <div style={{ fontSize:28, marginBottom:12, opacity:0.7 }}>🏆</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:400, color: C.dark, marginBottom:8 }}>League Created!</div>
                <div style={{ fontSize:13, color:'rgba(26,58,42,0.55)', marginBottom:20, fontWeight:300 }}>Groups and fixtures have been generated.</div>
                <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                  <button onClick={() => router.push('/league')} style={{ background: C.dark, border:'none', borderRadius:10, padding:'11px 22px', color: C.gold, fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>View League →</button>
                  <button onClick={() => { setLeagueCreated(false); setLeagueStep(1); setLeagueName(''); setLeaguePlayers([]); setLeagueGeneratedGroups([]) }} style={{ background:'rgba(26,58,42,0.07)', border:'none', borderRadius:10, padding:'11px 22px', color: C.dark, fontWeight:400, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>New Season</button>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

                {/* Progress bar */}
                <div style={{ display:'flex', gap:4 }}>
                  {[1,2,3,4,5,6].map(n => (
                    <div key={n} style={{ height:4, flex:1, borderRadius:3, background: n <= leagueStep ? C.dark : 'rgba(26,58,42,0.12)', transition:'background 0.2s' }} />
                  ))}
                </div>

                {/* Step 1: Setup */}
                {leagueStep === 1 && (
                  <div style={{ background:'#fff', borderRadius:14, padding:'20px', border:`1px solid ${C.cardBorder}` }}>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark, marginBottom:16 }}>Season Setup</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                      <div>
                        <div style={{ fontSize:10, fontWeight:500, color:'rgba(26,58,42,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:6 }}>Season Name</div>
                        <input value={leagueName} onChange={e => setLeagueName(e.target.value)} placeholder="e.g. Summer League 2026" style={fieldStyle} />
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                        {[['Start Date', leagueStart, setLeagueStart], ['End Date', leagueEnd, setLeagueEnd]].map(([label, val, setter]: any) => (
                          <div key={label}>
                            <div style={{ fontSize:10, fontWeight:500, color:'rgba(26,58,42,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:6 }}>{label}</div>
                            <input type="date" value={val} onChange={e => setter(e.target.value)} style={fieldStyle} />
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize:10, fontWeight:500, color:'rgba(26,58,42,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:6 }}>Fixture Frequency</div>
                        <div style={{ display:'flex', gap:6 }}>
                          {(['weekly','fortnightly','monthly'] as const).map(f => (
                            <button key={f} onClick={() => setLeagueFreq(f)} style={{ flex:1, background: leagueFreq===f ? C.dark : 'rgba(26,58,42,0.06)', color: leagueFreq===f ? C.gold : 'rgba(26,58,42,0.5)', border: leagueFreq===f ? 'none' : '1px solid rgba(26,58,42,0.15)', borderRadius:9, padding:'9px 0', fontSize:11, fontWeight:leagueFreq===f?500:400, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' as const, letterSpacing:'0.02em' }}>{f}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:10, fontWeight:500, color:'rgba(26,58,42,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:6 }}>Match Day</div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                          {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                            <button key={d} onClick={() => setLeagueDay(d)} style={{ background: leagueDay===d ? C.dark : 'rgba(26,58,42,0.06)', color: leagueDay===d ? C.gold : 'rgba(26,58,42,0.5)', border: leagueDay===d ? 'none' : '1px solid rgba(26,58,42,0.15)', borderRadius:9, padding:'6px 11px', fontSize:11, fontWeight:leagueDay===d?500:400, cursor:'pointer', fontFamily:'inherit' }}>{d.slice(0,3)}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => leagueName ? setLeagueStep(2) : showNotif('Enter a season name')}
                      style={{ width:'100%', marginTop:20, background: C.dark, border:'none', borderRadius:10, padding:'12px', color: C.gold, fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Next → Select Players</button>
                  </div>
                )}

                {/* Step 2: Players */}
                {leagueStep === 2 && (
                  <div style={{ background:'#fff', borderRadius:14, padding:'20px', border:`1px solid ${C.cardBorder}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark }}>Select Players</div>
                      <div style={{ background: C.dark, color: C.gold, fontSize:11, fontWeight:500, padding:'4px 12px', borderRadius:10, letterSpacing:'0.04em' }}>{leaguePlayers.length} selected</div>
                    </div>
                    <div style={{ position:'relative', marginBottom:10 }}>
                      <input type="text" placeholder="Search players…" value={leagueSearch} onChange={e => setLeagueSearch(e.target.value)}
                        style={{ ...fieldStyle, paddingLeft:36 }} />
                      <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'rgba(26,58,42,0.3)', pointerEvents:'none' }}>🔍</span>
                    </div>
                    <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' as const }}>
                      {[['1','Elite','#cc9900'],['2','Premier','#000099'],['3','Club','#0077aa'],['4','Social','#990033'],['5','Starter','#555555']].map(([lvl,label,col]) => (
                        <button key={lvl} onClick={() => setLeagueLevelFilter(f => f === lvl ? null : lvl)}
                          style={{ padding:'4px 11px', borderRadius:20, border:`1.5px solid ${leagueLevelFilter===lvl ? col : 'rgba(26,58,42,0.12)'}`, background: leagueLevelFilter===lvl ? col : 'transparent', color: leagueLevelFilter===lvl ? '#fff' : 'rgba(26,58,42,0.5)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', letterSpacing:'0.03em' }}>
                          L{lvl} {label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:340, overflowY:'auto' }}>
                      {[...users].filter(u => u.name.toLowerCase().includes(leagueSearch.toLowerCase()) && (!leagueLevelFilter || String(u.level) === leagueLevelFilter))
                        .sort((a,b) => (ratings.find(r=>r.player_id===b.id)?.rating||0) - (ratings.find(r=>r.player_id===a.id)?.rating||0))
                        .map(u => {
                          const r = ratings.find(rt => rt.player_id === u.id)
                          const sel = leaguePlayers.includes(u.id)
                          return (
                            <div key={u.id} onClick={() => setLeaguePlayers(prev => sel ? prev.filter(id=>id!==u.id) : [...prev,u.id])}
                              style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, background: sel ? 'rgba(26,58,42,0.06)' : 'rgba(26,58,42,0.02)', cursor:'pointer', border: sel ? `1.5px solid rgba(26,58,42,0.2)` : '1.5px solid transparent', transition:'all 0.15s' }}>
                              <div style={{ width:34, height:34, borderRadius:'50%', background: sel ? C.dark : 'rgba(26,58,42,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:500, color: sel ? C.gold : C.dark, flexShrink:0, transition:'all 0.15s' }}>{u.avatar}</div>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight: sel?500:400, color: C.dark }}>{u.name}</div>
                                <div style={{ fontSize:11, color:'rgba(26,58,42,0.45)', fontWeight:300 }}>Rating {r ? r.rating.toFixed(1) : 'N/A'} · L{u.level}</div>
                              </div>
                              <div style={{ width:20, height:20, borderRadius:6, background: sel ? C.dark : 'rgba(26,58,42,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                                {sel && <span style={{ fontSize:11, color: C.gold }}>✓</span>}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:14 }}>
                      <button onClick={() => setLeagueStep(1)} style={{ flex:1, background:'rgba(26,58,42,0.07)', border:'none', borderRadius:10, padding:'12px', color: C.dark, fontWeight:400, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={() => leaguePlayers.length >= 4 ? setLeagueStep(3) : showNotif('Select at least 4 players')}
                        style={{ flex:2, background: C.dark, border:'none', borderRadius:10, padding:'12px', color: C.gold, fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Next → Format</button>
                    </div>
                  </div>
                )}

                {/* Step 3: Format */}
                {leagueStep === 3 && (
                  <div style={{ background:'#fff', borderRadius:14, padding:'20px', border:`1px solid ${C.cardBorder}` }}>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark, marginBottom:14 }}>League Format</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {([['round_robin','Round Robin','Everyone plays everyone. Best for up to 8 players.'],['groups_knockout','Groups + Knockout','Top players advance. Best for 8+ players.']] as const).map(([key,title,sub]) => (
                        <div key={key} onClick={() => setLeagueFormat(key)}
                          style={{ display:'flex', gap:12, padding:'14px', borderRadius:10, border: leagueFormat===key ? `2px solid ${C.dark}` : `1px solid ${C.cardBorder}`, background: leagueFormat===key ? 'rgba(26,58,42,0.04)' : 'transparent', cursor:'pointer', transition:'all 0.15s' }}>
                          <div style={{ width:18, height:18, borderRadius:'50%', border: `2px solid ${leagueFormat===key?C.dark:'rgba(26,58,42,0.2)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                            {leagueFormat===key && <div style={{ width:8, height:8, borderRadius:'50%', background: C.dark }} />}
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:500, color: C.dark }}>{title}</div>
                            <div style={{ fontSize:11, color:'rgba(26,58,42,0.5)', marginTop:3, lineHeight:1.4, fontWeight:300 }}>{sub}</div>
                          </div>
                        </div>
                      ))}
                      <div>
                        <div style={{ fontSize:10, fontWeight:500, color:'rgba(26,58,42,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:8, marginTop:6 }}>Number of Groups</div>
                        <div style={{ display:'flex', gap:6 }}>
                          {[1,2,3,4].map(n => (
                            <button key={n} onClick={() => setLeagueGroups(n)} style={{ flex:1, background: leagueGroups===n ? C.dark : 'rgba(26,58,42,0.06)', color: leagueGroups===n ? C.gold : 'rgba(26,58,42,0.5)', border: leagueGroups===n ? 'none' : '1px solid rgba(26,58,42,0.15)', borderRadius:9, padding:'10px 0', fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:400, cursor:'pointer' }}>{n}</button>
                          ))}
                        </div>
                        <div style={{ fontSize:11, color:'rgba(26,58,42,0.4)', marginTop:6, textAlign:'center' as const, fontWeight:300 }}>{leaguePlayers.length} players → {leagueGroups} groups of ~{Math.ceil(leaguePlayers.length/leagueGroups)}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:20 }}>
                      <button onClick={() => setLeagueStep(2)} style={{ flex:1, background:'rgba(26,58,42,0.07)', border:'none', borderRadius:10, padding:'12px', color: C.dark, fontWeight:400, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={() => { const r = snakeSeed(leaguePlayers, leagueGroups); setLeagueGeneratedGroups(r.groups); setLeagueSeedMap(r.seedMap); setLeagueStep(4) }}
                        style={{ flex:2, background: C.dark, border:'none', borderRadius:10, padding:'12px', color: C.gold, fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Next → Preview Groups</button>
                    </div>
                  </div>
                )}

                {/* Step 4: Groups Preview */}
                {leagueStep === 4 && (
                  <div style={{ background:'#fff', borderRadius:14, padding:'20px', border:`1px solid ${C.cardBorder}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark }}>Groups Preview</div>
                      <button onClick={() => { const r = snakeSeed(leaguePlayers, leagueGroups); setLeagueGeneratedGroups(r.groups); setLeagueSeedMap(r.seedMap) }}
                        style={{ background:'rgba(26,58,42,0.07)', border:'none', borderRadius:9, padding:'6px 12px', color: C.dark, fontWeight:500, fontSize:11, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Reshuffle ↺</button>
                    </div>
                    <div style={{ fontSize:11, color:'rgba(26,58,42,0.4)', marginBottom:14, fontWeight:300 }}>Snake-seeded by rating · balanced groups</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      {leagueGeneratedGroups.map((group, gi) => {
                        const avg = group.reduce((s,pid) => s + (ratings.find(r=>r.player_id===pid)?.rating||0), 0) / (group.length||1)
                        return (
                          <div key={gi} style={{ background:'rgba(26,58,42,0.04)', border:`1px solid ${C.cardBorder}`, borderRadius:10, padding:'12px' }}>
                            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:13, fontWeight:400, color: C.dark, marginBottom:2 }}>Group {String.fromCharCode(65+gi)}</div>
                            <div style={{ fontSize:10, color:'rgba(26,58,42,0.4)', marginBottom:10, fontWeight:300 }}>Avg {avg.toFixed(1)}</div>
                            {group.map((pid:string) => {
                              const u = users.find(u=>u.id===pid)
                              const r = ratings.find(rt=>rt.player_id===pid)
                              return u ? (
                                <div key={pid} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                                  <div style={{ width:26, height:26, borderRadius:'50%', background: C.dark, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:500, color: C.gold, flexShrink:0 }}>{u.avatar}</div>
                                  <div>
                                    <div style={{ fontSize:12, fontWeight:500, color: C.dark }}>{u.name.split(' ')[0]}</div>
                                    <div style={{ fontSize:10, color:'rgba(26,58,42,0.45)', fontWeight:300 }}>{r?.rating.toFixed(1)||'N/A'}</div>
                                  </div>
                                </div>
                              ) : null
                            })}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:16 }}>
                      <button onClick={() => setLeagueStep(3)} style={{ flex:1, background:'rgba(26,58,42,0.07)', border:'none', borderRadius:10, padding:'12px', color: C.dark, fontWeight:400, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={() => setLeagueStep(5)} style={{ flex:2, background: C.dark, border:'none', borderRadius:10, padding:'12px', color: C.gold, fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Next → Points</button>
                    </div>
                  </div>
                )}

                {/* Step 5: Points */}
                {leagueStep === 5 && (
                  <div style={{ background:'#fff', borderRadius:14, padding:'20px', border:`1px solid ${C.cardBorder}` }}>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark, marginBottom:16 }}>Points System</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                      <div style={{ paddingBottom:16 }}>
                        <div style={{ fontSize:10, fontWeight:500, color:'rgba(26,58,42,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:8 }}>Points for winning</div>
                        <div style={{ display:'flex', alignItems:'center', background:'rgba(26,58,42,0.07)', borderRadius:10, overflow:'hidden', width:120 }}>
                          <button onClick={() => setLeaguePointsWin(Math.max(0,leaguePointsWin-1))} style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'none', fontSize:18, fontWeight:400, color: C.dark, cursor:'pointer', fontFamily:'inherit' }}>−</button>
                          <div style={{ flex:1, textAlign:'center' as const, fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:400, color: C.dark }}>{leaguePointsWin}</div>
                          <button onClick={() => setLeaguePointsWin(Math.min(9,leaguePointsWin+1))} style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'none', fontSize:18, fontWeight:400, color: C.dark, cursor:'pointer', fontFamily:'inherit' }}>+</button>
                        </div>
                      </div>
                      {([
                        ['Sets won in a loss',       '+1 pt per set won when you lose',    leaguePointsSetsLoss, (v:boolean)=>{setLeaguePointsSetsLoss(v);if(v)setLeaguePointsAllSets(false)}],
                        ['Sets won by all players',  '+1 pt per set regardless of result', leaguePointsAllSets,  (v:boolean)=>{setLeaguePointsAllSets(v);if(v)setLeaguePointsSetsLoss(false)}],
                        ['Bagel bonus (6–0)',         '+1 pt per 6–0 set won',              leaguePointsBagel,    setLeaguePointsBagel],
                      ] as [string,string,boolean,(v:boolean)=>void][]).map(([label,sub,val,setter]) => (
                        <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0', borderTop:`1px solid ${C.cardBorder}` }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:500, color: C.dark }}>{label}</div>
                            <div style={{ fontSize:11, color:'rgba(26,58,42,0.45)', marginTop:2, fontWeight:300 }}>{sub}</div>
                          </div>
                          <div onClick={() => setter(!val)} style={{ width:40, height:22, borderRadius:11, background: val ? C.dark : 'rgba(26,58,42,0.15)', position:'relative', cursor:'pointer', transition:'background 0.2s', flexShrink:0 }}>
                            <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:2, left: val ? 20 : 2, transition:'left 0.2s' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:20 }}>
                      <button onClick={() => setLeagueStep(4)} style={{ flex:1, background:'rgba(26,58,42,0.07)', border:'none', borderRadius:10, padding:'12px', color: C.dark, fontWeight:400, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={() => setLeagueStep(6)} style={{ flex:2, background: C.dark, border:'none', borderRadius:10, padding:'12px', color: C.gold, fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Next → Review</button>
                    </div>
                  </div>
                )}

                {/* Step 6: Review */}
                {leagueStep === 6 && (
                  <div style={{ background:'#fff', borderRadius:14, padding:'20px', border:`1px solid ${C.cardBorder}` }}>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: C.dark, marginBottom:16 }}>Review & Launch</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                      {([
                        ['Season',  leagueName],
                        ['Dates',   leagueStart&&leagueEnd ? leagueStart+' – '+leagueEnd : 'No dates set'],
                        ['Match Day', leagueDay],
                        ['Format',  leagueFormat==='round_robin' ? 'Round Robin' : 'Groups + Knockout'],
                        ['Players', leaguePlayers.length+' selected'],
                        ['Groups',  leagueGroups+' groups of ~'+Math.ceil(leaguePlayers.length/leagueGroups)],
                        ['Points',  'Win: '+leaguePointsWin+'pts'+(leaguePointsSetsLoss?' · Sets in loss: +1':'')+(leaguePointsAllSets?' · All sets: +1':'')+(leaguePointsBagel?' · Bagel: +1':'')],
                      ] as [string,string][]).map(([k,v],i) => (
                        <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'11px 0', borderBottom: i<6 ? `1px solid ${C.cardBorder}` : 'none' }}>
                          <span style={{ fontSize:12, color:'rgba(26,58,42,0.45)', fontWeight:300 }}>{k}</span>
                          <span style={{ fontSize:12, fontWeight:500, color: C.dark, textAlign:'right' as const, maxWidth:'60%' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:'rgba(26,58,42,0.04)', borderRadius:10, padding:'11px 14px', marginTop:12, fontSize:12, color:'rgba(26,58,42,0.55)', lineHeight:1.5, fontWeight:300 }}>
                      Fixtures will be auto-generated and visible to all players immediately.
                    </div>
                    {leagueError && (
                      <div style={{ background:'rgba(139,32,32,0.08)', border:'1px solid rgba(139,32,32,0.2)', borderRadius:10, padding:'10px 14px', marginTop:8, fontSize:12, color: C.loss, fontWeight:400 }}>
                        Error: {leagueError}
                      </div>
                    )}
                    <div style={{ display:'flex', gap:8, marginTop:16 }}>
                      <button onClick={() => setLeagueStep(5)} style={{ flex:1, background:'rgba(26,58,42,0.07)', border:'none', borderRadius:10, padding:'12px', color: C.dark, fontWeight:400, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={handleCreateLeague} disabled={leagueCreating}
                        style={{ flex:2, background: leagueCreating ? 'rgba(26,58,42,0.4)' : C.dark, border:'none', borderRadius:10, padding:'12px', color: C.gold, fontWeight:500, fontSize:13, cursor: leagueCreating?'default':'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>
                        {leagueCreating ? 'Creating…' : 'Launch Season →'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab==='analytics' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:14 }}>
            {[
              {
                title: 'Top Players by Rating',
                rows: ratings.slice(0,5).map((r,i) => ({
                  left: `#${i+1} ${r.player_name}`,
                  sub: `${r.match_count} matches`,
                  right: r.rating.toFixed(1),
                  color: C.dark,
                }))
              },
              {
                title: 'Level Distribution',
                rows: [['1','Elite','#b8963e'],['2','Competitive','#2d3a8a'],['3','Casual','#1a5c35'],['4','Beginner','#8b2020']].map(([level,desc,color]) => ({
                  left: `L${level}`,
                  sub: desc,
                  right: String(users.filter(u => u.level===level).length),
                  color,
                }))
              },
              {
                title: 'Activity',
                rows: [
                  { left:'Avg Matches / Player', sub:'', right:(ratings.reduce((s,r)=>s+r.match_count,0)/ratings.length||0).toFixed(1), color: C.dark },
                  { left:'Total Matches Played', sub:'', right:String(matches.length), color: C.dark },
                  { left:'Active Game Posts',    sub:'', right:String(posts.filter(p=>p.spots_needed>0).length), color: C.dark },
                  { left:'Avg Rating',           sub:'', right:(ratings.reduce((s,r)=>s+r.rating,0)/ratings.length||0).toFixed(1), color: C.dark },
                ]
              }
            ].map(({ title, rows }) => (
              <div key={title} style={{ background:'#fff', borderRadius:14, padding:'16px 18px', border:`1px solid ${C.cardBorder}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <div style={{ width:12, height:1, background: C.gold }} />
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:14, fontWeight:400, color: C.dark }}>{title}</div>
                </div>
                {rows.map((row, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom: i<rows.length-1 ? `1px solid ${C.cardBorder}` : 'none' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color: C.dark }}>{row.left}</div>
                      {row.sub && <div style={{ fontSize:11, color:'rgba(26,58,42,0.4)', fontWeight:300 }}>{row.sub}</div>}
                    </div>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:400, color: row.color }}>{row.right}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

