'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

interface BuddyWithProfile extends Profile {
  is_buddy: boolean
}

const levelColor: Record<string, string> = { '1': '#cc9900', '2': '#000099', '3': '#006633', '4': '#990033' }
const levelBg: Record<string, string> = { '1': 'rgba(204,153,0,0.12)', '2': 'rgba(0,0,153,0.10)', '3': 'rgba(0,102,51,0.10)', '4': 'rgba(153,0,51,0.12)' }
const levelDesc: Record<string, string> = { '1': 'Elite', '2': 'Competitive', '3': 'Casual', '4': 'Beginner' }

function Avatar({ initials, size = 40, level }: { initials: string; size?: number; level?: string }) {
  const c = level ? levelColor[level] : '#00c6a2'
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `linear-gradient(135deg,${c}45,${c}18)`, border: `2px solid ${c}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c, fontWeight: 900, fontSize: size * 0.3, flexShrink: 0, boxShadow: `0 0 10px ${c}28` }}>
      {initials}
    </div>
  )
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span style={{ background: levelBg[level], color: levelColor[level], border: `1px solid ${levelColor[level]}40`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
      L{level} · {levelDesc[level]}
    </span>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [buddies, setBuddies] = useState<BuddyWithProfile[]>([])
  const [allProfiles, setAllProfiles] = useState<BuddyWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [notif, setNotif] = useState<string | null>(null)
  const [filterLevel, setFilterLevel] = useState<string>('')
  const [filterAvailability, setFilterAvailability] = useState<string>('')

  const showNotif = (msg: string) => {
    setNotif(msg)
    setTimeout(() => setNotif(null), 3000)
  }

  // Load user profile and buddies
  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profile) {
        setCurrentUser(profile)
      }

      // Get all profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('name')

      if (profiles) {
        setAllProfiles(profiles)
      }

      // Get buddies
      const { data: buddiesData } = await supabase
        .from('buddies')
        .select('buddy_id')
        .eq('user_id', session.user.id)

      if (buddiesData && profiles) {
        const buddyIds = new Set(buddiesData.map(b => b.buddy_id))
        const enrichedBuddies = profiles.filter(p => buddyIds.has(p.id)).map(p => ({ ...p, is_buddy: true }))
        setBuddies(enrichedBuddies)
      }

      setLoading(false)
    }

    loadData()
  }, [router])

  const addBuddy = async (buddyId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { error } = await supabase
      .from('buddies')
      .insert([{ user_id: session.user.id, buddy_id: buddyId }])

    if (error) {
      showNotif('Error adding buddy')
      return
    }

    // Refresh buddies
    const { data: buddy } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', buddyId)
      .single()

    if (buddy) {
      setBuddies([...buddies, buddy as BuddyWithProfile])
    }
    showNotif('Buddy added!')
  }

  const removeBuddy = async (buddyId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { error } = await supabase
      .from('buddies')
      .delete()
      .eq('user_id', session.user.id)
      .eq('buddy_id', buddyId)

    if (error) {
      showNotif('Error removing buddy')
      return
    }

    setBuddies(buddies.filter(b => b.id !== buddyId))
    showNotif('Buddy removed')
  }

  const getFilteredBuddies = () => {
    return buddies.filter(buddy => {
      if (filterLevel && buddy.level !== filterLevel) return false
      if (filterAvailability && !buddy.availability.includes(filterAvailability)) return false
      return true
    })
  }

  const getAvailableToAdd = () => {
    const buddyIds = new Set(buddies.map(b => b.id))
    return allProfiles.filter(p => p.id !== currentUser?.id && !buddyIds.has(p.id))
  }

  const filteredBuddies = getFilteredBuddies()
  const availableToAdd = getAvailableToAdd()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f0e8', color: '#014a09' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Loading profile…</div>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f0e8', color: '#990033' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Access denied. Please log in.</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f0e8', fontFamily: "'DM Sans', sans-serif", color: '#014a09', padding: '20px' }}>
      {/* Notification */}
      {notif && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: '#014a09', color: '#f5f0e8', padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 1000 }}>
          {notif}
        </div>
      )}

      {/* Back Button */}
      <button
        onClick={() => router.back()}
        style={{ marginBottom: 24, padding: '8px 16px', background: 'transparent', border: '1px solid #014a0944', borderRadius: 6, color: '#014a09', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        ← Back
      </button>

      {/* Profile Header */}
      <div style={{ marginBottom: 40, padding: 24, background: 'white', borderRadius: 12, border: '1px solid #014a0911' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <Avatar initials={currentUser.avatar} size={80} level={currentUser.level} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{currentUser.name}</h1>
              <LevelBadge level={currentUser.level} />
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              {currentUser.availability.length > 0 ? `Available: ${currentUser.availability.join(', ')}` : 'No availability set'}
            </div>
          </div>
        </div>
      </div>

      {/* Buddy List Section */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 20, paddingBottom: 12, borderBottom: '2px solid #014a09' }}>
          My Buddies ({buddies.length})
        </h2>

        {/* Filters */}
        {buddies.length > 0 && (
          <div style={{ marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #014a0922', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}
            >
              <option value="">All Levels</option>
              <option value="1">L1 · Elite</option>
              <option value="2">L2 · Competitive</option>
              <option value="3">L3 · Casual</option>
              <option value="4">L4 · Beginner</option>
            </select>
            <select
              value={filterAvailability}
              onChange={(e) => setFilterAvailability(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #014a0922', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}
            >
              <option value="">All Times</option>
              <option value="Mon AM">Monday AM</option>
              <option value="Mon PM">Monday PM</option>
              <option value="Tue AM">Tuesday AM</option>
              <option value="Tue PM">Tuesday PM</option>
              <option value="Wed AM">Wednesday AM</option>
              <option value="Wed PM">Wednesday PM</option>
              <option value="Thu AM">Thursday AM</option>
              <option value="Thu PM">Thursday PM</option>
              <option value="Fri AM">Friday AM</option>
              <option value="Fri PM">Friday PM</option>
              <option value="Sat AM">Saturday AM</option>
              <option value="Sat PM">Saturday PM</option>
              <option value="Sun AM">Sunday AM</option>
              <option value="Sun PM">Sunday PM</option>
            </select>
          </div>
        )}

        {/* Buddies Grid */}
        {filteredBuddies.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 40 }}>
            {filteredBuddies.map(buddy => (
              <div key={buddy.id} style={{ padding: 16, background: 'white', borderRadius: 12, border: '1px solid #014a0911', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar initials={buddy.avatar} size={48} level={buddy.level} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{buddy.name}</div>
                    <LevelBadge level={buddy.level} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
                  {buddy.availability.length > 0 ? buddy.availability.join(', ') : 'No availability'}
                </div>
                <button
                  onClick={() => removeBuddy(buddy.id)}
                  style={{
                    padding: '8px 12px',
                    background: '#f5f0e8',
                    border: '1px solid #990033',
                    borderRadius: 6,
                    color: '#990033',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 32, background: 'white', borderRadius: 12, border: '1px solid #014a0911', textAlign: 'center', color: '#666', marginBottom: 40 }}>
            {buddies.length === 0 ? "You don't have any buddies yet. Add some below!" : 'No buddies match your filters.'}
          </div>
        )}

        {/* Add Buddies Section */}
        {availableToAdd.length > 0 && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>Add Buddies</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {availableToAdd.map(profile => (
                <div key={profile.id} style={{ padding: 16, background: 'white', borderRadius: 12, border: '1px solid #014a0911', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar initials={profile.avatar} size={48} level={profile.level} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{profile.name}</div>
                      <LevelBadge level={profile.level} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
                    {profile.availability.length > 0 ? profile.availability.join(', ') : 'No availability'}
                  </div>
                  <button
                    onClick={() => addBuddy(profile.id)}
                    style={{
                      padding: '8px 12px',
                      background: '#014a09',
                      border: 'none',
                      borderRadius: 6,
                      color: '#f5f0e8',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Add Buddy
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
