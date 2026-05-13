'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Rating } from '@/lib/types'
import {
  calcNewRating,
  calcStandings,
  formatMatchDate,
  isToday,
  formatTime,
} from '@/lib/leagueUtils'
import type {
  LeagueRow,
  LeagueBox,
  LeagueBoxPlayer,
  LeagueFixture,
  LeagueFixtureResult,
  BoxStanding,
} from '@/lib/leagueUtils'

const C = {
  bg:        '#f5f0e8',
  dark:      '#1a3a2a',
  mid:       '#026b0d',
  gold:      '#b8963e',
  win:       '#006633',
  loss:      '#990033',
  cardBorder:'rgba(1,74,9,0.12)',
}

function SetRow({
  label, va, setVa, vb, setVb, tba, setTba, tbb, setTbb,
}: {
  label: string
  va: string; setVa: (v: string) => void
  vb: string; setVb: (v: string) => void
  tba: string; setTba: (v: string) => void
  tbb: string; setTbb: (v: string) => void
}) {
  const a = parseInt(va) || 0
  const b = parseInt(vb) || 0
  const showTb = (a === 7 && b === 6) || (a === 6 && b === 7)
  const hasVal = va !== '' || vb !== ''
  const aRowWin = hasVal && a > b
  const bRowWin = hasVal && b > a

  function inputStyle(rowWin: boolean, rowLose: boolean): React.CSSProperties {
    const win  = { bg: 'rgba(0,102,51,0.07)',  border: 'rgba(0,102,51,0.4)',  color: C.win }
    const lose = { bg: 'rgba(153,0,51,0.07)',  border: 'rgba(153,0,51,0.4)', color: C.loss }
    const neu  = { bg: 'rgba(1,74,9,0.04)',    border: 'rgba(1,74,9,0.15)',  color: '#888' }
    const { bg, border, color } = rowWin ? win : rowLose ? lose : neu
    return {
      background: bg, border: `1px solid ${border}`, borderRadius: 9,
      padding: '9px 0', color, fontSize: 20, fontWeight: 900,
      textAlign: 'center', fontFamily: 'inherit', outline: 'none',
      width: '100%', transition: 'all 0.15s',
    }
  }

  function tbStyle(rowWin: boolean, rowLose: boolean): React.CSSProperties {
    const win  = { bg: 'rgba(0,102,51,0.05)',  border: 'rgba(0,102,51,0.35)',  color: C.win }
    const lose = { bg: 'rgba(153,0,51,0.05)',  border: 'rgba(153,0,51,0.35)', color: C.loss }
    const neu  = { bg: 'rgba(1,74,9,0.02)',    border: 'rgba(1,74,9,0.2)',    color: '#aaa' }
    const { bg, border, color } = rowWin ? win : rowLose ? lose : neu
    return {
      background: bg, border: `1px dashed ${border}`, borderRadius: 7,
      padding: '5px 0', color, fontSize: 14, fontWeight: 800,
      textAlign: 'center', fontFamily: 'inherit', outline: 'none',
      width: '100%', transition: 'all 0.15s',
    }
  }

  return (
    <div style={{ marginBottom: showTb ? 4 : 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 20px 1fr', gap: 6, alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>{label}</div>
        <input type="number" min="0" max="7" placeholder="—"
          value={va} onChange={e => setVa(e.target.value)}
          style={inputStyle(aRowWin, bRowWin)} />
        <div style={{ textAlign: 'center', color: '#888', fontWeight: 700, fontSize: 13 }}>–</div>
        <input type="number" min="0" max="7" placeholder="—"
          value={vb} onChange={e => setVb(e.target.value)}
          style={inputStyle(bRowWin, aRowWin)} />
      </div>
      {showTb && (
        <div style={{
          display: 'grid', gridTemplateColumns: '50px 1fr 20px 1fr',
          gap: 6, alignItems: 'center', marginTop: 4, marginBottom: 8,
        }}>
          <div style={{ fontSize: 9, color: '#aaa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>TB</div>
          <input type="number" min="0" max="20" placeholder="TB"
            value={tba} onChange={e => setTba(e.target.value)}
            style={tbStyle(aRowWin, bRowWin)} />
          <div style={{ textAlign: 'center', color: '#ccc', fontWeight: 700, fontSize: 11 }}>–</div>
          <input type="number" min="0" max="20" placeholder="TB"
            value={tbb} onChange={e => setTbb(e.target.value)}
            style={tbStyle(bRowWin, aRowWin)} />
        </div>
      )}
    </div>
  )
}

function FixtureScores({ result }: { result: LeagueFixtureResult }) {
  const sets1 = result.team_1_sets
  const sets2 = result.team_2_sets
  const numSets = sets1.length
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
      {Array.from({ length: numSets }).map((_, i) => {
        const s1 = sets1[i], s2 = sets2[i]
        const isTb = result.tiebreak_set === i + 1
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                background: s1 > s2 ? 'rgba(0,102,51,0.10)' : 'rgba(153,0,51,0.10)',
                color: s1 > s2 ? C.win : C.loss,
              }}>{s1}</div>
              {isTb
                ? <div style={{ fontSize: 8, fontWeight: 700, color: C.dark, background: 'rgba(255,204,102,0.35)', borderRadius: 3, padding: '1px 4px' }}>
                    TB {result.tiebreak_team_1}–{result.tiebreak_team_2}
                  </div>
                : <div style={{ fontSize: 9, color: '#bbb', fontWeight: 500 }}>S{i + 1}</div>
              }
            </div>
            {i < numSets - 1 && <div style={{ width: 1, height: 32, background: 'rgba(1,74,9,0.08)', margin: '0 1px' }} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function FixtureCard({
  fixture, currentUserId, onLogResult,
}: {
  fixture: LeagueFixture
  currentUserId: string | null
  onLogResult: (fixture: LeagueFixture) => void
}) {
  const today = isToday(fixture.scheduled_date)
  const played = fixture.status === 'played'
  const upcoming = fixture.status === 'upcoming' && !today
  const statusPill = played
    ? { label: 'Played', color: C.win, bg: 'rgba(0,102,51,0.10)' }
    : today
    ? { label: 'Tonight', color: '#9a6800', bg: 'rgba(255,204,102,0.25)' }
    : { label: 'Upcoming', color: '#aaa', bg: 'transparent' }
  const t1Won = played && fixture.result?.winning_team === 1
  const t2Won = played && fixture.result?.winning_team === 2
  function nameColor(team: 1 | 2) {
    if (!played) return upcoming ? '#bbb' : '#888'
    return team === 1 ? (t1Won ? C.win : C.loss) : (t2Won ? C.win : C.loss)
  }
  function nameFw(team: 1 | 2) {
    if (!played) return upcoming ? 400 : 500
    return (team === 1 ? t1Won : t2Won) ? 600 : 500
  }
  const emptyScores = (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600,
            background: upcoming ? 'rgba(1,74,9,0.03)' : 'rgba(1,74,9,0.05)',
            border: upcoming ? 'none' : '1px dashed rgba(1,74,9,0.15)',
            color: upcoming ? '#ddd' : '#ccc',
          }}>{upcoming ? '—' : `S${i}`}</div>
          <div style={{ fontSize: 9, color: '#bbb', fontWeight: 500 }}>S{i}</div>
        </div>
      ))}
    </div>
  )
  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'rgba(1,74,9,0.03)', borderBottom: '1px solid rgba(1,74,9,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.dark, background: 'rgba(1,74,9,0.10)', borderRadius: 5, padding: '2px 8px' }}>Week {fixture.round}</div>
          <div style={{ fontSize: 10, color: '#888' }}>Court {fixture.court} · {formatMatchDate(fixture.scheduled_date)} · {formatTime(fixture.scheduled_time)}</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: statusPill.color, background: statusPill.bg, borderRadius: 5, padding: '2px 8px' }}>{statusPill.label}</div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 7, borderBottom: '1px solid rgba(1,74,9,0.07)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: nameFw(1), color: nameColor(1) }}>{fixture.team_1_p1_name}</div>
            <div style={{ fontSize: 13, fontWeight: nameFw(1), color: nameColor(1) }}>{fixture.team_1_p2_name}</div>
          </div>
          {played && fixture.result ? <FixtureScores result={fixture.result} /> : emptyScores}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 7 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: nameFw(2), color: nameColor(2) }}>{fixture.team_2_p1_name}</div>
            <div style={{ fontSize: 13, fontWeight: nameFw(2), color: nameColor(2) }}>{fixture.team_2_p2_name}</div>
          </div>
          {played && fixture.result
            ? <FixtureScores result={{ ...fixture.result, team_1_sets: fixture.result.team_2_sets, team_2_sets: fixture.result.team_1_sets, tiebreak_team_1: fixture.result.tiebreak_team_2, tiebreak_team_2: fixture.result.tiebreak_team_1 }} />
            : emptyScores}
        </div>
      </div>
      {!played && (
        <button onClick={() => onLogResult(fixture)} style={{
          display: 'block', width: 'calc(100% - 28px)', margin: '0 14px 12px', padding: '9px',
          background: C.dark, color: C.gold, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>+ Log Score</button>
      )}
    </div>
  )
}

function LogResultModal({
  fixture, ratings, userId, onClose, onSaved, showNotif,
}: {
  fixture: LeagueFixture; ratings: Rating[]; userId: string
  onClose: () => void; onSaved: () => void; showNotif: (msg: string) => void
}) {
  const [s1a, setS1a] = useState(''); const [s1b, setS1b] = useState('')
  const [s2a, setS2a] = useState(''); const [s2b, setS2b] = useState('')
  const [s3a, setS3a] = useState(''); const [s3b, setS3b] = useState('')
  const [tb1a, setTb1a] = useState(''); const [tb1b, setTb1b] = useState('')
  const [tb2a, setTb2a] = useState(''); const [tb2b, setTb2b] = useState('')
  const [tb3a, setTb3a] = useState(''); const [tb3b, setTb3b] = useState('')
  const [submitting, setSubmitting] = useState(false)
  function setWinner(a: string, b: string): 'a' | 'b' | null {
    const av = parseInt(a), bv = parseInt(b)
    if (isNaN(av) || isNaN(bv) || (av === 0 && bv === 0)) return null
    if (av > bv) return 'a'; if (bv > av) return 'b'; return null
  }
  const set1Winner = setWinner(s1a, s1b)
  const set2Winner = setWinner(s2a, s2b)
  const showSet3 = set1Winner !== null && set2Winner !== null && set1Winner !== set2Winner
  useEffect(() => { if (!showSet3) { setS3a(''); setS3b(''); setTb3a(''); setTb3b('') } }, [showSet3])
  const p1r = ratings.find(r => r.player_id === fixture.team_1_p1)
  const p2r = ratings.find(r => r.player_id === fixture.team_1_p2)
  const p3r = ratings.find(r => r.player_id === fixture.team_2_p1)
  const p4r = ratings.find(r => r.player_id === fixture.team_2_p2)
  async function handleSubmit() {
    if (!s1a || !s1b || !s2a || !s2b) { showNotif('Enter at least 2 sets'); return }
    if (!p1r || !p2r || !p3r || !p4r) { showNotif('Could not find player ratings'); return }
    setSubmitting(true)
    const sets_a = [parseInt(s1a)||0, parseInt(s2a)||0, ...(showSet3 ? [parseInt(s3a)||0] : [])]
    const sets_b = [parseInt(s1b)||0, parseInt(s2b)||0, ...(showSet3 ? [parseInt(s3b)||0] : [])]
    const aGames = sets_a.reduce((a, b) => a + b, 0)
    const bGames = sets_b.reduce((a, b) => a + b, 0)
    const aWon = aGames > bGames
    const wG = Math.max(aGames, bGames), lG = Math.min(aGames, bGames)
    const teamA = (p1r.rating + p2r.rating) / 2
    const teamB = (p3r.rating + p4r.rating) / 2
    const newA1 = calcNewRating(p1r.rating, teamA, teamB, aWon, wG, lG, p1r.match_count)
    const newA2 = calcNewRating(p2r.rating, teamA, teamB, aWon, wG, lG, p2r.match_count)
    const newB1 = calcNewRating(p3r.rating, teamB, teamA, !aWon, wG, lG, p3r.match_count)
    const newB2 = calcNewRating(p4r.rating, teamB, teamA, !aWon, wG, lG, p4r.match_count)
    const { data: matchData, error: matchError } = await supabase.from('matches').insert({
      team_a1_id: p1r.player_id, team_a1_name: p1r.player_name,
      team_a2_id: p2r.player_id, team_a2_name: p2r.player_name,
      team_b1_id: p3r.player_id, team_b1_name: p3r.player_name,
      team_b2_id: p4r.player_id, team_b2_name: p4r.player_name,
      sets_a, sets_b,
      rating_a1_before: p1r.rating, rating_a1_after: newA1,
      rating_a2_before: p2r.rating, rating_a2_after: newA2,
      rating_b1_before: p3r.rating, rating_b1_after: newB1,
      rating_b2_before: p4r.rating, rating_b2_after: newB2,
    }).select().single()
    if (matchError) { showNotif('Error saving match'); setSubmitting(false); return }
    await Promise.all([
      supabase.from('ratings').update({ rating: newA1, match_count: p1r.match_count + 1 }).eq('player_id', p1r.player_id),
      supabase.from('ratings').update({ rating: newA2, match_count: p2r.match_count + 1 }).eq('player_id', p2r.player_id),
      supabase.from('ratings').update({ rating: newB1, match_count: p3r.match_count + 1 }).eq('player_id', p3r.player_id),
      supabase.from('ratings').update({ rating: newB2, match_count: p4r.match_count + 1 }).eq('player_id', p4r.player_id),
    ])
    const tbSet = (s1a==='7'||s1b==='7') ? 1 : (s2a==='7'||s2b==='7') ? 2 : showSet3 && (s3a==='7'||s3b==='7') ? 3 : null
    const tbA = tbSet===1 ? tb1a : tbSet===2 ? tb2a : tb3a
    const tbB = tbSet===1 ? tb1b : tbSet===2 ? tb2b : tb3b
    const { error: resultError } = await supabase.from('league_fixture_results').insert({
      fixture_id: fixture.id, match_id: matchData.id,
      team_1_sets: sets_a, team_2_sets: sets_b,
      tiebreak_set: tbSet,
      tiebreak_team_1: tbA ? parseInt(tbA) : null,
      tiebreak_team_2: tbB ? parseInt(tbB) : null,
      winning_team: aWon ? 1 : 2, logged_by: userId,
    })
    if (resultError) { showNotif('Error saving result'); setSubmitting(false); return }
    await supabase.from('league_fixtures').update({ status: 'played' }).eq('id', fixture.id)
    showNotif('Result saved!'); onSaved(); onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#f5f0e8', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: 'rgba(1,74,9,0.2)', borderRadius: 2, margin: '0 auto 18px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 4 }}>Log Result</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Week {fixture.round} · {fixture.team_1_p1_name} & {fixture.team_1_p2_name} vs {fixture.team_2_p1_name} & {fixture.team_2_p2_name}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 20px 1fr', gap: 6, marginBottom: 8 }}>
          <div />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.dark, textAlign: 'center' }}>{fixture.team_1_p1_name?.split(' ')[0]} & {fixture.team_1_p2_name?.split(' ')[0]}</div>
          <div />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.dark, textAlign: 'center' }}>{fixture.team_2_p1_name?.split(' ')[0]} & {fixture.team_2_p2_name?.split(' ')[0]}</div>
        </div>
        <SetRow label="Set 1" va={s1a} setVa={setS1a} vb={s1b} setVb={setS1b} tba={tb1a} setTba={setTb1a} tbb={tb1b} setTbb={setTb1b} />
        <SetRow label="Set 2" va={s2a} setVa={setS2a} vb={s2b} setVb={setS2b} tba={tb2a} setTba={setTb2a} tbb={tb2b} setTbb={setTb2b} />
        {showSet3 && <SetRow label="Set 3" va={s3a} setVa={setS3a} vb={s3b} setVb={setS3b} tba={tb3a} setTba={setTb3a} tbb={tb3b} setTbb={setTb3b} />}
        <button onClick={handleSubmit} disabled={submitting} style={{
          width: '100%', padding: '13px', marginTop: 8,
          background: submitting ? 'rgba(1,74,9,0.4)' : '#014a09',
          color: '#ffcc66', border: 'none', borderRadius: 14,
          fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}>{submitting ? 'Saving...' : 'Save Result'}</button>
      </div>
    </div>
  )
}

export default function LeaguePage() {
  const router = useRouter()
  const [loading, setLoading]           = useState(true)
  const [userId, setUserId]             = useState<string | null>(null)
  const [ratings, setRatings]           = useState<Rating[]>([])
  const [leagues, setLeagues]           = useState<LeagueRow[]>([])
  const [activeLeague, setActiveLeague] = useState<LeagueRow | null>(null)
  const [boxes, setBoxes]               = useState<LeagueBox[]>([])
  const [boxPlayers, setBoxPlayers]     = useState<LeagueBoxPlayer[]>([])
  const [fixtures, setFixtures]         = useState<LeagueFixture[]>([])
  const [sport, setSport]               = useState<'padel' | 'tennis'>('padel')
  const [tab, setTab]                   = useState<'boxes' | 'schedule'>('boxes')
  const [logFixture, setLogFixture]     = useState<LeagueFixture | null>(null)
  const [notif, setNotif]               = useState<string | null>(null)
  const notifRef                        = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    const { data: ratingsData } = await supabase.from('ratings').select('*')
    setRatings(ratingsData || [])
    const { data: leagueData } = await supabase.from('leagues').select('*').eq('sport', 'padel').order('created_at', { ascending: false })
    const leagueList: LeagueRow[] = leagueData || []
    setLeagues(leagueList)
    const active = leagueList.find(l => l.status === 'active') || leagueList[0] || null
    setActiveLeague(active)
    if (active) await loadLeagueData(active.id, ratingsData || [])
    setLoading(false)
  }, [router])

  async function loadLeagueData(leagueId: string, ratingsData: Rating[]) {
    const { data: boxData } = await supabase.from('league_boxes').select('*').eq('league_id', leagueId).order('box_number')
    const boxList: LeagueBox[] = boxData || []
    setBoxes(boxList)
    const boxIds = boxList.map(b => b.id)
    if (boxIds.length === 0) { setBoxPlayers([]); setFixtures([]); return }
    const { data: playerData } = await supabase.from('league_box_players').select('*').in('box_id', boxIds)
    const players: LeagueBoxPlayer[] = (playerData || []).map((p: LeagueBoxPlayer) => {
      const r = ratingsData.find(r => r.player_id === p.player_id)
      return { ...p, player_name: r?.player_name || 'Unknown', rating: r?.rating, match_count: r?.match_count }
    })
    setBoxPlayers(players)
    const { data: fixtureData } = await supabase.from('league_fixtures').select('*').eq('league_id', leagueId).order('round').order('box_id')
    const fixtureIds = (fixtureData || []).map((f: LeagueFixture) => f.id)
    const { data: resultData } = await supabase.from('league_fixture_results').select('*').in('fixture_id', fixtureIds.length > 0 ? fixtureIds : ['none'])
    const fixturesWithNames: LeagueFixture[] = (fixtureData || []).map((f: LeagueFixture) => {
      const result = (resultData || []).find((r: LeagueFixtureResult) => r.fixture_id === f.id)
      const pName = (id: string) => ratingsData.find(r => r.player_id === id)?.player_name || 'Unknown'
      return { ...f, team_1_p1_name: pName(f.team_1_p1), team_1_p2_name: pName(f.team_1_p2), team_2_p1_name: pName(f.team_2_p1), team_2_p2_name: pName(f.team_2_p2), result: result || undefined }
    })
    setFixtures(fixturesWithNames)
  }

  useEffect(() => {
    loadData()
    const onVisible = () => { if (!document.hidden) loadData() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadData])

  const todayFixtures = fixtures.filter(f => isToday(f.scheduled_date))
  const slot1 = todayFixtures.filter(f => f.scheduled_time === activeLeague?.match_time_slot_1)
  const slot2 = todayFixtures.filter(f => f.scheduled_time === activeLeague?.match_time_slot_2)
  const currentRound = activeLeague
    ? (todayFixtures[0]?.round ?? Math.max(...fixtures.filter(f => f.status === 'played').map(f => f.round), 0))
    : 0

  function standingsForBox(boxId: string): BoxStanding[] {
    return calcStandings(boxPlayers.filter(p => p.box_id === boxId), fixtures.filter(f => f.box_id === boxId))
  }

  const rounds = Array.from(new Set(fixtures.map(f => f.round))).sort((a, b) => a - b)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg, fontFamily: "'Jost',sans-serif" }}>
      <div style={{ color: C.dark, fontSize: 14, fontWeight: 500 }}>Loading league...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Jost',sans-serif" }}>

      {notif && (
        <div style={{ position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', background: 'rgba(1,74,9,0.12)', backdropFilter: 'blur(12px)', border: '1px solid rgba(2,107,13,0.4)', borderRadius: 14, padding: '11px 22px', zIndex: 9999, color: C.dark, fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{notif}</div>
      )}

      {/* ── Header — matches main app style ── */}
      <div style={{ background: C.dark, padding:'max(env(safe-area-inset-top), 10px) 16px 8px', borderBottom:'1px solid rgba(184,150,62,0.2)', marginBottom:6 }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", color: C.gold, fontSize:20, fontWeight:400, letterSpacing:-0.3 }}>The League</div>
            <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11, marginTop:3, fontWeight:300, letterSpacing:'0.04em' }}>Season standings · fixtures</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>

            <button onClick={() => router.push('/ratings')} style={{ background:'rgba(184,150,62,0.12)', border:'1px solid rgba(184,150,62,0.2)', borderRadius:20, padding:'7px 14px', color:C.gold, fontSize:11, fontWeight:500, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.06em', whiteSpace:'nowrap' as const }}>← Arena</button>
          </div>
        </div>
      </div>

      {/* ── All content centred at 480px ── */}
      <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 80 }}>

        {/* Sport switcher */}


        {/* Tonight banner */}
        {todayFixtures.length > 0 && (
          <div style={{ margin: '8px 16px 0', background: C.dark, borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ color: C.gold, fontSize: 14, fontWeight: 600 }}>Tonight — Week {currentRound}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            </div>
            {[slot1, slot2].filter(s => s.length > 0).map((slotFixtures, si) => (
              <div key={si} style={{ marginBottom: si === 0 && slot2.length > 0 ? 8 : 0 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 5 }}>{formatTime(slotFixtures[0].scheduled_time)}</div>
                <div style={{ display: 'grid', gridTemplateColumns: slotFixtures.length > 1 ? '1fr 1fr' : '1fr', gap: 8 }}>
                  {slotFixtures.map(f => {
                    const box = boxes.find(b => b.id === f.box_id)
                    return (
                      <div key={f.id} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 11px' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,204,102,0.7)', fontWeight: 700, letterSpacing: '0.5px', marginBottom: 5 }}>Court {f.court} · {box?.name}</div>
                        <div style={{ fontSize: 11, color: '#fff', fontWeight: 500, lineHeight: 1.4 }}>{f.team_1_p1_name}<br />{f.team_1_p2_name}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '3px 0', fontWeight: 500 }}>vs</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>{f.team_2_p1_name}<br />{f.team_2_p2_name}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap:6, margin: '8px 16px 0' }}>
          {(['boxes', 'schedule'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={
              tab === t
                ? { background: C.dark, color: C.gold, fontSize:11, fontWeight:500, padding:'7px 16px', borderRadius:20, cursor:'pointer', border:'none', fontFamily:'inherit', whiteSpace:'nowrap', transition:'all 0.15s', letterSpacing:'0.04em' }
                : { background: 'transparent', color: 'rgba(1,74,9,0.45)', fontSize:11, fontWeight:400, padding:'7px 16px', borderRadius:20, cursor:'pointer', border:'1px solid rgba(1,74,9,0.18)', fontFamily:'inherit', whiteSpace:'nowrap', transition:'all 0.15s', letterSpacing:'0.04em' }
            }>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>

        {/* Boxes tab */}
        {tab === 'boxes' && (
          <div style={{ padding: '14px 16px 0' }}>
            {boxes.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 48, paddingBottom: 24 }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🏆</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 6 }}>No active league</div>
                <div style={{ fontSize: 12, color: 'rgba(1,74,9,0.45)' }}>Ask the admin to create one</div>
              </div>
            ) : boxes.map((box, bi) => {
              const standings = standingsForBox(box.id)
              const bNumColors = [{ bg: C.gold, color: C.dark }, { bg: 'rgba(1,74,9,0.12)', color: C.dark }, { bg: 'rgba(1,74,9,0.07)', color: C.dark }]
              const bc = bNumColors[bi] || bNumColors[2]
              return (
                <div key={box.id} style={{ marginBottom: 12 }}>
                  <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, ...bc }}>{box.box_number}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>{box.name}</div>
                      </div>
                      <div style={{ fontSize: 11, color: '#888' }}>4 players</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 28px 28px 28px 36px', gap: 4, padding: '7px 14px', background: 'rgba(1,74,9,0.04)' }}>
                      {['#','Player','W','L','GD','Pts'].map((h, i) => (
                        <div key={h} style={{ fontSize: 10, fontWeight: 600, color: C.dark, textAlign: i===1 ? 'left' : 'center', letterSpacing: '0.3px' }}>{h}</div>
                      ))}
                    </div>
                    {standings.map((st, i) => {
                      const isTop = i === 0, isBot = i === standings.length - 1
                      const gd = st.games_for - st.games_against
                      return (
                        <div key={st.player_id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 28px 28px 28px 36px', gap: 4, padding: '9px 14px', borderBottom: i < standings.length - 1 ? '1px solid rgba(1,74,9,0.06)' : 'none', background: isTop ? 'rgba(0,102,51,0.04)' : isBot ? 'rgba(153,0,51,0.03)' : 'transparent', alignItems: 'center' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.dark, textAlign: 'center' }}>{i + 1}</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 5 }}>
                            {st.player_name}
                            {isTop && <span style={{ fontSize: 9, fontWeight: 700, color: C.win, background: 'rgba(0,102,51,0.12)', borderRadius: 4, padding: '1px 5px' }}>▲</span>}
                            {isBot && <span style={{ fontSize: 9, fontWeight: 700, color: C.loss, background: 'rgba(153,0,51,0.10)', borderRadius: 4, padding: '1px 5px' }}>▼</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#555', textAlign: 'center' }}>{st.wins}</div>
                          <div style={{ fontSize: 12, color: '#555', textAlign: 'center' }}>{st.losses}</div>
                          <div style={{ fontSize: 12, color: '#555', textAlign: 'center' }}>{gd > 0 ? `+${gd}` : gd}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, textAlign: 'center' }}>{st.points}</div>
                        </div>
                      )
                    })}
                  </div>
                  {bi === boxes.length - 1 && (
                    <div style={{ marginTop: 6, background: 'rgba(1,74,9,0.05)', borderLeft: `3px solid ${C.dark}`, borderRadius: '0 10px 10px 0', padding: '8px 12px', fontSize: 11, color: 'rgba(1,74,9,0.55)', lineHeight: 1.5 }}>
                      <strong style={{ color: C.dark }}>Promotion:</strong> Top player moves up next season. Bottom player moves down.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Schedule tab */}
        {tab === 'schedule' && (
          <div style={{ padding: '14px 16px 0' }}>
            {rounds.map(round => {
              const roundFixtures = fixtures.filter(f => f.round === round)
              const roundDate = roundFixtures[0]?.scheduled_date || ''
              const done = roundFixtures.every(f => f.status === 'played')
              const isNow = roundFixtures.some(f => isToday(f.scheduled_date))
              const dotColor = done ? 'rgba(1,74,9,0.3)' : isNow ? C.gold : 'rgba(1,74,9,0.15)'
              return (
                <div key={round} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, letterSpacing: '0.5px' }}>
                        Week {round}{done ? ' — Complete' : isNow ? ' — Tonight' : round === Math.max(...rounds) ? ' — Final' : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>{formatMatchDate(roundDate)}</div>
                  </div>
                  {roundFixtures.map(f => <FixtureCard key={f.id} fixture={f} currentUserId={userId} onLogResult={setLogFixture} />)}
                </div>
              )
            })}
            {rounds.length === 0 && (
              <div style={{ textAlign: 'center', paddingTop: 48 }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📅</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 6 }}>No fixtures yet</div>
                <div style={{ fontSize: 12, color: 'rgba(1,74,9,0.45)' }}>Fixtures will appear once a league is created</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Log Result Modal */}
      {logFixture && userId && (
        <LogResultModal fixture={logFixture} ratings={ratings} userId={userId} onClose={() => setLogFixture(null)} onSaved={() => loadData()} showNotif={showNotif} />
      )}

      {/* ── Bottom Nav ── */}
      <nav style={{ position:'fixed', bottom:0, left:0, right:0, background:'#1a3a2a', display:'flex', padding:'6px 0 10px', zIndex:100 }}>
        <div style={{ maxWidth:480, margin:'0 auto', display:'flex', width:'100%' }}>
          {([
            { label:'Home',    action:() => router.push('/') },
            { label:'Board',   action:() => { sessionStorage.setItem('mainView','board'); router.push('/') } },
            { label:'Arena',   action:() => router.push('/ratings') },
            { label:'Profile', action:() => router.push('/') },
          ] as const).map(({ label, action }) => {
            const icons: Record<string, React.ReactNode> = {
              Home:    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>,
              Board:   <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"></path></>,
              Arena:   <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
              Profile: <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"></path></>,
            }
            return (
              <button key={label} onClick={action} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:10, color:'rgba(184,150,62,0.35)', fontWeight:400, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                <svg width="18" height="18" fill="none" stroke='rgba(184,150,62,0.35)' strokeWidth="1.8" viewBox="0 0 24 24">{icons[label]}</svg>
                {label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

