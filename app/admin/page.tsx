'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Post, Rating, Match } from '@/lib/types'

type AdminTab = 'dashboard' | 'users' | 'posts' | 'ratings' | 'matches' | 'analytics'

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

  const showNotif = (msg: string) => {
    setNotif(msg)
    setTimeout(() => setNotif(null), 3000)
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

  const tabs: AdminTab[] = ['dashboard','users','posts','ratings','matches','analytics']

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
      <div style={{ maxWidth:900, margin:'0 auto', padding:'20px 16px 60px', background:'#f5f0e8', minHeight:'100vh' }}>

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
                borderRadius:12, padding:'16px 18px',
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
                  border:'1px solid rgba(1,74,9,0.06)', borderRadius:10,
                  padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center',
                }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>{p.player_name}</div>
                    <div style={{ fontSize:12, color:'#888' }}>L{p.level} · {p.slot} · {p.spots_needed} spots</div>
                    {p.note && <div style={{ fontSize:12, color:'#555', marginTop:2 }}>{p.note}</div>}
                  </div>
                  <button onClick={async () => {
                    if (confirm(`Delete ${p.player_name}'s post?`)) {
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
                <div key={m.id} style={{ border:'1px solid rgba(1,74,9,0.06)', borderRadius:10, padding:'12px 14px' }}>
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

