'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Post, Rating, Match } from '@/lib/types'

type AdminTab = 'dashboard' | 'users' | 'posts' | 'ratings' | 'matches' | 'analytics' | 'league'

const C = {
  bg: '#f5f0e8', dark: '#014a09', mid: '#026b0d', gold: '#ffcc66',
  win: '#006633', loss: '#990033', cardBorder: 'rgba(1,74,9,0.12)',
}

function ratingToLevel(rating: number): { level: string; color: string; bg: string; desc: string } {
  if (rating >= 5.6) return { level:'1', color:'#cc9900', bg:'rgba(204,153,0,0.12)', desc:'Elite' }
  if (rating >= 4.1) return { level:'2', color:'#000099', bg:'rgba(0,0,153,0.10)', desc:'Competitive' }
  if (rating >= 2.6) return { level:'3', color:'#006633', bg:'rgba(0,102,51,0.10)', desc:'Casual' }
  return                     { level:'4', color:'#990033', bg:'rgba(153,0,51,0.12)', desc:'Beginner' }
}

export default function AdminPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [loading, setLoading] = useState(true)
  const [notif, setNotif] = useState<string | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [ratings, setRatings] = useState<Rating[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [editingRating, setEditingRating] = useState<Partial<Rating> | null>(null)
  const [leagueStep, setLeagueStep]               = useState(1)
  const [leagueName, setLeagueName]               = useState('')
  const [leagueStart, setLeagueStart]             = useState('')
  const [leagueEnd, setLeagueEnd]                 = useState('')
  const [leagueFreq, setLeagueFreq]               = useState<'weekly'|'fortnightly'|'monthly'>('weekly')
  const [leaguePlayers, setLeaguePlayers]         = useState<string[]>([])
  const [leagueGroups, setLeagueGroups]           = useState(2)
  const [leagueFormat, setLeagueFormat]           = useState<'round_robin'|'groups_knockout'>('round_robin')
  const [leaguePointsWin, setLeaguePointsWin]                 = useState(3)
  const [leaguePointsSetsLoss, setLeaguePointsSetsLoss]       = useState(true)
  const [leaguePointsAllSets, setLeaguePointsAllSets]         = useState(false)
  const [leaguePointsBagel, setLeaguePointsBagel]             = useState(true)
  const [leagueGeneratedGroups, setLeagueGeneratedGroups]     = useState<string[][]>([])
  const [leagueDay, setLeagueDay]                 = useState('Tuesday')
  const [leagueCreating, setLeagueCreating]       = useState(false)
  const [leagueCreated, setLeagueCreated]         = useState(false)
  const [leagueError, setLeagueError]             = useState('')
  const [leagueSearch, setLeagueSearch]           = useState('')

  const showNotif = (msg: string) => {
    setNotif(msg)
    setTimeout(() => setNotif(null), 3000)
  }

  function snakeSeed(playerIds: string[], numGroups: number): string[][] {
    const sorted = [...playerIds].sort((a, b) => {
      const rA = ratings.find(r => r.player_id === a)?.rating || 0
      const rB = ratings.find(r => r.player_id === b)?.rating || 0
      return rB - rA
    })
    const groups: string[][] = Array.from({ length: numGroups }, () => [])
    sorted.forEach((pid, i) => {
      const round = Math.floor(i / numGroups)
      const pos   = i % numGroups
      const idx   = round % 2 === 0 ? pos : numGroups - 1 - pos
      groups[idx].push(pid)
    })
    return groups
  }

  async function handleCreateLeague() {
    if (!leagueName || leaguePlayers.length < 4) { showNotif('Need a name and at least 4 players'); return }
    setLeagueCreating(true)
    setLeagueError('')
    try {
      const { data: league, error: leagueErr } = await supabase.from('leagues').insert({
        name: leagueName, sport: 'padel', status: 'active',
        day_of_week: leagueDay,
        start_date: leagueStart || null, end_date: leagueEnd || null,
        frequency: leagueFreq, format: leagueFormat, total_rounds: 3,
        points_win: leaguePointsWin, points_sets_loss: leaguePointsSetsLoss,
        points_all_sets: leaguePointsAllSets, points_bagel: leaguePointsBagel,
      }).select().single()
      if (leagueErr || !league) { const msg = leagueErr?.message || 'Unknown error'; setLeagueError(msg); showNotif('Error: ' + msg); console.error('League insert error:', leagueErr); setLeagueCreating(false); return }

      for (let gi = 0; gi < leagueGeneratedGroups.length; gi++) {
        const group = leagueGeneratedGroups[gi]
        const { data: box, error: boxErr } = await supabase.from('league_boxes').insert({
          league_id: league.id, box_number: gi + 1, name: 'Group ' + String.fromCharCode(65 + gi)
        }).select().single()
        if (boxErr) { const m = 'Box insert: ' + boxErr.message; setLeagueError(m); showNotif(m); setLeagueCreating(false); return }
        if (!box) continue

        const { error: playersErr } = await supabase.from('league_box_players').insert(
          group.map((pid: string) => ({ box_id: box.id, player_id: pid }))
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
            status: 'upcoming', team_1_p1: f.t1p1, team_1_p2: f.t1p2,
            team_2_p1: f.t2p1, team_2_p2: f.t2p2,
            scheduled_date: leagueStart || new Date().toISOString().split('T')[0],
            scheduled_time: '19:00',
          })))
          if (fixErr) { const m = 'Fixtures insert: ' + fixErr.message; setLeagueError(m); showNotif(m); setLeagueCreating(false); return }
        }
      }
      setLeagueCreated(true)
      showNotif('League created!')
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

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background: C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ fontSize:14, fontWeight:700, color: C.dark }}>Loading admin panel…</div>
    </div>
  )

  if (!currentUser) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background: C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ fontSize:14, fontWeight:700, color: C.loss }}>Access denied. Admin only.</div>
    </div>
  )

  const tabs: AdminTab[] = ['dashboard','users','posts','ratings','matches','analytics','league']

  return (
    <div style={{ minHeight:'100vh', background: C.bg, fontFamily:"'DM Sans',sans-serif", color: C.dark }}>

      {/* Notif */}
      {notif && (
        <div style={{
          position:'fixed', top:18, left:'50%', transform:'translateX(-50%)',
          background:'rgba(1,74,9,0.12)', backdropFilter:'blur(12px)',
          border:'1px solid rgba(2,107,13,0.4)', borderRadius:14,
          padding:'11px 22px', zIndex:9999, color: C.dark,
          fontWeight:700, fontSize:14, whiteSpace:'nowrap',
        }}>{notif}</div>
      )}

      {/* Header */}
      <div style={{ background: C.dark, padding:'16px 16px 12px' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ color:'#ffcc66', fontSize:18, fontWeight:800, letterSpacing:-0.3 }}>Admin Panel</div>
            <div style={{ color:'rgba(255,255,255,0.55)', fontSize:12, marginTop:2 }}>
              {currentUser.name}
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => router.push('/')} style={{
              background:'rgba(255,204,102,0.12)', border:'none',
              borderRadius:20, padding:'7px 16px', color:'#ffcc66',
              fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit',
            }}>← Back to App</button>
            <button onClick={() => { supabase.auth.signOut(); router.push('/login') }} style={{
              background:'rgba(153,0,51,0.25)', border:'none',
              borderRadius:20, padding:'7px 16px', color:'#ffaaaa',
              fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit',
            }}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ background:'#f5f0e8', padding:'4px 0' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'flex', overflowX:'auto' }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab===t ? '#014a09' : 'rgba(1,74,9,0.07)', color: tab===t ? '#ffcc66' : 'rgba(1,74,9,0.5)',
              fontSize:10, fontWeight: tab===t ? 700 : 600,
              padding:'6px 14px', borderRadius:20, cursor:'pointer', border:'none',
              fontFamily:'inherit', whiteSpace:'nowrap', textTransform:'capitalize',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:900, margin:'0 auto', padding:'20px 16px 60px', background:'#f5f0e8', minHeight:'calc(100vh - 100px)', background:'#f5f0e8', minHeight:'100vh' }}>

        {/* Dashboard */}
        {tab==='dashboard' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
            {[
              { label:'Total Users',     val:users.length,                           color: C.dark },
              { label:'Open Posts',      val:posts.filter(p=>p.spots_needed>0).length, color: C.mid },
              { label:'Active Ratings',  val:ratings.length,                         color:'#000099' },
              { label:'Total Matches',   val:matches.length,                         color:'#cc9900' },
              { label:'Admins',          val:users.filter(u=>u.is_admin).length,     color: C.loss },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background:'#fff', border:'1px solid rgba(1,74,9,0.06)',
                borderRadius:16, padding:'16px 18px',
              }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{label}</div>
                <div style={{ fontSize:28, fontWeight:900, color }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Users */}
        {tab==='users' && (
          <div style={{ background:'#fff', borderRadius:16, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid rgba(1,74,9,0.06)' }}>
              <div style={{ fontSize:15, fontWeight:700, color: C.dark }}>Users ({users.length})</div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'rgba(1,74,9,0.03)' }}>
                    {['Name','Level','Admin','Joined','Actions'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', fontWeight:700, color: C.dark, textAlign: h==='Actions'||h==='Admin' ? 'center' : 'left', fontSize:11, letterSpacing:'0.3px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderTop:`1px solid ${C.cardBorder}` }}>
                      <td style={{ padding:'11px 14px', fontWeight:600 }}>{u.name}</td>
                      <td style={{ padding:'11px 14px', color:'#888' }}>L{u.level}</td>
                      <td style={{ padding:'11px 14px', textAlign:'center' }}>
                        <input type="checkbox" checked={!!u.is_admin} onChange={async e => {
                          await supabase.from('profiles').update({ is_admin: e.target.checked }).eq('id', u.id)
                          setUsers(users.map(x => x.id===u.id ? { ...x, is_admin: e.target.checked } : x))
                          showNotif(`${u.name} ${e.target.checked ? 'is now admin' : 'removed from admin'}`)
                        }} style={{ cursor:'pointer', width:16, height:16 }} />
                      </td>
                      <td style={{ padding:'11px 14px', fontSize:12, color:'#888' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td style={{ padding:'11px 14px', textAlign:'center' }}>
                        <button onClick={async () => {
                          if (confirm(`Delete ${u.name}?`)) {
                            await supabase.from('profiles').delete().eq('id', u.id)
                            setUsers(users.filter(x => x.id!==u.id))
                            showNotif(`${u.name} deleted`)
                          }
                        }} style={{ background: C.loss, border:'none', borderRadius:6, padding:'5px 12px', color:'#fff', fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:12 }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Posts */}
        {tab==='posts' && (
          <div style={{ background:'#fff', borderRadius:16, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid rgba(1,74,9,0.06)' }}>
              <div style={{ fontSize:15, fontWeight:700, color: C.dark }}>Game Posts ({posts.length})</div>
            </div>
            <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
              {posts.map(p => (
                <div key={p.id} style={{
                  border:'1px solid rgba(1,74,9,0.06)', borderRadius:12, background:'rgba(1,74,9,0.03)',
                  padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center',
                }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>{p.player_name}</div>
                    <div style={{ fontSize:12, color:'#888' }}>L{p.level} · {p.slot} · {p.spots_needed} spots</div>
                    {p.note && <div style={{ fontSize:12, color:'#555', marginTop:2 }}>{p.note}</div>}
                  </div>
                  <button onClick={async () => {
                    if (confirm(`Delete ${p.player_name}'s post?`)) {
                      await supabase.from('post_interests').delete().eq('post_id', p.id)
                      await supabase.from('posts').delete().eq('id', p.id)
                      setPosts(posts.filter(x => x.id!==p.id))
                      showNotif('Post deleted')
                    }
                  }} style={{ background: C.loss, border:'none', borderRadius:6, padding:'6px 12px', color:'#fff', fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:12, flexShrink:0 }}>Delete</button>
                </div>
              ))}
              {posts.length===0 && <div style={{ textAlign:'center', padding:'30px', color:'#888' }}>No posts</div>}
            </div>
          </div>
        )}

        {/* Ratings */}
        {tab==='ratings' && (
          <div style={{ background:'#fff', borderRadius:16, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid rgba(1,74,9,0.06)' }}>
              <div style={{ fontSize:15, fontWeight:700, color: C.dark }}>Ratings ({ratings.length})</div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'rgba(1,74,9,0.03)' }}>
                    {['Player','Rating','Matches','Updated','Actions'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', fontWeight:700, color: C.dark, textAlign: h==='Actions'||h==='Rating'||h==='Matches' ? 'center' : 'left', fontSize:11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ratings.map(r => (
                    <tr key={r.id} style={{ borderTop:`1px solid ${C.cardBorder}` }}>
                      <td style={{ padding:'11px 14px', fontWeight:600 }}>{r.player_name}</td>
                      <td style={{ padding:'11px 14px', textAlign:'center', fontWeight:800, fontSize:15, color: C.dark }}>{r.rating.toFixed(1)}</td>
                      <td style={{ padding:'11px 14px', textAlign:'center', color:'#666' }}>{r.match_count}</td>
                      <td style={{ padding:'11px 14px', fontSize:12, color:'#888' }}>{new Date(r.updated_at).toLocaleDateString()}</td>
                      <td style={{ padding:'11px 14px', textAlign:'center', display:'flex', gap:6, justifyContent:'center' }}>
                        <button onClick={() => setEditingRating(r)} style={{ background: C.dark, border:'none', borderRadius:6, padding:'5px 12px', color: C.gold, fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:12 }}>Edit</button>
                        <button onClick={async () => {
                          if (confirm(`Delete rating for ${r.player_name}?`)) {
                            await supabase.from('ratings').delete().eq('id', r.id)
                            setRatings(ratings.filter(x => x.id!==r.id))
                            showNotif('Rating deleted')
                          }
                        }} style={{ background: C.loss, border:'none', borderRadius:6, padding:'5px 12px', color:'#fff', fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:12 }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Edit Rating Modal */}
            {editingRating && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
                <div style={{ background:'#f5f0e8', borderRadius:20, padding:24, maxWidth:380, width:'90%', fontFamily:"'DM Sans',sans-serif" }}>
                  <div style={{ fontSize:16, fontWeight:700, color: C.dark, marginBottom:16 }}>Edit Rating — {editingRating.player_name}</div>
                  {[
                    { label:'Rating (1.0–7.0)', key:'rating', type:'number', step:'0.1', min:'1', max:'7' },
                    { label:'Match Count',       key:'match_count', type:'number', min:'0' },
                  ].map(({ label, key, ...rest }) => (
                    <div key={key} style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.3px' }}>{label}</div>
                      <input
                        {...rest}
                        value={(editingRating as any)[key] || 0}
                        onChange={e => setEditingRating({ ...editingRating, [key]: parseFloat(e.target.value) })}
                        style={{ width:'100%', padding:'10px 12px', border:'1px solid rgba(1,74,9,0.06)', borderRadius:8, fontFamily:'inherit', fontSize:15, fontWeight:700, color: C.dark, background:'#fff', outline:'none' }}
                      />
                    </div>
                  ))}
                  <div style={{ display:'flex', gap:10, marginTop:18 }}>
                    <button onClick={async () => {
                      const newLevel = ratingToLevel(editingRating.rating!).level
                      await supabase.from('ratings').update({ rating: editingRating.rating, match_count: editingRating.match_count, updated_at: new Date().toISOString() }).eq('id', editingRating.id)
                      await supabase.from('profiles').update({ level: newLevel }).eq('id', editingRating.player_id)
                      setRatings(ratings.map(r => r.id===editingRating.id ? { ...r, ...editingRating } as Rating : r))
                      setEditingRating(null)
                      showNotif('Rating updated')
                    }} style={{ flex:1, background:'#014a09', border:'none', borderRadius:12, padding:'12px', color:'#ffcc66', fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:14 }}>Save</button>
                    <button onClick={() => setEditingRating(null)} style={{ flex:1, background:'rgba(1,74,9,0.07)', border:'none', borderRadius:12, padding:'12px', color:'#014a09', fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:14 }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Matches */}
        {tab==='matches' && (
          <div style={{ background:'#fff', borderRadius:16, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid rgba(1,74,9,0.06)' }}>
              <div style={{ fontSize:15, fontWeight:700, color: C.dark }}>Match History ({matches.length})</div>
            </div>
            <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
              {matches.slice(0,30).map(m => (
                <div key={m.id} style={{ border:'1px solid rgba(1,74,9,0.06)', borderRadius:12, background:'rgba(1,74,9,0.03)', padding:'12px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div style={{ fontSize:13, fontWeight:700, color: C.dark, lineHeight:1.4 }}>
                      {m.team_a1_name} & {m.team_a2_name}<br />
                      <span style={{ fontWeight:400, color:'#888', fontSize:11 }}>vs</span><br />
                      {m.team_b1_name} & {m.team_b2_name}
                    </div>
                    <button onClick={async () => {
                      if (confirm('Delete this match?')) {
                        await supabase.from('matches').delete().eq('id', m.id)
                        setMatches(matches.filter(x => x.id!==m.id))
                        showNotif('Match deleted')
                      }
                    }} style={{ background: C.loss, border:'none', borderRadius:6, padding:'5px 10px', color:'#fff', fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:11, flexShrink:0 }}>Delete</button>
                  </div>
                  <div style={{ fontSize:12, color:'#888', display:'flex', gap:16 }}>
                    <span>A: {m.sets_a.join('-')}</span>
                    <span>B: {m.sets_b.join('-')}</span>
                    <span>{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              {matches.length===0 && <div style={{ textAlign:'center', padding:'30px', color:'#888' }}>No matches</div>}
            </div>
          </div>
        )}


        {tab === 'league' && (
          <div style={{ maxWidth:560 }}>
            {leagueCreated ? (
              <div style={{ background:'#fff', borderRadius:16, padding:'32px', textAlign:'center' as const }}>
                <div style={{ fontSize:32, marginBottom:12 }}>🏆</div>
                <div style={{ fontSize:18, fontWeight:800, color:'#014a09', marginBottom:8 }}>League Created!</div>
                <div style={{ fontSize:13, color:'rgba(1,74,9,0.55)', marginBottom:20 }}>Groups and fixtures have been generated.</div>
                <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                  <button onClick={() => router.push('/league')} style={{ background:'#014a09', border:'none', borderRadius:12, padding:'11px 22px', color:'#ffcc66', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>View League →</button>
                  <button onClick={() => { setLeagueCreated(false); setLeagueStep(1); setLeagueName(''); setLeaguePlayers([]); setLeagueGeneratedGroups([]) }} style={{ background:'rgba(1,74,9,0.07)', border:'none', borderRadius:12, padding:'11px 22px', color:'#014a09', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>New Season</button>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ display:'flex', gap:4 }}>
                  {[1,2,3,4,5,6].map(n => <div key={n} style={{ height:5, flex:1, borderRadius:3, background: n <= leagueStep ? '#014a09' : 'rgba(1,74,9,0.12)' }} />)}
                </div>

                {leagueStep === 1 && (
                  <div style={{ background:'#fff', borderRadius:16, padding:'20px' }}>
                    <div style={{ fontSize:16, fontWeight:800, color:'#014a09', marginBottom:16 }}>Season Setup</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'rgba(1,74,9,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.5px', marginBottom:6 }}>Season Name</div>
                        <input value={leagueName} onChange={e => setLeagueName(e.target.value)} placeholder="e.g. Summer League 2026"
                          style={{ width:'100%', boxSizing:'border-box' as const, background:'rgba(1,74,9,0.04)', border:'1px solid rgba(1,74,9,0.12)', borderRadius:10, padding:'10px 13px', color:'#014a09', fontSize:14, fontFamily:'inherit', outline:'none' }} />
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                        {[['Start Date', leagueStart, setLeagueStart], ['End Date', leagueEnd, setLeagueEnd]].map(([label, val, setter]: any) => (
                          <div key={label}>
                            <div style={{ fontSize:11, fontWeight:700, color:'rgba(1,74,9,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.5px', marginBottom:6 }}>{label}</div>
                            <input type="date" value={val} onChange={e => setter(e.target.value)}
                              style={{ width:'100%', boxSizing:'border-box' as const, background:'rgba(1,74,9,0.04)', border:'1px solid rgba(1,74,9,0.12)', borderRadius:10, padding:'10px 13px', color:'#014a09', fontSize:13, fontFamily:'inherit', outline:'none' }} />
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'rgba(1,74,9,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.5px', marginBottom:6 }}>Fixture Frequency</div>
                        <div style={{ display:'flex', gap:6 }}>
                          {(['weekly','fortnightly','monthly'] as const).map(f => (
                            <button key={f} onClick={() => setLeagueFreq(f)} style={{ flex:1, background: leagueFreq===f ? '#014a09' : 'rgba(1,74,9,0.07)', color: leagueFreq===f ? '#ffcc66' : 'rgba(1,74,9,0.5)', border:'none', borderRadius:10, padding:'9px 0', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' as const }}>{f}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'rgba(1,74,9,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.5px', marginBottom:6 }}>Match Day</div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                          {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                            <button key={d} onClick={() => setLeagueDay(d)} style={{ background: leagueDay===d ? '#014a09' : 'rgba(1,74,9,0.07)', color: leagueDay===d ? '#ffcc66' : 'rgba(1,74,9,0.5)', border:'none', borderRadius:10, padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>{d.slice(0,3)}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => leagueName ? setLeagueStep(2) : showNotif('Enter a season name')}
                      style={{ width:'100%', marginTop:20, background:'#014a09', border:'none', borderRadius:12, padding:'12px', color:'#ffcc66', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Next → Select Players</button>
                  </div>
                )}

                {leagueStep === 2 && (
                  <div style={{ background:'#fff', borderRadius:16, padding:'20px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <div style={{ fontSize:16, fontWeight:800, color:'#014a09' }}>Select Players</div>
                      <div style={{ background:'#014a09', color:'#ffcc66', fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:12 }}>{leaguePlayers.length} selected</div>
                    </div>
                    <div style={{ position:'relative', marginBottom:10 }}>
                      <input
                        type="text"
                        placeholder="Search players..."
                        value={leagueSearch}
                        onChange={e => setLeagueSearch(e.target.value)}
                        style={{ width:'100%', boxSizing:'border-box' as const, background:'rgba(1,74,9,0.04)', border:'1px solid rgba(1,74,9,0.12)', borderRadius:10, padding:'9px 13px 9px 36px', color:'#014a09', fontSize:13, fontFamily:'inherit', outline:'none' }}
                      />
                      <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'rgba(1,74,9,0.3)', pointerEvents:'none' }}>🔍</span>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:380, overflowY:'auto' }}>
                      {[...users].filter(u => u.name.toLowerCase().includes(leagueSearch.toLowerCase())).sort((a,b) => (ratings.find(r=>r.player_id===b.id)?.rating||0) - (ratings.find(r=>r.player_id===a.id)?.rating||0)).map(u => {
                        const r = ratings.find(rt => rt.player_id === u.id)
                        const sel = leaguePlayers.includes(u.id)
                        return (
                          <div key={u.id} onClick={() => setLeaguePlayers(prev => sel ? prev.filter(id=>id!==u.id) : [...prev,u.id])}
                            style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background: sel ? 'rgba(1,74,9,0.07)' : 'rgba(1,74,9,0.02)', cursor:'pointer', border: sel ? '1.5px solid rgba(1,74,9,0.2)' : '1.5px solid transparent' }}>
                            <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(1,74,9,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#014a09', flexShrink:0 }}>{u.avatar}</div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight: sel?700:500, color:'#014a09' }}>{u.name}</div>
                              <div style={{ fontSize:11, color:'rgba(1,74,9,0.45)' }}>Rating {r ? r.rating.toFixed(1) : 'N/A'} · L{u.level}</div>
                            </div>
                            <div style={{ width:22, height:22, borderRadius:6, background: sel ? '#014a09' : 'rgba(1,74,9,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              {sel && <span style={{ fontSize:12, color:'#ffcc66' }}>✓</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:14 }}>
                      <button onClick={() => setLeagueStep(1)} style={{ flex:1, background:'rgba(1,74,9,0.07)', border:'none', borderRadius:12, padding:'12px', color:'#014a09', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={() => leaguePlayers.length >= 4 ? setLeagueStep(3) : showNotif('Select at least 4 players')}
                        style={{ flex:2, background:'#014a09', border:'none', borderRadius:12, padding:'12px', color:'#ffcc66', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Next → Format</button>
                    </div>
                  </div>
                )}

                {leagueStep === 3 && (
                  <div style={{ background:'#fff', borderRadius:16, padding:'20px' }}>
                    <div style={{ fontSize:16, fontWeight:800, color:'#014a09', marginBottom:14 }}>League Format</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {([['round_robin','Round Robin','Everyone plays everyone. Best for up to 8 players.'],['groups_knockout','Groups + Knockout','Top players advance. Best for 8+ players.']] as const).map(([key,title,sub]) => (
                        <div key={key} onClick={() => setLeagueFormat(key)}
                          style={{ display:'flex', gap:12, padding:'14px', borderRadius:12, border: leagueFormat===key ? '2px solid #014a09' : '1px solid rgba(1,74,9,0.12)', background: leagueFormat===key ? 'rgba(1,74,9,0.04)' : 'transparent', cursor:'pointer' }}>
                          <div style={{ width:18, height:18, borderRadius:'50%', border: `2px solid ${leagueFormat===key?'#014a09':'rgba(1,74,9,0.2)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                            {leagueFormat===key && <div style={{ width:8, height:8, borderRadius:'50%', background:'#014a09' }} />}
                          </div>
                          <div><div style={{ fontSize:13, fontWeight:700, color:'#014a09' }}>{title}</div><div style={{ fontSize:11, color:'rgba(1,74,9,0.5)', marginTop:3, lineHeight:1.4 }}>{sub}</div></div>
                        </div>
                      ))}
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'rgba(1,74,9,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.5px', marginBottom:8, marginTop:6 }}>Number of Groups</div>
                        <div style={{ display:'flex', gap:6 }}>
                          {[1,2,3,4].map(n => <button key={n} onClick={() => setLeagueGroups(n)} style={{ flex:1, background: leagueGroups===n ? '#014a09' : 'rgba(1,74,9,0.07)', color: leagueGroups===n ? '#ffcc66' : 'rgba(1,74,9,0.5)', border:'none', borderRadius:10, padding:'10px 0', fontSize:18, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>{n}</button>)}
                        </div>
                        <div style={{ fontSize:11, color:'rgba(1,74,9,0.4)', marginTop:6, textAlign:'center' as const }}>{leaguePlayers.length} players → {leagueGroups} groups of ~{Math.ceil(leaguePlayers.length/leagueGroups)}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:20 }}>
                      <button onClick={() => setLeagueStep(2)} style={{ flex:1, background:'rgba(1,74,9,0.07)', border:'none', borderRadius:12, padding:'12px', color:'#014a09', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={() => { setLeagueGeneratedGroups(snakeSeed(leaguePlayers, leagueGroups)); setLeagueStep(4) }}
                        style={{ flex:2, background:'#014a09', border:'none', borderRadius:12, padding:'12px', color:'#ffcc66', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Next → Preview Groups</button>
                    </div>
                  </div>
                )}

                {leagueStep === 4 && (
                  <div style={{ background:'#fff', borderRadius:16, padding:'20px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                      <div style={{ fontSize:16, fontWeight:800, color:'#014a09' }}>Groups Preview</div>
                      <button onClick={() => setLeagueGeneratedGroups(snakeSeed(leaguePlayers, leagueGroups))}
                        style={{ background:'rgba(1,74,9,0.07)', border:'none', borderRadius:10, padding:'6px 12px', color:'#014a09', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Reshuffle ↺</button>
                    </div>
                    <div style={{ fontSize:11, color:'rgba(1,74,9,0.45)', marginBottom:14 }}>Snake-seeded by rating · balanced groups</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      {leagueGeneratedGroups.map((group, gi) => {
                        const avg = group.reduce((s,pid) => s + (ratings.find(r=>r.player_id===pid)?.rating||0), 0) / (group.length||1)
                        return (
                          <div key={gi} style={{ background:'rgba(1,74,9,0.04)', borderRadius:12, padding:'12px' }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'#014a09', marginBottom:2 }}>Group {String.fromCharCode(65+gi)}</div>
                            <div style={{ fontSize:10, color:'rgba(1,74,9,0.4)', marginBottom:10 }}>Avg {avg.toFixed(1)}</div>
                            {group.map((pid:string) => {
                              const u = users.find(u=>u.id===pid)
                              const r = ratings.find(rt=>rt.player_id===pid)
                              return u ? (
                                <div key={pid} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                                  <div style={{ width:26, height:26, borderRadius:'50%', background:'rgba(1,74,9,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#014a09', flexShrink:0 }}>{u.avatar}</div>
                                  <div><div style={{ fontSize:12, fontWeight:600, color:'#014a09' }}>{u.name.split(' ')[0]}</div><div style={{ fontSize:10, color:'rgba(1,74,9,0.45)', fontWeight:700 }}>{r?.rating.toFixed(1)||'N/A'}</div></div>
                                </div>
                              ) : null
                            })}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:16 }}>
                      <button onClick={() => setLeagueStep(3)} style={{ flex:1, background:'rgba(1,74,9,0.07)', border:'none', borderRadius:12, padding:'12px', color:'#014a09', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={() => setLeagueStep(5)} style={{ flex:2, background:'#014a09', border:'none', borderRadius:12, padding:'12px', color:'#ffcc66', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Next → Points</button>
                    </div>
                  </div>
                )}

                {leagueStep === 5 && (
                  <div style={{ background:'#fff', borderRadius:16, padding:'20px' }}>
                    <div style={{ fontSize:16, fontWeight:800, color:'#014a09', marginBottom:16 }}>Points System</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                      <div style={{ paddingBottom:16 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'rgba(1,74,9,0.45)', textTransform:'uppercase' as const, letterSpacing:'0.5px', marginBottom:8 }}>Points for winning</div>
                        <div style={{ display:'flex', alignItems:'center', background:'rgba(1,74,9,0.07)', borderRadius:12, overflow:'hidden', width:120 }}>
                          <button onClick={() => setLeaguePointsWin(Math.max(0,leaguePointsWin-1))} style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'none', fontSize:18, fontWeight:700, color:'#014a09', cursor:'pointer', fontFamily:'inherit' }}>−</button>
                          <div style={{ flex:1, textAlign:'center' as const, fontSize:18, fontWeight:800, color:'#014a09' }}>{leaguePointsWin}</div>
                          <button onClick={() => setLeaguePointsWin(Math.min(9,leaguePointsWin+1))} style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'none', fontSize:18, fontWeight:700, color:'#014a09', cursor:'pointer', fontFamily:'inherit' }}>+</button>
                        </div>
                      </div>
                      {([
                        ['Sets won in a loss','+1 pt per set won when you lose',leaguePointsSetsLoss,(v:boolean)=>{setLeaguePointsSetsLoss(v);if(v)setLeaguePointsAllSets(false)}],
                        ['Sets won by all players','+1 pt per set regardless of result',leaguePointsAllSets,(v:boolean)=>{setLeaguePointsAllSets(v);if(v)setLeaguePointsSetsLoss(false)}],
                        ['Bagel bonus (6–0)','+1 pt per 6–0 set won',leaguePointsBagel,setLeaguePointsBagel],
                      ] as [string,string,boolean,(v:boolean)=>void][]).map(([label,sub,val,setter]) => (
                        <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0', borderTop:'1px solid rgba(1,74,9,0.07)' }}>
                          <div><div style={{ fontSize:13, fontWeight:600, color:'#014a09' }}>{label}</div><div style={{ fontSize:11, color:'rgba(1,74,9,0.45)', marginTop:2 }}>{sub}</div></div>
                          <div onClick={() => setter(!val)} style={{ width:40, height:22, borderRadius:11, background: val ? '#014a09' : 'rgba(1,74,9,0.15)', position:'relative', cursor:'pointer', transition:'background 0.2s', flexShrink:0 }}>
                            <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:2, left: val ? 20 : 2, transition:'left 0.2s' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:20 }}>
                      <button onClick={() => setLeagueStep(4)} style={{ flex:1, background:'rgba(1,74,9,0.07)', border:'none', borderRadius:12, padding:'12px', color:'#014a09', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={() => setLeagueStep(6)} style={{ flex:2, background:'#014a09', border:'none', borderRadius:12, padding:'12px', color:'#ffcc66', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Next → Review</button>
                    </div>
                  </div>
                )}

                {leagueStep === 6 && (
                  <div style={{ background:'#fff', borderRadius:16, padding:'20px' }}>
                    <div style={{ fontSize:16, fontWeight:800, color:'#014a09', marginBottom:16 }}>Review & Launch</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                      {([
                        ['Season', leagueName],
                        ['Dates', leagueStart&&leagueEnd ? leagueStart+' – '+leagueEnd : 'No dates set'],
                        ['Match Day', leagueDay],
        ['Format', leagueFormat==='round_robin' ? 'Round Robin' : 'Groups + Knockout'],
                        ['Players', leaguePlayers.length+' selected'],
                        ['Groups', leagueGroups+' groups of ~'+Math.ceil(leaguePlayers.length/leagueGroups)],
                        ['Points', 'Win: '+leaguePointsWin+'pts'+(leaguePointsSetsLoss?' · Sets in loss: +1':'')+(leaguePointsAllSets?' · All sets: +1':'')+(leaguePointsBagel?' · Bagel: +1':'')],
                      ] as [string,string][]).map(([k,v],i) => (
                        <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'11px 0', borderBottom: i<5 ? '1px solid rgba(1,74,9,0.06)' : 'none' }}>
                          <span style={{ fontSize:12, color:'rgba(1,74,9,0.45)' }}>{k}</span>
                          <span style={{ fontSize:12, fontWeight:700, color:'#014a09', textAlign:'right' as const, maxWidth:'60%' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:'rgba(1,74,9,0.04)', borderRadius:12, padding:'11px 14px', marginTop:12, fontSize:12, color:'rgba(1,74,9,0.55)', lineHeight:1.5 }}>
                      Fixtures will be auto-generated and visible to all players immediately.
                    </div>
                    {leagueError && (
                      <div style={{ background:'rgba(153,0,51,0.08)', border:'1px solid rgba(153,0,51,0.2)', borderRadius:12, padding:'10px 14px', marginTop:8, fontSize:12, color:'#990033' }}>
                        Error: {leagueError}
                      </div>
                    )}
                    <div style={{ display:'flex', gap:8, marginTop:16 }}>
                      <button onClick={() => setLeagueStep(5)} style={{ flex:1, background:'rgba(1,74,9,0.07)', border:'none', borderRadius:12, padding:'12px', color:'#014a09', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={handleCreateLeague} disabled={leagueCreating}
                        style={{ flex:2, background: leagueCreating ? 'rgba(1,74,9,0.4)' : '#014a09', border:'none', borderRadius:12, padding:'12px', color:'#ffcc66', fontWeight:800, fontSize:14, cursor: leagueCreating?'default':'pointer', fontFamily:'inherit' }}>
                        {leagueCreating ? 'Creating…' : 'Launch Season 🚀'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Analytics */}
        {tab==='analytics' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:14 }}>
            <div style={{ background:'#fff', borderRadius:16, padding:'16px 18px' }}>
              <div style={{ fontSize:13, fontWeight:700, color: C.dark, marginBottom:14 }}>Top Players by Rating</div>
              {ratings.slice(0,5).map((r,i) => (
                <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid rgba(1,74,9,0.06)' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>#{i+1} {r.player_name}</div>
                    <div style={{ fontSize:11, color:'#888' }}>{r.match_count} matches</div>
                  </div>
                  <div style={{ fontSize:15, fontWeight:800, color: C.dark }}>{r.rating.toFixed(1)}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'#fff', borderRadius:16, padding:'16px 18px' }}>
              <div style={{ fontSize:13, fontWeight:700, color: C.dark, marginBottom:14 }}>Level Distribution</div>
              {[['1','Elite','#cc9900'],['2','Competitive','#000099'],['3','Casual','#006633'],['4','Beginner','#990033']].map(([level,desc,color]) => {
                const count = users.filter(u => u.level===level).length
                return (
                  <div key={level} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid rgba(1,74,9,0.06)' }}>
                    <div style={{ fontSize:13 }}>L{level} <span style={{ color:'#888' }}>{desc}</span></div>
                    <div style={{ fontSize:15, fontWeight:800, color }}>{count}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ background:'#fff', borderRadius:16, padding:'16px 18px' }}>
              <div style={{ fontSize:13, fontWeight:700, color: C.dark, marginBottom:14 }}>Activity</div>
              {[
                ['Avg Matches / Player', (ratings.reduce((s,r)=>s+r.match_count,0)/ratings.length||0).toFixed(1)],
                ['Total Matches Played', matches.length],
                ['Active Game Posts',    posts.filter(p=>p.spots_needed>0).length],
                ['Avg Rating',           (ratings.reduce((s,r)=>s+r.rating,0)/ratings.length||0).toFixed(1)],
              ].map(([label,val]) => (
                <div key={label as string} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(1,74,9,0.06)', fontSize:13 }}>
                  <span style={{ color:'#555' }}>{label}</span>
                  <span style={{ fontWeight:700, color: C.dark }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

