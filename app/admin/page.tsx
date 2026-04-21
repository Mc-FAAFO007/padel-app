'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Post, Rating, Match } from '@/lib/types'

type AdminTab = 'dashboard' | 'users' | 'posts' | 'ratings' | 'matches' | 'analytics'

interface AdminUser extends Profile {
  is_admin: boolean
}

export default function AdminPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [loading, setLoading] = useState(true)
  const [notif, setNotif] = useState<string | null>(null)

  // Data states
  const [users, setUsers] = useState<AdminUser[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [ratings, setRatings] = useState<Rating[]>([])
  const [matches, setMatches] = useState<Match[]>([])

  // Edit states
  const [editingUser, setEditingUser] = useState<Partial<AdminUser> | null>(null)
  const [editingPost, setEditingPost] = useState<Partial<Post> | null>(null)
  const [editingRating, setEditingRating] = useState<Partial<Rating> | null>(null)

  const showNotif = (msg: string) => {
    setNotif(msg)
    setTimeout(() => setNotif(null), 3000)
  }

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    // Check if user is admin
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*, is_admin: is_admin')
      .eq('id', session.user.id)
      .single()

    if (!profileData?.is_admin) {
      router.push('/')
      showNotif('Admin access denied')
      return
    }

    setCurrentUser(profileData as AdminUser)

    // Load all data
    const [usersRes, postsRes, ratingsRes, matchesRes] = await Promise.all([
      supabase.from('profiles').select('*, is_admin: is_admin').order('created_at'),
      supabase.from('posts').select('*').order('created_at', { ascending: false }),
      supabase.from('ratings').select('*').order('rating', { ascending: false }),
      supabase.from('matches').select('*').order('created_at', { ascending: false }),
    ])

    setUsers((usersRes.data as AdminUser[]) || [])
    setPosts(postsRes.data as Post[] || [])
    setRatings(ratingsRes.data as Rating[] || [])
    setMatches(matchesRes.data as Match[] || [])
    setLoading(false)
  }, [router])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f0e8', color: '#014a09' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Loading admin panel…</div>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f0e8', color: '#990033' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Access denied. Admin only.</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f0e8', fontFamily: "'DM Sans', sans-serif", color: '#014a09', padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, marginBottom: 4 }}>Admin Panel</h1>
          <div style={{ fontSize: 13, color: '#888' }}>Logged in as {currentUser.name} • Admin</div>
        </div>
        <button
          onClick={() => { supabase.auth.signOut(); router.push('/login') }}
          style={{ background: '#990033', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Sign Out
        </button>
      </div>

      {/* Notification */}
      {notif && (
        <div style={{ background: 'rgba(1, 74, 9, 0.12)', border: '1px solid rgba(1, 74, 9, 0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: '#014a09', fontWeight: 700, fontSize: 13 }}>
          {notif}
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 32 }}>
        {(['dashboard', 'users', 'posts', 'ratings', 'matches', 'analytics'] as AdminTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#014a09' : '#fff',
              border: `1px solid ${tab === t ? '#014a09' : '#ddd'}`,
              color: tab === t ? '#ffcc66' : '#555',
              borderRadius: 10,
              padding: '12px 0',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 12,
              textTransform: 'capitalize',
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {tab === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: 12, color: '#888', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Total Users</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#014a09' }}>{users.length}</div>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: 12, color: '#888', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Open Game Posts</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#026b0d' }}>{posts.filter(p => p.spots_needed > 0).length}</div>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: 12, color: '#888', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Active Ratings</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#000099' }}>{ratings.length}</div>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: 12, color: '#888', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Total Matches</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#cc9900' }}>{matches.length}</div>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: 12, color: '#888', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Admins</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#990033' }}>{users.filter(u => u.is_admin).length}</div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e0e0e0', overflowX: 'auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>User Management ({users.length})</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 800, color: '#666' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 800, color: '#666' }}>Level</th>
                <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 800, color: '#666' }}>Admin</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 800, color: '#666' }}>Joined</th>
                <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 800, color: '#666' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px 8px' }}>{u.name}</td>
                  <td style={{ padding: '12px 8px' }}>L{u.level}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={u.is_admin}
                      onChange={async (e) => {
                        const { error } = await supabase
                          .from('profiles')
                          .update({ is_admin: e.target.checked })
                          .eq('id', u.id)
                        if (error) showNotif('Error updating admin status')
                        else {
                          showNotif(`${u.name} ${e.target.checked ? 'is now an admin' : 'is no longer an admin'}`)
                          setUsers(users.map(x => x.id === u.id ? { ...x, is_admin: e.target.checked } : x))
                        }
                      }}
                      style={{ cursor: 'pointer', width: 18, height: 18 }}
                    />
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: 12, color: '#888' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete user ${u.name}? This will remove all their data.`)) {
                          const { error } = await supabase
                            .from('profiles')
                            .delete()
                            .eq('id', u.id)
                          if (error) showNotif('Error deleting user')
                          else {
                            showNotif(`${u.name} deleted`)
                            setUsers(users.filter(x => x.id !== u.id))
                          }
                        }
                      }}
                      style={{ background: '#ff6b6b', border: 'none', borderRadius: 6, padding: '6px 12px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Posts Tab */}
      {tab === 'posts' && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e0e0e0' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>Game Posts Management ({posts.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {posts.map(p => (
              <div key={p.id} style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.player_name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>L{p.level} • {p.slot}</div>
                  <div style={{ fontSize: 12, color: '#555' }}>Spots: {p.spots_needed} • Note: {p.note || '(none)'}</div>
                </div>
                <button
                  onClick={async () => {
                    if (confirm(`Delete ${p.player_name}'s post?`)) {
                      const { error } = await supabase
                        .from('posts')
                        .delete()
                        .eq('id', p.id)
                      if (error) showNotif('Error deleting post')
                      else {
                        showNotif('Post deleted')
                        setPosts(posts.filter(x => x.id !== p.id))
                      }
                    }
                  }}
                  style={{ background: '#ff6b6b', border: 'none', borderRadius: 6, padding: '8px 14px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Delete
                </button>
              </div>
            ))}
            {posts.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No posts</div>}
          </div>
        </div>
      )}

      {/* Ratings Tab */}
      {tab === 'ratings' && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e0e0e0', overflowX: 'auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>Ratings Management ({ratings.length})</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 800, color: '#666' }}>Player</th>
                <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 800, color: '#666' }}>Rating</th>
                <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 800, color: '#666' }}>Matches</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 800, color: '#666' }}>Updated</th>
                <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 800, color: '#666' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ratings.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 600 }}>{r.player_name}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{r.rating.toFixed(1)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', color: '#666' }}>{r.match_count}</td>
                  <td style={{ padding: '12px 8px', fontSize: 12, color: '#888' }}>{new Date(r.updated_at).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', display: 'flex', gap: 6, justifyContent: 'center' }}>
                    <button
                      onClick={() => setEditingRating(r)}
                      style={{ background: '#000099', border: 'none', borderRadius: 6, padding: '6px 12px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete rating for ${r.player_name}?`)) {
                          const { error } = await supabase
                            .from('ratings')
                            .delete()
                            .eq('id', r.id)
                          if (error) showNotif('Error deleting rating')
                          else {
                            showNotif('Rating deleted')
                            setRatings(ratings.filter(x => x.id !== r.id))
                          }
                        }
                      }}
                      style={{ background: '#ff6b6b', border: 'none', borderRadius: 6, padding: '6px 12px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Edit Rating Modal */}
          {editingRating && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 400, width: '90%' }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Edit Rating</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#666' }}>Rating</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="7"
                    value={editingRating.rating || 3.5}
                    onChange={(e) => setEditingRating({ ...editingRating, rating: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontFamily: 'inherit', fontSize: 14 }}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#666' }}>Matches</label>
                  <input
                    type="number"
                    min="0"
                    value={editingRating.match_count || 0}
                    onChange={(e) => setEditingRating({ ...editingRating, match_count: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontFamily: 'inherit', fontSize: 14 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={async () => {
                      const { error } = await supabase
                        .from('ratings')
                        .update({
                          rating: editingRating.rating,
                          match_count: editingRating.match_count,
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', editingRating.id)
                      if (error) showNotif('Error updating rating')
                      else {
                        showNotif('Rating updated')
                        setRatings(ratings.map(r => r.id === editingRating.id ? { ...r, ...editingRating } as Rating : r))
                        setEditingRating(null)
                      }
                    }}
                    style={{ flex: 1, background: '#014a09', border: 'none', borderRadius: 8, padding: '12px', color: '#ffcc66', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Save
                  </button>
                  <button
                    onClick={() => setEditingRating(null)}
                    style={{ flex: 1, background: '#f0f0f0', border: 'none', borderRadius: 8, padding: '12px', color: '#666', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Matches Tab */}
      {tab === 'matches' && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e0e0e0' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>Match History ({matches.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {matches.slice(0, 20).map(m => (
              <div key={m.id} style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>
                    {m.team_a1_name} & {m.team_a2_name} vs {m.team_b1_name} & {m.team_b2_name}
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm(`Delete this match?`)) {
                        const { error } = await supabase
                          .from('matches')
                          .delete()
                          .eq('id', m.id)
                        if (error) showNotif('Error deleting match')
                        else {
                          showNotif('Match deleted')
                          setMatches(matches.filter(x => x.id !== m.id))
                        }
                      }
                    }}
                    style={{ background: '#ff6b6b', border: 'none', borderRadius: 6, padding: '6px 12px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                    Delete
                  </button>
                </div>
                <div style={{ fontSize: 13, color: '#666', display: 'flex', gap: 20 }}>
                  <div>Sets A: {m.sets_a.join(', ')}</div>
                  <div>Sets B: {m.sets_b.join(', ')}</div>
                  <div style={{ color: '#888' }}>{new Date(m.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
            {matches.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No matches</div>}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e0e0e0' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Top Players by Rating</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ratings.slice(0, 5).map((r, i) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>#{i + 1} {r.player_name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{r.match_count} matches</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{r.rating.toFixed(1)}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e0e0e0' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Level Distribution</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['1', '2', '3', '4'].map(level => {
                const count = users.filter(u => u.level === level).length
                const labels = { '1': 'Elite', '2': 'Competitive', '3': 'Casual', '4': 'Beginner' }
                return (
                  <div key={level} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>L{level} <span style={{ color: '#888' }}>({labels[level as keyof typeof labels]})</span></div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{count}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e0e0e0' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Player Activity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Avg Matches per Player</span>
                <span style={{ fontWeight: 700 }}>{(ratings.reduce((sum, r) => sum + r.match_count, 0) / ratings.length || 0).toFixed(1)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Total Matches Played</span>
                <span style={{ fontWeight: 700 }}>{matches.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Active Game Posts</span>
                <span style={{ fontWeight: 700 }}>{posts.filter(p => p.spots_needed > 0).length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Avg Rating</span>
                <span style={{ fontWeight: 700 }}>{(ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length || 0).toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
