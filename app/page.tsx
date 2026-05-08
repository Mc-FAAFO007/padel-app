'use client'
import { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AvailabilityPicker from '@/components/AvailabilityPicker'
import type { Profile, Post, Match } from '@/lib/types'

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
  return PERIOD_COLOR[period] || { color:'#2d5c42', bg:'rgba(45,92,66,0.12)' }
}
function formatSlotDisplay(slot: string): string {
  try {
    const dotIndex = slot.indexOf(' · ')
    if (dotIndex === -1) return slot
    const timePart = slot.slice(0, dotIndex)
    const durPart  = slot.slice(dotIndex + 3)
    const mins     = parseInt(durPart) || 60
    const parts = timePart.split(' ')
    const day   = parts[0]
    const time  = parts[1]
    const ampm  = parts[2]
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
  } catch { return slot }
}

const levels    = ['1','2','3','4']
// ── UPDATED level colours to match staff portal palette ──
const levelColor: Record<string,string> = { '1':'#b8963e','2':'#2d3a8a','3':'#1a5c35','4':'#8b2020' }
const levelBg:    Record<string,string> = { '1':'rgba(184,150,62,0.12)','2':'rgba(45,58,138,0.10)','3':'rgba(26,92,53,0.10)','4':'rgba(139,32,32,0.12)' }
const levelDesc:  Record<string,string> = { '1':'Elite','2':'Competitive','3':'Casual','4':'Beginner' }

function ratingToLevel(rating: number): { level: string; color: string; bg: string; desc: string } {
  if (rating >= 5.6) return { level:'1', color:'#b8963e', bg:'rgba(184,150,62,0.12)', desc:'Elite' }
  if (rating >= 4.1) return { level:'2', color:'#2d3a8a', bg:'rgba(45,58,138,0.10)', desc:'Competitive' }
  if (rating >= 2.6) return { level:'3', color:'#1a5c35', bg:'rgba(26,92,53,0.10)', desc:'Casual' }
  return              { level:'4', color:'#8b2020', bg:'rgba(139,32,32,0.12)', desc:'Beginner' }
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

// ─── Design tokens — UPDATED to staff portal palette ─────────────────────────
const C = {
  bg:   '#f9f6f0',
  dark: '#1a3a2a',
  mid:  '#2d5c42',
  gold: '#b8963e',
  win:  '#1a5c35',
  loss: '#8b2020',
}

// ─── Shared style helpers ─────────────────────────────────────────────────────
const card: React.CSSProperties  = { background:'#fff', borderRadius:14, padding:'12px 14px', border:'1px solid rgba(26,58,42,0.1)' }
const card2: React.CSSProperties = { background:'rgba(26,58,42,0.05)', borderRadius:14, padding:'12px 14px', border:'1px solid rgba(26,58,42,0.08)' }
const sec: React.CSSProperties   = { fontSize:9, fontWeight:500, letterSpacing:'1.2px', textTransform:'uppercase' as const, color:'rgba(26,58,42,0.38)' }

function pill(active: boolean): React.CSSProperties {
  return active
    ? { background:'#1a3a2a', color:'#b8963e', fontSize:11, fontWeight:500, padding:'7px 16px', borderRadius:20, cursor:'pointer', border:'none', fontFamily:'inherit', whiteSpace:'nowrap' as const, flexShrink:0, transition:'all 0.15s', letterSpacing:'0.04em' }
    : { background:'transparent', color:'rgba(26,58,42,0.45)', fontSize:11, fontWeight:400, padding:'7px 16px', borderRadius:20, cursor:'pointer', border:'1px solid rgba(26,58,42,0.18)', fontFamily:'inherit', whiteSpace:'nowrap' as const, flexShrink:0, transition:'all 0.15s', letterSpacing:'0.04em' }
}

// ─── Atoms ───────────────────────────────────────────────────────────────────
// UPDATED: solid coloured circles with white initials (staff portal style)
function Avatar({ initials, size=40, level }: { initials:string, size?:number, level?:string }) {
  const bg = level ? levelColor[level] : '#1a3a2a'
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:500, fontSize:size*0.32, flexShrink:0 }}>
      {initials}
    </div>
  )
}

function LevelBadge({ level, small=false }: { level:string, small?:boolean }) {
  return (
    <span style={{ background:levelBg[level], color:levelColor[level], borderRadius:20, padding:small?'2px 8px':'3px 10px', fontSize:small?9:10, fontWeight:500, whiteSpace:'nowrap', letterSpacing:'0.02em' }}>
      L{level} · {levelDesc[level]}
    </span>
  )
}

function Notif({ msg }: { msg: string|null }) {
  if (!msg) return null
  return (
    <div style={{ position:'fixed', top:18, left:'50%', transform:'translateX(-50%)', background:'rgba(26,58,42,0.1)', backdropFilter:'blur(12px)', border:'1px solid rgba(45,92,66,0.35)', borderRadius:14, padding:'11px 22px', zIndex:9999, color:'#1a3a2a', fontWeight:500, fontSize:14, whiteSpace:'nowrap', letterSpacing:'0.02em' }}>
      {msg}
    </div>
  )
}

// UPDATED: Playfair Display serif for the page title
function PageHeader({ title, rating, right }: { title: string; rating?: number|null; right?: React.ReactNode }) {
  return (
    <div style={{ padding:'22px 0 8px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div style={{ fontFamily:"'Playfair Display', serif", fontSize:22, fontWeight:400, color:C.dark, letterSpacing:-0.3 }}>{title}</div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {rating != null && (
          <div style={{ background:C.dark, color:C.gold, fontSize:13, fontWeight:500, padding:'5px 12px', borderRadius:14, fontFamily:"'Playfair Display', serif" }}>
            {rating.toFixed(1)}
          </div>
        )}
        {right}
      </div>
    </div>
  )
}

// ─── Schedule Card ────────────────────────────────────────────────────────────
function ScheduleCard({
  p, isOwner, players, currentUser, liveRating,
  onEdit, onDelete, onCancelSpot, onLogScore, router,
}: {
  p: any; isOwner: boolean; players: Profile[]; currentUser: Profile; liveRating: number|null;
  onEdit: (p: any) => void; onDelete: (id: number) => void; onCancelSpot: (id: number) => void;
  onLogScore: (p: any) => void; router: any;
}) {
  const c = levelColor[p.level]
  const interestedPlayers = players.filter((pl: any) => p.interested_ids.includes(pl.id))
  const organiser = players.find((pl: any) => pl.id === p.player_id)
  const filledSlots = [organiser, ...interestedPlayers].filter(Boolean)
  const emptySlots  = Math.max(0, 4 - filledSlots.length)
  return (
    <div style={{ ...card, borderLeft:`3px solid ${c}`, borderRadius:'0 14px 14px 0', paddingLeft:11, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <Avatar initials={p.player_avatar} size={36} level={p.level} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' as const }}>
            <span style={{ fontWeight:500, fontSize:13, color:C.dark }}>{p.player_name}</span>
            <LevelBadge level={p.level} small />
            {isOwner && <span style={{ fontSize:9, fontWeight:500, color:C.dark, background:'rgba(26,58,42,0.1)', borderRadius:5, padding:'1px 5px', letterSpacing:'0.06em' }}>YOUR GAME</span>}
          </div>
          <div style={{ fontSize:10, color:'rgba(26,58,42,0.45)', marginTop:2, fontWeight:300 }}>{formatSlotDisplay(p.slot)}</div>
        </div>
        {isOwner && (
          <div style={{ display:'flex', gap:5 }}>
            <button onClick={() => onEdit(p)} style={{ background:'rgba(45,58,138,0.08)', border:'1px solid rgba(45,58,138,0.2)', borderRadius:7, padding:'3px 8px', color:'#2d3a8a', fontSize:10, fontWeight:500, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Edit</button>
            <button onClick={() => onDelete(p.id)} style={{ background:'rgba(139,32,32,0.08)', border:'1px solid rgba(139,32,32,0.2)', borderRadius:7, padding:'3px 8px', color:'#8b2020', fontSize:10, fontWeight:500, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Delete</button>
          </div>
        )}
      </div>
      {p.note && <div style={{ fontSize:12, color:'rgba(26,58,42,0.55)', fontStyle:'italic', fontWeight:300 }}>"{p.note}"</div>}
      <div>
        <div style={{ ...sec, marginBottom:6 }}>Players ({filledSlots.length}/4)</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          {filledSlots.map((pl: any, i: number) => pl && (
            <div key={pl.id} onClick={() => { sessionStorage.setItem('arenaTab','leaderboard'); sessionStorage.setItem('viewPlayer', pl.id); router.push('/ratings') }}
              style={{ background:i===0?`${levelColor[pl.level]}14`:'rgba(26,92,53,0.06)', border:`1px solid ${i===0?levelColor[pl.level]+'30':'rgba(26,92,53,0.15)'}`, borderRadius:9, padding:'7px 9px', display:'flex', alignItems:'center', gap:7, cursor:'pointer' }}>
              <Avatar initials={pl.avatar} size={22} level={pl.level} />
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:500, color:C.dark, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pl.name}</div>
                <div style={{ fontSize:9, color:i===0?levelColor[pl.level]:C.win, fontWeight:500 }}>{i===0?'Organiser':'Joined'}</div>
              </div>
            </div>
          ))}
          {Array.from({length:emptySlots}).map((_,i) => (
            <div key={`open-${i}`} style={{ background:'rgba(0,0,0,0.02)', border:'1px dashed rgba(26,58,42,0.15)', borderRadius:9, padding:'7px 9px', display:'flex', alignItems:'center', justifyContent:'center', minHeight:40 }}>
              <span style={{ fontSize:11, color:'rgba(26,58,42,0.3)' }}>○ Open</span>
            </div>
          ))}
        </div>
      </div>
      {filledSlots.length === 4 && (
        <button onClick={() => onLogScore(p)} style={{ background:C.dark, border:'none', borderRadius:9, padding:'10px', cursor:'pointer', color:C.gold, fontWeight:500, fontSize:13, fontFamily:'inherit', width:'100%', letterSpacing:'0.04em' }}>
          Log Match Score →
        </button>
      )}
      {!isOwner && (
        <button onClick={() => onCancelSpot(p.id)} style={{ background:'rgba(139,32,32,0.06)', border:'1px solid rgba(139,32,32,0.22)', borderRadius:9, padding:'8px', cursor:'pointer', color:'#8b2020', fontWeight:500, fontSize:12, fontFamily:'inherit', width:'100%', letterSpacing:'0.04em' }}>
          Cancel my spot
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()

  const [currentUser,   setCurrentUser]   = useState<Profile|null>(null)
  const [players,       setPlayers]       = useState<Profile[]>([])
  const [posts,         setPosts]         = useState<(Post & { interested_ids: string[] })[]>([])
  const [view,          setView]          = useState<'home'|'board'|'arena'|'profile'>('home')
  const [profileTab,    setProfileTab]    = useState<'edit'|'schedule'|'results'|'buddies'>('edit')
  const [ratingHistory, setRatingHistory] = useState<Match[]>([])
  const [editName,      setEditName]      = useState('')
  const [editLevel,     setEditLevel]     = useState('')
  const [editSlots,     setEditSlots]     = useState<string[]>([])
  const [editLoading,   setEditLoading]   = useState(false)
  const [boardLevel,    setBoardLevel]    = useState('All')
  const [selected,      setSelected]      = useState<Profile|null>(null)
  const [filter,        setFilter]        = useState({ level:'All', slot:'All' })
  const [fLevels,       setFLevels]       = useState<string[]>([])
  const [showForm,      setShowForm]      = useState(false)
  const [showLevelGuide,setShowLevelGuide]= useState(false)
  const [notif,         setNotif]         = useState<string|null>(null)
  const [loading,       setLoading]       = useState(true)
  const [liveRating,    setLiveRating]    = useState<number|null>(null)
  const [buddies,       setBuddies]       = useState<Profile[]>([])
  const [allProfiles,   setAllProfiles]   = useState<Profile[]>([])
  const [buddyFilterLevel, setBuddyFilterLevel] = useState<string>('')
  const [buddyFilterAvailability, setBuddyFilterAvailability] = useState<string>('')

  const [fDay,          setFDay]          = useState('')
  const [fTime,         setFTime]         = useState('')
  const [fDuration,     setFDuration]     = useState('')
  const [fSpots,        setFSpots]        = useState(3)
  const [fNote,         setFNote]         = useState('')
  const [editingPost,   setEditingPost]   = useState<number|null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number|null>(null)
  const [addingMember,  setAddingMember]  = useState<number|null>(null)
  const [fInvited,      setFInvited]      = useState<string[]>([])
  const [fPlayerSearch, setFPlayerSearch] = useState('')
  const [showPlayerSearch, setShowPlayerSearch] = useState(false)

  function showNotif(msg: string) { setNotif(msg); setTimeout(() => setNotif(null), 2800) }

  const loadData = useCallback(async (userId: string) => {
    try {
      const profileRes = await supabase.from('profiles').select('*, is_admin').eq('id', userId).single()
      if (profileRes.error) {
        if (profileRes.error.code === 'PGRST116') router.push('/onboarding')
        else { console.error('Profile fetch error:', profileRes.error); setLoading(false) }
        return
      }
      setCurrentUser(profileRes.data)
      const [playersRes, postsRes, matchesRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('posts').select('*, post_interests(player_id)').order('created_at', { ascending:false }),
        supabase.from('matches').select('*').or(`team_a1_id.eq.${userId},team_a2_id.eq.${userId},team_b1_id.eq.${userId},team_b2_id.eq.${userId}`).order('created_at', { ascending:true }),
      ])
      setPlayers(playersRes.data || [])
      const enrichedPosts = (postsRes.data || []).map((p: any) => ({ ...p, interested_ids:(p.post_interests||[]).map((i:any)=>i.player_id) }))
      setPosts(enrichedPosts)
      setRatingHistory(matchesRes.data || [])
      const ratingRes = await supabase.from('ratings').select('rating').eq('player_id', userId).single()
      if (ratingRes.data) {
        const rating = ratingRes.data.rating
        setLiveRating(rating)
        const derivedLevel = ratingToLevel(rating).level
        if (profileRes.data && profileRes.data.level !== derivedLevel) {
          await supabase.from('profiles').update({ level: derivedLevel }).eq('id', userId)
          profileRes.data.level = derivedLevel
        }
      }
      const allProfilesRes = await supabase.from('profiles').select('*').order('name')
      if (allProfilesRes.data) setAllProfiles(allProfilesRes.data)
      const buddiesRes = await supabase.from('buddies').select('buddy_id').eq('user_id', userId)
      if (buddiesRes.data && allProfilesRes.data) {
        const buddyIds = new Set(buddiesRes.data.map(b => b.buddy_id))
        setBuddies(allProfilesRes.data.filter(p => buddyIds.has(p.id)))
      }
      setLoading(false)
    } catch (err) { console.error('loadData error:', err); setLoading(false) }
  }, [router])

  useLayoutEffect(() => {
    const mainView = sessionStorage.getItem('mainView')
    if (mainView === 'board') { setView('board'); sessionStorage.removeItem('mainView') }
    else if (mainView === 'matches') { setView('profile'); setProfileTab('schedule'); sessionStorage.removeItem('mainView') }
    else if (mainView === 'profile') { setView('profile'); sessionStorage.removeItem('mainView') }
  }, [])

  useEffect(() => {
    let sessionChecked = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      sessionChecked = true
      if (session?.user) loadData(session.user.id)
      else if (event === 'SIGNED_OUT') router.push('/login')
      else if (event === 'INITIAL_SESSION' && !session) router.push('/login')
    })
    const fallback = setTimeout(() => {
      if (!sessionChecked) supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) loadData(session.user.id)
        else router.push('/login')
      })
    }, 3000)
    return () => { subscription.unsubscribe(); clearTimeout(fallback) }
  }, [loadData, router])

  const refreshSpecificData = useCallback(async (table: string) => {
    if (!currentUser?.id) return
    try {
      if (table === 'posts' || table === 'post_interests') {
        const postsRes = await supabase.from('posts').select('*, post_interests(player_id)').order('created_at', { ascending:false })
        if (postsRes.data) setPosts(postsRes.data.map((p:any) => ({ ...p, interested_ids:(p.post_interests||[]).map((i:any)=>i.player_id) })))
      }
      if (table === 'matches' || table === 'ratings') {
        const [matchesRes, ratingRes] = await Promise.all([
          supabase.from('matches').select('*').or(`team_a1_id.eq.${currentUser.id},team_a2_id.eq.${currentUser.id},team_b1_id.eq.${currentUser.id},team_b2_id.eq.${currentUser.id}`).order('created_at', { ascending:true }),
          supabase.from('ratings').select('rating').eq('player_id', currentUser.id).single()
        ])
        if (matchesRes.data) setRatingHistory(matchesRes.data)
        if (ratingRes.data) setLiveRating(ratingRes.data.rating)
      }
      if (table === 'profiles') {
        const profilesRes = await supabase.from('profiles').select('*').order('created_at')
        if (profilesRes.data) setPlayers(profilesRes.data)
      }
      if (table === 'buddies') {
        const buddiesRes = await supabase.from('buddies').select('buddy_id').eq('user_id', currentUser.id)
        if (buddiesRes.data) {
          const buddyIds = new Set(buddiesRes.data.map(b => b.buddy_id))
          setBuddies(allProfiles.filter(p => buddyIds.has(p.id)))
        }
      }
    } catch (err) { console.error('Error refreshing data:', err) }
  }, [currentUser?.id, allProfiles])

  useEffect(() => {
    const channel = supabase.channel('app-updates')
      .on('postgres_changes', { event:'*', schema:'public', table:'posts' }, (p:any) => refreshSpecificData(p.table))
      .on('postgres_changes', { event:'*', schema:'public', table:'post_interests' }, (p:any) => refreshSpecificData(p.table))
      .on('postgres_changes', { event:'*', schema:'public', table:'profiles' }, (p:any) => refreshSpecificData(p.table))
      .on('postgres_changes', { event:'*', schema:'public', table:'matches' }, (p:any) => refreshSpecificData(p.table))
      .on('postgres_changes', { event:'*', schema:'public', table:'buddies' }, (p:any) => refreshSpecificData(p.table))
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [refreshSpecificData])

  const addBuddy = async (buddyId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { showNotif('Not logged in'); return }
    const { error } = await supabase.from('buddies').insert([{ user_id: session.user.id, buddy_id: buddyId }])
    if (error) { showNotif(`Error adding buddy: ${error.message}`); return }
    const buddy = allProfiles.find(p => p.id === buddyId)
    if (buddy) setBuddies([...buddies, buddy])
    showNotif('Buddy added!')
  }
  const removeBuddy = async (buddyId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('buddies').delete().eq('user_id', session.user.id).eq('buddy_id', buddyId)
    if (error) { showNotif('Error removing buddy'); return }
    setBuddies(buddies.filter(b => b.id !== buddyId))
    showNotif('Buddy removed')
  }
  const getFilteredBuddies = () => buddies.filter(b => (!buddyFilterLevel || b.level === buddyFilterLevel) && (!buddyFilterAvailability || b.availability.includes(buddyFilterAvailability)))
  const getAvailableToAdd  = () => { const ids = new Set(buddies.map(b => b.id)); return allProfiles.filter(p => p.id !== currentUser?.id && !ids.has(p.id)) }

  async function handlePostSubmit() {
    if (!currentUser || !fDay || !fTime || !fDuration) { showNotif('Pick a day, time and duration'); return }
    if (fLevels.length === 0) { showNotif('Select at least one level'); return }
    const fSlot = `${fDay} ${fTime} · ${fDuration}`
    if (editingPost) {
      const { error } = await supabase.from('posts').update({ level:fLevels[0], allowed_levels:fLevels, slot:fSlot, spots_needed:fSpots, note:fNote.trim() }).eq('id', editingPost)
      if (error) { showNotif('Error updating: ' + error.message); return }
      const { data: freshPosts } = await supabase.from('posts').select('*, post_interests(player_id)').order('created_at', { ascending:false })
      if (freshPosts) setPosts(freshPosts.map((p:any) => ({ ...p, interested_ids:(p.post_interests||[]).map((i:any)=>i.player_id) })))
      showNotif('Game updated!'); setEditingPost(null)
    } else {
      const { error } = await supabase.from('posts').insert({ player_id:currentUser.id, player_name:currentUser.name, player_avatar:currentUser.avatar, level:fLevels[0], allowed_levels:fLevels, slot:fSlot, spots_needed:fSpots, note:fNote.trim() })
      if (error) { showNotif('Error posting: ' + error.message); return }
      if (fInvited.length > 0) {
        await new Promise(r => setTimeout(r, 600))
        const { data: newPost } = await supabase.from('posts').select('id').eq('player_id', currentUser.id).order('created_at', { ascending:false }).limit(1).single()
        if (newPost?.id) await Promise.all(fInvited.map(pid => supabase.from('post_interests').insert({ post_id:newPost.id, player_id:pid })))
      }
      showNotif('Game posted!')
    }
    setShowForm(false); setFDay(''); setFTime(''); setFDuration(''); setFSpots(3); setFNote(''); setFLevels([]); setFInvited([]); setFPlayerSearch(''); setShowPlayerSearch(false)
    supabase.auth.getSession().then(({ data:{ session } }) => { if (session?.user) loadData(session.user.id) })
  }

  async function handleAddMember(postId: number, playerId: string) {
    const already = posts.find(p => p.id === postId)?.interested_ids.includes(playerId)
    if (already) { showNotif('Player already in this game'); return }
    await supabase.from('post_interests').insert({ post_id:postId, player_id:playerId })
    setAddingMember(null); showNotif('Player added!')
    supabase.auth.getSession().then(({ data:{ session } }) => { if (session?.user) loadData(session.user.id) })
  }

  async function handleInterest(postId: number) {
    if (!currentUser) { showNotif('Please sign in to join a game'); return }
    const post = posts.find(p => p.id === postId)
    if (!post) return
    const allowedLevels = post.allowed_levels || [post.level]
    const myCurrentLevel = liveRating ? ratingToLevel(liveRating).level : currentUser.level
    if (!allowedLevels.includes(myCurrentLevel) && !post.interested_ids.includes(currentUser.id)) {
      showNotif('This game is restricted to ' + allowedLevels.map((l:string) => `L${l}`).join(', ')); return
    }
    const already = post.interested_ids.includes(currentUser.id)
    if (already) {
      const { error } = await supabase.from('post_interests').delete().eq('post_id', postId).eq('player_id', currentUser.id)
      if (error) { showNotif('Error removing interest'); return }
      showNotif('Spot removed')
    } else {
      if (post.interested_ids.length >= post.spots_needed) { showNotif('This game is already full'); return }
      const { error } = await supabase.from('post_interests').insert({ post_id:postId, player_id:currentUser.id })
      if (error) { showNotif('Error joining game'); return }
      showNotif('You joined the game!')
    }
    supabase.auth.getSession().then(({ data:{ session } }) => { if (session?.user) loadData(session.user.id) })
  }

  async function handleDeletePost(postId: number) { setDeleteConfirm(postId) }
  async function confirmDeletePost(postId: number) {
    await supabase.from('posts').delete().eq('id', postId)
    setDeleteConfirm(null); showNotif('Post removed')
    supabase.auth.getSession().then(({ data:{ session } }) => { if (session?.user) loadData(session.user.id) })
  }
  function handleSignOut() { supabase.auth.signOut().then(() => router.push('/login')) }

  function openEditPost(p: any) {
    const slot = p.slot; const dotIdx = slot.indexOf(' · ')
    const timePart = dotIdx > -1 ? slot.slice(0, dotIdx) : slot
    const durPart  = dotIdx > -1 ? slot.slice(dotIdx + 3) : ''
    const parts = timePart.split(' ')
    setFDay(parts[0]||''); setFTime(parts.slice(1).join(' ')||'')
    setFDuration(durPart||''); setFSpots(p.spots_needed)
    setFNote(p.note||''); setFLevels(p.allowed_levels||[p.level])
    setEditingPost(p.id); setShowForm(true); setView('board')
  }

  function handleLogScore(p: any) {
    const gamePlayers = [p.player_id, ...p.interested_ids]
    sessionStorage.setItem('arenaTab', 'log')
    sessionStorage.setItem('prefillGame', JSON.stringify({ postId:p.id, playerIds:gamePlayers }))
    router.push('/ratings')
  }

  const boardPosts  = boardLevel === 'All' ? posts : posts.filter(p => (p.allowed_levels||[p.level]).includes(boardLevel))
  const openPosts   = posts.filter(p => p.interested_ids.length < p.spots_needed)
  const openByLevel = Object.fromEntries(levels.map(l => [l, posts.filter(p => (p.allowed_levels||[p.level]).includes(l) && p.interested_ids.length < p.spots_needed).length]))

  const ratingTimeline = currentUser ? ratingHistory.map(m => {
    const onA = [m.team_a1_id, m.team_a2_id].includes(currentUser.id)
    const before = m.team_a1_id===currentUser.id?m.rating_a1_before:m.team_a2_id===currentUser.id?m.rating_a2_before:m.team_b1_id===currentUser.id?m.rating_b1_before:m.rating_b2_before
    const after  = m.team_a1_id===currentUser.id?m.rating_a1_after :m.team_a2_id===currentUser.id?m.rating_a2_after :m.team_b1_id===currentUser.id?m.rating_b1_after :m.rating_b2_after
    const aSum = m.sets_a.reduce((a:number,b:number)=>a+b,0), bSum = m.sets_b.reduce((a:number,b:number)=>a+b,0)
    const won = onA ? aSum > bSum : bSum > aSum
    return { id:m.id, date:m.created_at, rating:after, before, won }
  }) : []
  const ratingMin   = ratingTimeline.length ? Math.min(...ratingTimeline.map(p=>p.rating),1) : 1
  const ratingMax   = ratingTimeline.length ? Math.max(...ratingTimeline.map(p=>p.rating),7) : 7
  const ratingTrend = ratingTimeline.length ? ratingTimeline[ratingTimeline.length-1].rating - ratingTimeline[0].rating : 0

  if (loading) return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, fontFamily:"'Jost',sans-serif" }}>
      <div style={{ color:C.dark, fontSize:14, fontWeight:400, letterSpacing:'0.04em' }}>Loading Court Connections…</div>
      <button onClick={() => { window.location.href = '/login' }} style={{ background:'transparent', border:'1px solid rgba(26,58,42,0.2)', borderRadius:10, padding:'8px 20px', color:'rgba(26,58,42,0.5)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
        Not loading? Click here
      </button>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:C.bg, fontFamily:"'Jost',sans-serif", color:'#000', overflowX:'hidden' }}>
      <Notif msg={notif} />
      <div style={{ maxWidth:480, margin:'0 auto', padding:'0 16px 90px' }}>

        {/* ══ HOME ══ */}
        {view === 'home' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* UPDATED greeting — Playfair italic for name, muted gold rating badge */}
            <div style={{ padding:'26px 0 4px', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:11, color:'rgba(26,58,42,0.45)', marginBottom:4, letterSpacing:'0.12em', textTransform:'uppercase', fontWeight:300 }}>Welcome back,</div>
                <div style={{ fontFamily:"'Playfair Display', serif", fontSize:24, fontWeight:400, color:C.dark, letterSpacing:-0.3, fontStyle:'italic' }}>{currentUser?.name}</div>
              </div>
              {liveRating && (
                <div style={{ background:C.dark, color:C.gold, fontSize:16, fontWeight:400, padding:'6px 14px', borderRadius:14, fontFamily:"'Playfair Display', serif", letterSpacing:0.5 }}>
                  {liveRating.toFixed(1)}
                </div>
              )}
            </div>

            {/* Intro card */}
            <div style={{ background:C.dark, borderRadius:14, padding:'14px 16px', borderLeft:`3px solid ${C.gold}` }}>
              <div style={{ fontFamily:"'Playfair Display', serif", fontSize:14, fontWeight:400, color:C.gold, marginBottom:6 }}>Court Connections</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', lineHeight:1.65, fontWeight:300 }}>
                Your club's home for organised padel — post games, track your live ELO rating, and compete in club leagues.
              </div>
            </div>

            {/* Feature grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { icon:'⊞', title:'Game Board',  sub:'Post & join open games',     action: () => setView('board') },
                { icon:'⚔️', title:'The Arena',   sub:'Live ratings & leaderboard', action: () => setView('arena') },
                { icon:'🏆', title:'League',      sub:'Compete in club seasons',    action: () => router.push('/league') },
                { icon:'📅', title:'My Schedule', sub:'Your upcoming games',        action: () => { setView('profile'); setProfileTab('schedule') } },
              ].map(({ icon, title, sub, action }) => (
                <button key={title} onClick={action} style={{ ...card, textAlign:'left' as const, border:'1px solid rgba(26,58,42,0.1)', cursor:'pointer', fontFamily:'inherit', padding:'14px 12px' }}>
                  <div style={{ fontSize:20, marginBottom:8 }}>{icon}</div>
                  <div style={{ fontSize:11, fontWeight:500, color:C.dark, marginBottom:3, letterSpacing:'0.02em' }}>{title}</div>
                  <div style={{ fontSize:9, color:'rgba(26,58,42,0.45)', lineHeight:1.5, fontWeight:300 }}>{sub}</div>
                </button>
              ))}
            </div>

            {/* Open games header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:16, height:1, background:C.gold }} />
                <div style={sec}>Open Games</div>
              </div>
              <button onClick={() => setView('board')} style={{ background:'none', border:'none', color:C.gold, fontSize:10, fontWeight:400, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.08em', borderBottom:`1px solid rgba(184,150,62,0.35)`, paddingBottom:1 }}>See all</button>
            </div>

            {openPosts.length === 0 ? (
              <div style={{ ...card2, textAlign:'center' as const, padding:'24px', color:'rgba(26,58,42,0.4)', fontSize:13, fontWeight:300 }}>
                No open games right now — be the first to post!
              </div>
            ) : openPosts.slice(0, 2).map(p => {
              const spotsLeft = Math.max(0, p.spots_needed - p.interested_ids.length)
              return (
                <div key={p.id} onClick={() => setView('board')} style={{ ...card, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                  <Avatar initials={p.player_avatar} size={36} level={p.level} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:500, fontSize:13, color:C.dark }}>{p.player_name}</div>
                    <div style={{ fontSize:11, color:'rgba(26,58,42,0.5)', marginTop:1, fontWeight:300 }}>{formatSlotDisplay(p.slot)}</div>
                  </div>
                  <div style={{ flexShrink:0, textAlign:'right' as const }}>
                    <LevelBadge level={p.level} small />
                    <div style={{ fontSize:10, color:C.win, fontWeight:500, marginTop:4 }}>{spotsLeft} spot{spotsLeft!==1?'s':''} open</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══ BOARD ══ */}
        {view === 'board' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <PageHeader title="Game Board" right={
              !showForm ? (
                <button onClick={() => {
                  setFDay(''); setFTime(''); setFDuration(''); setFSpots(3); setFNote(''); setFInvited([]); setFPlayerSearch(''); setShowPlayerSearch(false); setEditingPost(null)
                  if (currentUser) setFLevels([liveRating ? ratingToLevel(liveRating).level : currentUser.level])
                  setShowForm(true)
                }} style={{ background:C.dark, border:'none', borderRadius:10, padding:'8px 14px', color:C.gold, fontWeight:500, fontSize:12, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.06em' }}>+ Post</button>
              ) : undefined
            } />

            {/* Post form */}
            {showForm && currentUser && (
              <div style={{ ...card, display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ fontFamily:"'Playfair Display', serif", fontWeight:400, fontSize:16, color:C.dark }}>{editingPost ? 'Edit Game' : 'Post a Game Request'}</div>
                {(()=>{ const auto = Math.max(1, 3 - fInvited.length); if (fSpots !== auto && !editingPost) setTimeout(()=>setFSpots(auto),0); return null })()}
                <div>
                  <div style={{ fontSize:10, color:'rgba(26,58,42,0.45)', fontWeight:500, marginBottom:7, textTransform:'uppercase' as const, letterSpacing:'0.1em' }}>When?</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <select value={fDay} onChange={e => setFDay(e.target.value)} style={{ background:'#fff', border:'1px solid rgba(26,58,42,0.15)', borderRadius:9, padding:'10px 12px', color:fDay?C.dark:'#aaa', fontSize:13, fontFamily:'inherit', outline:'none', cursor:'pointer', width:'100%' }}>
                      <option value="" disabled>Day</option>
                      {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select value={fTime} onChange={e => setFTime(e.target.value)} style={{ background:'#fff', border:'1px solid rgba(26,58,42,0.15)', borderRadius:9, padding:'10px 12px', color:fTime?C.dark:'#aaa', fontSize:13, fontFamily:'inherit', outline:'none', cursor:'pointer', width:'100%' }}>
                      <option value="" disabled>Time</option>
                      {Array.from({ length:31 }, (_,i) => { const t=7*60+i*30,h24=Math.floor(t/60),m=t%60,h12=h24%12===0?12:h24%12,ap=h24<12?'am':'pm'; const l=`${h12}:${m.toString().padStart(2,'0')} ${ap}`; return <option key={l} value={l}>{l}</option> })}
                    </select>
                  </div>
                  {fDay && fTime && <div style={{ marginTop:7, fontSize:12, color:C.mid, fontWeight:400 }}>📅 {fDay} at {fTime}</div>}
                </div>
                <div>
                  <div style={{ fontSize:10, color:'rgba(26,58,42,0.45)', fontWeight:500, marginBottom:7, textTransform:'uppercase' as const, letterSpacing:'0.1em' }}>Duration</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {['60 min','90 min'].map(d => (
                      <button key={d} onClick={() => setFDuration(d)} style={{ border:`1px solid ${fDuration===d?C.gold:'rgba(26,58,42,0.15)'}`, background:fDuration===d?C.dark:'rgba(0,0,0,0.02)', color:fDuration===d?C.gold:'rgba(26,58,42,0.5)', borderRadius:9, padding:'11px 0', fontSize:13, fontWeight:fDuration===d?500:400, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.02em' }}>{d}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'rgba(26,58,42,0.45)', fontWeight:500, marginBottom:7, textTransform:'uppercase' as const, letterSpacing:'0.1em' }}>Open to levels</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                    {levels.map(l => (
                      <button key={l} onClick={() => setFLevels(prev => prev.includes(l) ? prev.filter(x=>x!==l) : [...prev,l])} style={{ border:`1px solid ${fLevels.includes(l)?levelColor[l]+'80':'rgba(26,58,42,0.15)'}`, background:fLevels.includes(l)?levelBg[l]:'rgba(0,0,0,0.02)', color:fLevels.includes(l)?levelColor[l]:'rgba(26,58,42,0.45)', borderRadius:9, padding:'10px 0', fontWeight:fLevels.includes(l)?500:400, cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                        <span style={{ fontSize:14, fontWeight:500 }}>L{l}</span>
                        <span style={{ fontSize:10, opacity:0.8 }}>{levelDesc[l]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'rgba(26,58,42,0.45)', fontWeight:500, marginBottom:7, textTransform:'uppercase' as const, letterSpacing:'0.1em' }}>Add players (optional)</div>
                  {fInvited.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap' as const, gap:6, marginBottom:8 }}>
                      {fInvited.map(pid => { const p = players.find((x:any)=>x.id===pid); if (!p) return null; return (
                        <div key={pid} style={{ display:'flex', alignItems:'center', gap:5, background:levelBg[p.level], border:`1px solid ${levelColor[p.level]}40`, borderRadius:20, padding:'4px 10px 4px 6px' }}>
                          <Avatar initials={p.avatar} size={20} level={p.level} />
                          <span style={{ fontSize:12, fontWeight:500, color:levelColor[p.level] }}>{p.name}</span>
                          <button onClick={() => setFInvited(prev=>prev.filter(x=>x!==pid))} style={{ background:'none', border:'none', color:'rgba(26,58,42,0.4)', fontSize:13, cursor:'pointer', padding:'0 0 0 2px', lineHeight:1, fontFamily:'inherit' }}>✕</button>
                        </div>
                      )})}
                    </div>
                  )}
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'#aaa', pointerEvents:'none' }}>🔍</span>
                    <input type="text" placeholder="Search members…" value={fPlayerSearch}
                      onChange={e=>{setFPlayerSearch(e.target.value);setShowPlayerSearch(true)}}
                      onFocus={()=>setShowPlayerSearch(true)}
                      style={{ width:'100%', background:'#fff', border:`1px solid ${showPlayerSearch?'rgba(45,92,66,0.3)':'rgba(26,58,42,0.15)'}`, borderRadius:9, padding:'10px 14px 10px 36px', color:C.dark, fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' as const }} />
                  </div>
                  {showPlayerSearch && (() => {
                    const results = players.filter((p:any)=>p.id!==currentUser.id&&!fInvited.includes(p.id)&&p.name.toLowerCase().includes(fPlayerSearch.toLowerCase()))
                    return (
                      <div style={{ background:'#fff', border:'1px solid rgba(26,58,42,0.15)', borderRadius:9, marginTop:6, overflow:'hidden', maxHeight:200, overflowY:'auto' }}>
                        {results.length===0 ? <div style={{ padding:'14px', fontSize:12, color:'rgba(26,58,42,0.4)', textAlign:'center' as const, fontWeight:300 }}>No members found</div>
                          : results.map((p:any,idx:number)=>(
                            <button key={p.id} onClick={()=>{setFInvited(prev=>[...prev,p.id]);setFPlayerSearch('');setShowPlayerSearch(false)}}
                              style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'transparent', border:'none', borderBottom:idx<results.length-1?'1px solid rgba(26,58,42,0.07)':'none', cursor:'pointer', fontFamily:'inherit', textAlign:'left' as const }}>
                              <Avatar initials={p.avatar} size={28} level={p.level} />
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:500, color:C.dark }}>{p.name}</div>
                                <div style={{ fontSize:10, color:'rgba(26,58,42,0.4)', fontWeight:300 }}>L{p.level} · {levelDesc[p.level]}</div>
                              </div>
                              <span style={{ fontSize:11, fontWeight:500, color:C.gold, letterSpacing:'0.04em' }}>+ Add</span>
                            </button>
                          ))}
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <div style={{ fontSize:10, color:'rgba(26,58,42,0.45)', fontWeight:500, marginBottom:7, textTransform:'uppercase' as const, letterSpacing:'0.1em' }}>Players needed</div>
                  <div style={{ flex:1, border:`1px solid ${C.gold}50`, background:C.dark, color:C.gold, borderRadius:8, padding:'9px 0', fontSize:18, fontWeight:400, textAlign:'center' as const, fontFamily:"'Playfair Display', serif" }}>{fSpots}</div>
                </div>
                <textarea value={fNote} onChange={e=>setFNote(e.target.value)} placeholder="Optional message…" maxLength={120}
                  style={{ width:'100%', boxSizing:'border-box' as const, resize:'none' as const, background:'rgba(26,58,42,0.03)', border:'1px solid rgba(26,58,42,0.12)', borderRadius:9, padding:'10px 12px', color:'rgba(26,58,42,0.5)', fontSize:13, fontFamily:'inherit', outline:'none', height:60, fontWeight:300 }} />
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>{setShowForm(false);setEditingPost(null)}} style={{ flex:1, background:'transparent', border:'1px solid rgba(26,58,42,0.18)', borderRadius:9, padding:'10px 0', color:'rgba(26,58,42,0.5)', fontWeight:400, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Cancel</button>
                  <button onClick={handlePostSubmit} style={{ flex:2, background:C.dark, border:'none', borderRadius:9, padding:'10px 0', color:C.gold, fontWeight:500, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.06em' }}>{editingPost?'Save Changes →':'Post →'}</button>
                </div>
              </div>
            )}

            {/* Level filter pills */}
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
              <button onClick={()=>setBoardLevel('All')} style={pill(boardLevel==='All')}>
                All {openPosts.length>0?`(${openPosts.length})`:''}
              </button>
              {levels.map(l => (
                <button key={l} onClick={()=>setBoardLevel(l)} style={pill(boardLevel===l)}>
                  L{l} · {levelDesc[l]}{openByLevel[l]>0?` (${openByLevel[l]})`:''}
                </button>
              ))}
            </div>

            {/* Board posts */}
            {boardPosts.length === 0 ? (
              <div style={{ textAlign:'center' as const, padding:'40px 0' }}>
                <div style={{ fontSize:28, marginBottom:10, opacity:0.3 }}>📋</div>
                <div style={{ fontFamily:"'Playfair Display', serif", color:C.dark, fontWeight:400, marginTop:10, fontSize:16 }}>{boardLevel==='All'?'No games posted yet':`No posts for L${boardLevel} yet`}</div>
                <div style={{ fontSize:12, color:'rgba(26,58,42,0.4)', marginTop:5, fontWeight:300 }}>Be the first to post a game!</div>
              </div>
            ) : boardPosts.map(post => {
              const isOwner      = currentUser?.id === post.player_id
              const alreadyIn    = !!(currentUser && post.interested_ids.includes(currentUser.id))
              const spotsLeft    = Math.max(0, post.spots_needed - post.interested_ids.length)
              const full         = spotsLeft <= 0
              const allowedLevels = post.allowed_levels || [post.level]
              const myLevel       = liveRating ? ratingToLevel(liveRating).level : currentUser?.level
              const levelAllowed  = !!(currentUser && allowedLevels.includes(myLevel!))
              const canJoin       = !!(currentUser && !isOwner && !alreadyIn && !full)
              const c             = levelColor[post.level]
              return (
                <div key={post.id} style={{ ...card, borderLeft:`3px solid ${c}`, borderRadius:'0 14px 14px 0', paddingLeft:11, display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                    <Avatar initials={post.player_avatar} size={36} level={post.level} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' as const }}>
                        <span style={{ fontWeight:500, fontSize:14, color:C.dark }}>{post.player_name}</span>
                        <LevelBadge level={post.level} small />
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3, flexWrap:'wrap' as const }}>
                        {(post.allowed_levels||[post.level]).map((l:string)=>(
                          <span key={l} style={{ background:levelBg[l], color:levelColor[l], borderRadius:6, padding:'1px 6px', fontSize:9, fontWeight:500, letterSpacing:'0.04em' }}>L{l}</span>
                        ))}
                        <span style={{ fontSize:10, color:'rgba(26,58,42,0.38)', fontWeight:300 }}>{timeAgo(post.created_at)}</span>
                      </div>
                    </div>
                    {isOwner && (
                      <div style={{ display:'flex', gap:5 }}>
                        <button onClick={()=>openEditPost(post)} style={{ background:'rgba(45,58,138,0.08)', border:'1px solid rgba(45,58,138,0.2)', borderRadius:7, padding:'3px 8px', color:'#2d3a8a', fontSize:10, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>Edit</button>
                        <button onClick={()=>handleDeletePost(post.id)} style={{ background:'rgba(139,32,32,0.08)', border:'1px solid rgba(139,32,32,0.2)', borderRadius:7, padding:'3px 8px', color:'#8b2020', fontSize:10, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>Delete</button>
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:7, flexWrap:'wrap' as const, alignItems:'center' }}>
                    <span style={{ background:'rgba(26,58,42,0.06)', color:C.dark, borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:400, border:'1px solid rgba(26,58,42,0.1)' }}>
                      📅 {formatSlotDisplay(post.slot)}
                    </span>
                  </div>
                  {post.note && <div style={{ fontSize:12, color:'rgba(26,58,42,0.55)', lineHeight:1.55, fontStyle:'italic', fontWeight:300 }}>"{post.note}"</div>}
                  {(()=>{
                    const totalSlots = post.spots_needed + 1
                    const interestedPlayers = players.filter(p => post.interested_ids.includes(p.id))
                    const organiser = players.find(p => p.id === post.player_id)
                    const filledSlots = [organiser, ...interestedPlayers].filter(Boolean)
                    const emptySlots = Math.max(0, totalSlots - filledSlots.length)
                    return (
                      <div>
                        <div style={{ ...sec, marginBottom:7 }}>Players ({filledSlots.length}/{totalSlots})</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                          {filledSlots.map((p:any,i:number) => p && (
                            <div key={p.id} style={{ background:i===0?`${levelColor[p.level]}14`:'rgba(26,92,53,0.06)', border:`1px solid ${i===0?levelColor[p.level]+'30':'rgba(26,92,53,0.15)'}`, borderRadius:9, padding:'8px 10px', display:'flex', alignItems:'center', gap:7 }}>
                              <Avatar initials={p.avatar} size={22} level={p.level} />
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:11, fontWeight:500, color:C.dark, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{p.name}</div>
                                <div style={{ fontSize:9, color:i===0?levelColor[p.level]:C.win, fontWeight:500 }}>{i===0?'Organiser':'Joined'}</div>
                              </div>
                            </div>
                          ))}
                          {Array.from({length:emptySlots}).map((_,i)=>(
                            <div key={`empty-${i}`} style={{ background:'rgba(0,0,0,0.02)', border:'1px dashed rgba(26,58,42,0.15)', borderRadius:9, padding:'8px 10px', display:'flex', alignItems:'center', justifyContent:'center', minHeight:44 }}>
                              <span style={{ fontSize:11, color:'rgba(26,58,42,0.28)', fontWeight:300 }}>○ Open</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                  {canJoin && levelAllowed && (
                    <button onClick={()=>handleInterest(post.id)} style={{ background:C.dark, border:'none', borderRadius:9, padding:'11px 0', cursor:'pointer', color:C.gold, fontWeight:500, fontSize:13, fontFamily:'inherit', width:'100%', letterSpacing:'0.06em' }}>
                      Join →
                    </button>
                  )}
                  {canJoin && !levelAllowed && (
                    <div style={{ background:'rgba(139,32,32,0.05)', border:'1px solid rgba(139,32,32,0.15)', borderRadius:9, padding:'10px', textAlign:'center' as const, fontSize:12, color:'#8b2020', fontWeight:400 }}>
                      This game is for {allowedLevels.map((l:string)=>`L${l}`).join(', ')} only
                    </div>
                  )}
                  {alreadyIn && !isOwner && (
                    <button onClick={()=>handleInterest(post.id)} style={{ background:'rgba(139,32,32,0.06)', border:'1px solid rgba(139,32,32,0.22)', borderRadius:9, padding:'9px 0', cursor:'pointer', color:'#8b2020', fontWeight:500, fontSize:13, fontFamily:'inherit', width:'100%', letterSpacing:'0.04em' }}>
                      Cancel my spot
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ══ ARENA ══ */}
        {view === 'arena' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <PageHeader title="The Arena" />

            <div style={{ display:'flex', gap:6 }}>
              <button style={pill(true)}>Leaderboard</button>
              <button onClick={()=>{sessionStorage.setItem('arenaTab','log');router.push('/ratings')}} style={pill(false)}>Log Match</button>
              <button onClick={()=>router.push('/league')} style={pill(false)}>League</button>
            </div>

            <div style={{ ...card, padding:'16px' }}>
              <div style={{ fontSize:13, color:'rgba(26,58,42,0.7)', lineHeight:1.75, fontWeight:300 }}>
                Every match counts — <span style={{ fontWeight:500, color:C.dark }}>yes, even that one you'd rather forget.</span>{' '}
                The Arena is your club's live rating system. Log your results, track your rating on the <span style={{ fontWeight:500, color:C.mid }}>1.0–7.0 scale</span>, and see exactly where you stand on the leaderboard.
              </div>
              <div style={{ fontSize:13, color:'rgba(26,58,42,0.7)', lineHeight:1.75, marginTop:10, fontWeight:300 }}>
                The more you play, the sharper your rating gets — which means better matchups, more competitive games, and <span style={{ fontWeight:500, color:C.dark }}>no more being destroyed by someone who "said they were a beginner".</span>
              </div>
              <div style={{ fontSize:13, color:'rgba(26,58,42,0.7)', lineHeight:1.75, marginTop:10, fontWeight:300 }}>
                Fair matches. Happy players. <span style={{ fontWeight:500, color:C.gold }}>Zero excuses.</span>
              </div>
            </div>

            <div style={{ ...card, padding:0, overflow:'hidden' }}>
              <button onClick={()=>setShowLevelGuide(v=>!v)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'transparent', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, fontWeight:400, color:C.dark }}>Understanding Your Rating</span>
                <span style={{ fontSize:11, color:'rgba(26,58,42,0.4)', transform:showLevelGuide?'rotate(180deg)':'rotate(0deg)', transition:'transform 0.2s', display:'inline-block' }}>▼</span>
              </button>
              {showLevelGuide && (
                <div style={{ padding:'0 14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ fontSize:12, color:'rgba(26,58,42,0.6)', lineHeight:1.6, paddingTop:2, fontWeight:300 }}>
                    Your rating moves up or down after every logged match based on the result and your opponents' strength. The more you play, the more accurate it becomes.
                  </div>
                  {[
                    { level:'1', name:'Elite',       range:'5.6 – 7.0', desc:'Master of the game. Consistently dominant, exceptional technical execution and game intelligence. Wall play is automatic and shot selection is deliberate.' },
                    { level:'2', name:'Competitive',  range:'4.1 – 5.5', desc:'A solid club player with real technical ability. Comfortable with the glass, can execute a bandeja and vibora under pressure, and moves well as a unit with a partner.' },
                    { level:'3', name:'Casual',       range:'2.6 – 4.0', desc:'Found your feet on the court and can hold a rally. Wall bounces no longer cause panic and you are developing your shot repertoire. Building consistency and starting to think tactically.' },
                    { level:'4', name:'Beginner',     range:'1.0 – 2.5', desc:'New to padel or still finding your footing. Learning the rules, getting comfortable with the walls, and figuring out court positioning. The only way is up.' },
                  ].map(l => (
                    <div key={l.level} style={{ background:levelBg[l.level], border:`1px solid ${levelColor[l.level]}25`, borderLeft:`3px solid ${levelColor[l.level]}`, borderRadius:10, padding:'13px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, fontWeight:400, color:levelColor[l.level] }}>L{l.level} {l.name}</span>
                        </div>
                        <span style={{ fontSize:11, color:levelColor[l.level], fontWeight:500, background:`${levelColor[l.level]}18`, borderRadius:8, padding:'2px 8px' }}>{l.range}</span>
                      </div>
                      <div style={{ fontSize:12, color:'rgba(26,58,42,0.65)', lineHeight:1.6, fontWeight:300 }}>{l.desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {([
                ['🏆','Leaderboard','See club rankings',  () => { sessionStorage.setItem('arenaTab','leaderboard'); router.push('/ratings') }],
                ['🎾','Log Match',  'Record results',      () => { sessionStorage.setItem('arenaTab','log'); router.push('/ratings') }],
                ['📈','My Results', 'Track your rating',  () => { sessionStorage.setItem('mainView','profile'); setView('profile'); setProfileTab('results') }],
              ] as const).map(([icon,title,desc,action])=>(
                <button key={title} onClick={action} style={{ ...card, textAlign:'center' as const, border:'1px solid rgba(26,58,42,0.1)', cursor:'pointer', fontFamily:'inherit', padding:'12px 8px' }}>
                  <div style={{ fontSize:20, marginBottom:6, opacity:0.75 }}>{icon}</div>
                  <div style={{ fontSize:10, fontWeight:500, color:C.dark, marginBottom:3, letterSpacing:'0.02em' }}>{title}</div>
                  <div style={{ fontSize:9, color:'rgba(26,58,42,0.45)', lineHeight:1.4, fontWeight:300 }}>{desc}</div>
                </button>
              ))}
            </div>

            <button onClick={()=>{sessionStorage.removeItem('arenaTab');router.push('/ratings')}} style={{ width:'100%', background:C.dark, border:'none', borderRadius:12, padding:'14px', color:C.gold, fontWeight:500, fontSize:15, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.06em' }}>
              Enter The Arena →
            </button>
          </div>
        )}

        {/* ══ PROFILE ══ */}
        {view === 'profile' && currentUser && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ padding:'22px 0 4px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <Avatar initials={currentUser.avatar} size={48} level={currentUser.level} />
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Playfair Display', serif", fontSize:18, fontWeight:400, color:C.dark, letterSpacing:-0.3 }}>{currentUser.name}</div>
                  <div style={{ fontSize:11, color:'rgba(26,58,42,0.45)', marginTop:3, fontWeight:300 }}>L{currentUser.level} · {levelDesc[currentUser.level]}</div>
                </div>
                <div style={{ background:C.dark, color:C.gold, fontSize:12, fontWeight:400, padding:'6px 13px', borderRadius:12, textAlign:'center' as const }}>
                  <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, lineHeight:1.1 }}>{liveRating?.toFixed(1) || '--'}</div>
                  {liveRating && <div style={{ fontSize:9, color:'rgba(184,150,62,0.65)', marginTop:2, letterSpacing:'0.06em' }}>L{ratingToLevel(liveRating).level} · {ratingToLevel(liveRating).desc}</div>}
                </div>
              </div>

              <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
                {[{key:'edit',label:'Edit Profile'},{key:'schedule',label:'My Schedule'},{key:'results',label:'My Results'}].map(({key,label})=>(
                  <button key={key} onClick={()=>setProfileTab(key as any)} style={pill(profileTab===key)}>{label}</button>
                ))}
                {currentUser.is_admin && (
                  <button onClick={()=>router.push('/admin')} style={{ ...pill(false), background:'rgba(139,32,32,0.1)', color:'#8b2020' }}>⚙️ Admin</button>
                )}
              </div>
            </div>

            {/* ─ Edit Profile ─ */}
            {profileTab === 'edit' && (
              <div style={card}>
                <div style={{ ...sec, marginBottom:16 }}>Edit Profile</div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, fontWeight:500, color:'rgba(26,58,42,0.5)', textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:7 }}>Name</div>
                  <input value={editName} onChange={e=>setEditName(e.target.value)}
                    style={{ width:'100%', boxSizing:'border-box' as const, background:'rgba(26,58,42,0.03)', border:'1px solid rgba(26,58,42,0.12)', borderRadius:9, padding:'11px 13px', color:C.dark, fontSize:14, fontFamily:'inherit', outline:'none', fontWeight:400 }} />
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, fontWeight:500, color:'rgba(26,58,42,0.5)', textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:7 }}>Skill Level</div>
                  <div style={{ background:'rgba(26,58,42,0.03)', border:'1px solid rgba(26,58,42,0.12)', borderRadius:9, padding:'11px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:13, color:'rgba(26,58,42,0.5)', fontWeight:300 }}>Assigned by assessment</span>
                    <LevelBadge level={currentUser.level} />
                  </div>
                  <div style={{ fontSize:11, color:'rgba(26,58,42,0.38)', marginTop:6, fontWeight:300 }}>To change your level, contact your club admin.</div>
                </div>
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:10, fontWeight:500, color:'rgba(26,58,42,0.5)', textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:10 }}>Availability</div>
                  <AvailabilityPicker value={editSlots} onChange={setEditSlots} />
                </div>
                <button disabled={editLoading||!editName.trim()||editSlots.length===0} onClick={async()=>{
                  if(!editName.trim()||editSlots.length===0) return
                  setEditLoading(true)
                  const initials = editName.trim().split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()
                  const newName = editName.trim()
                  const [profileRes] = await Promise.all([
                    supabase.from('profiles').update({ name:newName, avatar:initials, availability:editSlots }).eq('id',currentUser.id),
                    supabase.from('ratings').update({ player_name:newName, avatar:initials }).eq('player_id',currentUser.id),
                    supabase.from('posts').update({ player_name:newName, player_avatar:initials }).eq('player_id',currentUser.id),
                  ])
                  setEditLoading(false)
                  if(!profileRes.error) {
                    showNotif('Profile updated!')
                    supabase.auth.getSession().then(({data:{session}})=>{ if(session?.user) loadData(session.user.id) })
                    setView('home')
                  } else showNotif('Error saving — try again')
                }} style={{ width:'100%', background:editLoading?'rgba(26,58,42,0.08)':C.dark, border:'none', borderRadius:10, padding:'13px', color:C.gold, fontWeight:500, fontSize:14, cursor:editLoading?'default':'pointer', fontFamily:'inherit', opacity:editLoading?0.6:1, letterSpacing:'0.04em' }}>
                  {editLoading?'Saving…':'Save Changes'}
                </button>
                <button onClick={()=>supabase.auth.signOut().then(()=>router.push('/login'))} style={{ width:'100%', background:'transparent', border:'none', padding:'12px', color:'rgba(139,32,32,0.65)', fontWeight:400, fontSize:14, cursor:'pointer', fontFamily:'inherit', marginTop:4, textAlign:'center' as const, letterSpacing:'0.04em' }}>
                  Sign Out
                </button>
              </div>
            )}

            {/* ─ My Schedule ─ */}
            {profileTab === 'schedule' && (()=>{
              const myPosts = posts.filter(p => p.player_id === currentUser.id)
              const joinedPosts = posts.filter(p => p.player_id !== currentUser.id && p.interested_ids.some((id:string)=>id===currentUser.id))
              const schedulePosts = [...myPosts, ...joinedPosts]
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={sec}>{schedulePosts.length} active game{schedulePosts.length!==1?'s':''}</div>
                    <button onClick={()=>setView('board')} style={{ background:C.dark, border:'none', borderRadius:10, padding:'7px 14px', color:C.gold, fontWeight:500, fontSize:12, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>+ Post Game</button>
                  </div>
                  {schedulePosts.length === 0 ? (
                    <div style={{ ...card2, textAlign:'center' as const, padding:'32px 16px' }}>
                      <div style={{ fontSize:26, marginBottom:10, opacity:0.3 }}>📅</div>
                      <div style={{ fontFamily:"'Playfair Display', serif", fontSize:15, fontWeight:400, color:C.dark, marginBottom:6 }}>No games yet</div>
                      <div style={{ fontSize:12, color:'rgba(26,58,42,0.5)', marginBottom:14, fontWeight:300 }}>Post a game or join one from the board</div>
                      <button onClick={()=>setView('board')} style={{ background:C.dark, border:'none', borderRadius:10, padding:'10px 22px', color:C.gold, fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Browse the board →</button>
                    </div>
                  ) : schedulePosts.map(p => (
                    <ScheduleCard key={p.id} p={p} isOwner={p.player_id===currentUser.id} players={players} currentUser={currentUser} liveRating={liveRating}
                      onEdit={openEditPost} onDelete={handleDeletePost}
                      onCancelSpot={handleInterest} onLogScore={handleLogScore} router={router} />
                  ))}
                </div>
              )
            })()}

            {/* ─ My Results ─ */}
            {profileTab === 'results' && (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {ratingTimeline.length === 0 ? (
                  <div style={{ ...card2, textAlign:'center' as const, padding:'32px 16px' }}>
                    <div style={{ fontSize:26, marginBottom:10, opacity:0.3 }}>📈</div>
                    <div style={{ fontFamily:"'Playfair Display', serif", fontSize:15, fontWeight:400, color:C.dark, marginBottom:6 }}>No matches yet</div>
                    <div style={{ fontSize:12, color:'rgba(26,58,42,0.5)', marginBottom:14, fontWeight:300 }}>Log a match to start tracking your rating</div>
                    <button onClick={()=>{sessionStorage.setItem('arenaTab','log');router.push('/ratings')}} style={{ background:C.dark, border:'none', borderRadius:10, padding:'10px 22px', color:C.gold, fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Log a match →</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                      {[['Matches',ratingTimeline.length],['Current',ratingTimeline[ratingTimeline.length-1].rating.toFixed(1)],['Trend',(ratingTrend>=0?'+':'')+ratingTrend.toFixed(1)]].map(([l,v],i)=>(
                        <div key={String(l)} style={{ ...card, textAlign:'center' as const }}>
                          <div style={{ fontSize:9, color:'rgba(26,58,42,0.4)', textTransform:'uppercase' as const, marginBottom:6, letterSpacing:'0.1em', fontWeight:500 }}>{l}</div>
                          <div style={{ fontFamily:"'Playfair Display', serif", fontSize:20, fontWeight:400, color:i===2?(ratingTrend>=0?C.win:C.loss):C.dark }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:'rgba(26,58,42,0.04)', borderRadius:14, padding:'14px', overflowX:'auto', border:'1px solid rgba(26,58,42,0.07)' }}>
                      <div style={{ display:'flex', alignItems:'flex-end', gap:10, minWidth:ratingTimeline.length*56 }}>
                        {ratingTimeline.map(point => {
                          const h = Math.max(22, ((point.rating-ratingMin)/Math.max(ratingMax-ratingMin,1))*100)
                          return (
                            <div key={point.id} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:7, minWidth:44 }}>
                              <div style={{ width:10, height:h, borderRadius:999, background:point.won?C.win:C.loss }} />
                              <div style={{ fontSize:10, color:'rgba(26,58,42,0.55)', fontWeight:400 }}>{point.rating.toFixed(1)}</div>
                              <div style={{ fontSize:9, color:'rgba(26,58,42,0.38)', textAlign:'center' as const, fontWeight:300 }}>{new Date(point.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {ratingTimeline.slice(-5).reverse().map(point => (
                        <div key={`r-${point.id}`} style={{ ...card, borderLeft:`3px solid ${point.won?C.win:C.loss}`, borderRadius:'0 14px 14px 0', paddingLeft:11, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <div style={{ fontSize:12, fontWeight:500, color:C.dark }}>{new Date(point.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                            <div style={{ fontSize:11, color:'rgba(26,58,42,0.5)', fontWeight:300 }}>{point.won?'Win':'Loss'} · {point.before.toFixed(1)} → {point.rating.toFixed(1)}</div>
                          </div>
                          <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, fontWeight:400, color:point.won?C.win:C.loss }}>{point.won?'+':''}{(point.rating-point.before).toFixed(1)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Delete modal */}
      {deleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'0 24px' }}>
          <div style={{ background:C.bg, borderRadius:16, padding:'24px 20px', width:'100%', maxWidth:340, display:'flex', flexDirection:'column', gap:16, border:'1px solid rgba(26,58,42,0.12)' }}>
            <div style={{ fontFamily:"'Playfair Display', serif", fontSize:17, fontWeight:400, color:C.dark }}>Delete this game?</div>
            <div style={{ fontSize:13, color:'rgba(26,58,42,0.6)', lineHeight:1.55, fontWeight:300 }}>This will remove the post and all interested players will lose their spot.</div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setDeleteConfirm(null)} style={{ flex:1, background:'transparent', border:'1px solid rgba(26,58,42,0.18)', borderRadius:10, padding:'12px', color:'rgba(26,58,42,0.5)', fontWeight:400, fontSize:14, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Cancel</button>
              <button onClick={()=>confirmDeletePost(deleteConfirm)} style={{ flex:1, background:C.dark, border:'none', borderRadius:10, padding:'12px', color:C.gold, fontWeight:500, fontSize:14, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.04em' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Add member modal */}
      {addingMember && currentUser && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'0 24px' }}>
          <div style={{ background:C.bg, borderRadius:16, padding:'24px 20px', width:'100%', maxWidth:340, display:'flex', flexDirection:'column', gap:14, border:'1px solid rgba(26,58,42,0.12)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontFamily:"'Playfair Display', serif", fontSize:17, fontWeight:400, color:C.dark }}>Add a member</div>
              <button onClick={()=>setAddingMember(null)} style={{ background:'none', border:'none', color:'rgba(26,58,42,0.4)', fontSize:18, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:300, overflowY:'auto' }}>
              {players.filter(p=>p.id!==currentUser.id&&!posts.find(post=>post.id===addingMember)?.interested_ids.includes(p.id)).map(p=>(
                <button key={p.id} onClick={()=>handleAddMember(addingMember, p.id)} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'#fff', border:'1px solid rgba(26,58,42,0.1)', borderRadius:10, cursor:'pointer', fontFamily:'inherit', textAlign:'left' as const }}>
                  <Avatar initials={p.avatar} size={34} level={p.level} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:C.dark }}>{p.name}</div>
                    <div style={{ fontSize:11, color:'rgba(26,58,42,0.45)', marginTop:1, fontWeight:300 }}>L{p.level} · {levelDesc[p.level]}</div>
                  </div>
                  <span style={{ fontSize:12, color:'#2d3a8a', fontWeight:500, letterSpacing:'0.04em' }}>+ Add</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Nav — UPDATED colours ── */}
      <nav style={{ position:'fixed', bottom:0, left:0, right:0, background:'#1a3a2a', display:'flex', padding:'6px 0 10px', zIndex:100, borderTop:'1px solid rgba(184,150,62,0.15)' }}>
        <div style={{ maxWidth:480, margin:'0 auto', display:'flex', width:'100%' }}>
          {([
            { v:'home',    label:'Home',    icon:<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/> },
            { v:'board',   label:'Board',   icon:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></> },
            { v:'arena',   label:'Arena',   icon:<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/> },
            { v:'profile', label:'Profile', icon:<><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></> },
          ] as const).map(({ v, label, icon }) => {
            const active = view === v
            return (
              <button key={v} onClick={() => {
                if (v === 'profile' && currentUser) { setEditName(currentUser.name); setEditLevel(currentUser.level); setEditSlots(currentUser.availability) }
                setView(v as any)
              }} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:9, color:active?'#b8963e':'rgba(184,150,62,0.35)', fontWeight:active?500:400, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', position:'relative', letterSpacing:'0.06em', textTransform:'uppercase' }}>
                <svg width="18" height="18" fill="none" stroke={active?'#b8963e':'rgba(184,150,62,0.35)'} strokeWidth="1.6" viewBox="0 0 24 24">{icon}</svg>
                {label}
                {active && <div style={{ width:3, height:3, borderRadius:'50%', background:'#b8963e', marginTop:1 }} />}
                {v==='board' && openPosts.length>0 && (
                  <span style={{ position:'absolute', top:0, right:'18%', background:'#b8963e', color:'#1a3a2a', borderRadius:'50%', width:15, height:15, fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {openPosts.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

