// ─── League utility types & helpers ──────────────────────────────────────────
// Shared between app/league/page.tsx and app/ratings/page.tsx

export interface LeagueRow {
  id: string
  name: string
  sport: string
  season: number
  day_of_week: number
  start_date: string
  match_time_slot_1: string
  match_time_slot_2: string
  total_rounds: number
  status: string
  created_by: string
  created_at: string
}

export interface LeagueBox {
  id: string
  league_id: string
  box_number: number
  name: string
}

export interface LeagueBoxPlayer {
  id: string
  box_id: string
  player_id: string
  seed: number
  // joined from profiles/ratings
  player_name?: string
  rating?: number
  match_count?: number
}

export interface LeagueFixture {
  id: string
  league_id: string
  box_id: string
  round: number
  court: number
  scheduled_date: string
  scheduled_time: string
  team_1_p1: string
  team_1_p2: string
  team_2_p1: string
  team_2_p2: string
  status: string // 'upcoming' | 'pending' | 'played'
  // joined
  team_1_p1_name?: string
  team_1_p2_name?: string
  team_2_p1_name?: string
  team_2_p2_name?: string
  result?: LeagueFixtureResult
}

export interface LeagueFixtureResult {
  id: string
  fixture_id: string
  match_id: number | null
  team_1_sets: number[]
  team_2_sets: number[]
  tiebreak_set: number | null
  tiebreak_team_1: number | null
  tiebreak_team_2: number | null
  winning_team: 1 | 2
  logged_by: string
  logged_at: string
}

export interface BoxStanding {
  player_id: string
  player_name: string
  rating: number
  match_count: number
  wins: number
  losses: number
  games_for: number
  games_against: number
  points: number
}

// ─── Rating engine (identical to ratings/page.tsx) ────────────────────────────
function getK(n: number): number {
  if (n < 5)  return 0.60
  if (n < 11) return 0.45
  if (n < 21) return 0.28
  if (n < 41) return 0.18
  return 0.12
}

function marginMult(wG: number, lG: number): number {
  const diff = wG - lG
  if (diff <= 2)  return 1.0
  if (diff <= 5)  return 1.15
  if (diff <= 9)  return 1.3
  return 1.45
}

export function calcNewRating(
  myR: number,
  teamAvg: number,
  oppAvg: number,
  won: boolean,
  wG: number,
  lG: number,
  n: number
): number {
  const K = getK(n)
  const E = 1 / (1 + Math.pow(10, (oppAvg - teamAvg) / 4))
  const S = won ? 1 : 0
  const raw = myR + K * (S - E) * marginMult(wG, lG)
  return Math.round(Math.max(1.0, Math.min(7.0, raw)) * 10) / 10
}

// ─── Schedule generator ───────────────────────────────────────────────────────
// For 4 players (seeds A=1, B=2, C=3, D=4), generates 6 rounds of fixtures.
// Each round: 1 match. Partners and opponents rotate so everyone plays with/against everyone.
// Pattern: R1: AB vs CD, R2: AC vs BD, R3: AD vs BC, R4: AB vs CD, R5: AC vs BD, R6: AD vs BC
export function generateFixtures(
  leagueId: string,
  box: LeagueBox,
  players: LeagueBoxPlayer[], // must be sorted by seed 1-4
  startDate: string,
  dayOfWeek: number,
  timeSlot: string
): Omit<LeagueFixture, 'id' | 'result'>[] {
  const [a, b, c, d] = players.sort((x, y) => x.seed - y.seed)

  const pairings = [
    { t1: [a, b], t2: [c, d] },
    { t1: [a, c], t2: [b, d] },
    { t1: [a, d], t2: [b, c] },
    { t1: [a, b], t2: [c, d] },
    { t1: [a, c], t2: [b, d] },
    { t1: [a, d], t2: [b, c] },
  ]

  // Calculate scheduled date for each round (add weeks from start)
  function getRoundDate(round: number): string {
    const start = new Date(startDate)
    // Find first occurrence of dayOfWeek on or after startDate
    const diff = (dayOfWeek - start.getDay() + 7) % 7
    const firstMatch = new Date(start)
    firstMatch.setDate(start.getDate() + diff)
    // Add (round - 1) weeks
    firstMatch.setDate(firstMatch.getDate() + (round - 1) * 7)
    return firstMatch.toISOString().split('T')[0]
  }

  return pairings.map((p, i) => ({
    league_id: leagueId,
    box_id: box.id,
    round: i + 1,
    court: 1, // assigned by admin when creating league
    scheduled_date: getRoundDate(i + 1),
    scheduled_time: timeSlot,
    team_1_p1: p.t1[0].player_id,
    team_1_p2: p.t1[1].player_id,
    team_2_p1: p.t2[0].player_id,
    team_2_p2: p.t2[1].player_id,
    team_1_p1_name: p.t1[0].player_name,
    team_1_p2_name: p.t1[1].player_name,
    team_2_p1_name: p.t2[0].player_name,
    team_2_p2_name: p.t2[1].player_name,
    status: 'upcoming',
  }))
}

// ─── Standings calculator ─────────────────────────────────────────────────────
export function calcStandings(
  players: LeagueBoxPlayer[],
  fixtures: LeagueFixture[]
): BoxStanding[] {
  const standings: Record<string, BoxStanding> = {}

  players.forEach(p => {
    standings[p.player_id] = {
      player_id: p.player_id,
      player_name: p.player_name || '',
      rating: p.rating || 0,
      match_count: p.match_count || 0,
      wins: 0,
      losses: 0,
      games_for: 0,
      games_against: 0,
      points: 0,
    }
  })

  fixtures.forEach(f => {
    if (f.status !== 'played' || !f.result) return
    const r = f.result
    const t1Won = r.winning_team === 1
    const t1Games = r.team_1_sets.reduce((a, b) => a + b, 0)
    const t2Games = r.team_2_sets.reduce((a, b) => a + b, 0)

    const team1 = [f.team_1_p1, f.team_1_p2]
    const team2 = [f.team_2_p1, f.team_2_p2]

    team1.forEach(pid => {
      if (!standings[pid]) return
      standings[pid].wins += t1Won ? 1 : 0
      standings[pid].losses += t1Won ? 0 : 1
      standings[pid].games_for += t1Games
      standings[pid].games_against += t2Games
      standings[pid].points += t1Won ? 3 : 0
    })

    team2.forEach(pid => {
      if (!standings[pid]) return
      standings[pid].wins += t1Won ? 0 : 1
      standings[pid].losses += t1Won ? 1 : 0
      standings[pid].games_for += t2Games
      standings[pid].games_against += t1Games
      standings[pid].points += t1Won ? 0 : 3
    })
  })

  return Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const gdA = a.games_for - a.games_against
    const gdB = b.games_for - b.games_against
    return gdB - gdA
  })
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0]
  return dateStr === today
}

export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour
  return `${display}:${m}${ampm}`
}
