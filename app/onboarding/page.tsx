'use client'
import { useState, useEffect } from 'react'
import AvailabilityPicker from '@/components/AvailabilityPicker'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─── Assessment Data ──────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    tag: 'Technical — Glass play',
    text: 'When your opponent lobs and the ball is heading toward the back glass, what do you do?',
    options: [
      { text: 'I panic and hit it before it reaches the glass', pts: 0 },
      { text: 'I sometimes wait for the glass but often miss-time it', pts: 1 },
      { text: 'I consistently wait, let it bounce off the glass, then play a controlled shot', pts: 2 },
      { text: 'I read the rebound, choose between a vibora or bandeja, and attack or defend based on position', pts: 3 },
    ],
  },
  {
    tag: 'Technical — Padel shots',
    text: 'Which of the following shots have you successfully hit in a real match — not just in practice?',
    options: [
      { text: 'None of these — I focus on keeping the ball in play', pts: 0 },
      { text: 'Bandeja only', pts: 1 },
      { text: 'Bandeja and vibora', pts: 2 },
      { text: 'Bandeja, vibora, and chiquita — and I choose between them tactically', pts: 3 },
    ],
  },
  {
    tag: 'Technical — Wall play',
    text: 'Your opponent plays a bajada de pared (ball sliding down the side glass). How do you handle it?',
    options: [
      { text: "I don't know what that is", pts: 0 },
      { text: 'I know the shot but I usually hit it into the net or out', pts: 1 },
      { text: 'I can return it with a defensive shot about half the time', pts: 2 },
      { text: 'I read it early, adjust my position, and turn it into an attacking opportunity', pts: 3 },
    ],
  },
  {
    tag: 'Glass factor',
    text: 'Out of 10 balls coming off the back glass, how many do you return into play with intention (not just survival)?',
    options: [
      { text: '0–2 — the glass is still my biggest weakness', pts: 0 },
      { text: '3–5 — I get some back but it\'s inconsistent', pts: 1 },
      { text: '6–8 — I return most and can direct the ball', pts: 2 },
      { text: '9–10 — I use the glass to my advantage almost every time', pts: 3 },
    ],
  },
  {
    tag: 'Glass factor',
    text: 'Your partner is at the back and the ball hits the side glass coming toward you. What happens?',
    options: [
      { text: "I usually hit it before it reaches the glass because I'm unsure", pts: 0 },
      { text: 'I wait but I often mis-read the angle and mishit', pts: 1 },
      { text: 'I read the rebound well and play a neutral or defensive shot', pts: 2 },
      { text: 'I anticipate the angle, hold my position, and play an attacking shot', pts: 3 },
    ],
  },
  {
    tag: 'Tactical — Positioning',
    text: 'Where do you and your partner stand when your team is serving?',
    options: [
      { text: "Both at the baseline — I'm not sure where to go", pts: 0 },
      { text: 'Server at baseline, partner somewhere in the middle', pts: 1 },
      { text: 'Server at baseline, partner at net — we try to take control', pts: 2 },
      { text: 'We have a clear set play: server charges the net after a good serve, partner adjusts based on return', pts: 3 },
    ],
  },
  {
    tag: 'Tactical — Net play',
    text: 'How often do you and your partner transition to the net during a rally?',
    options: [
      { text: 'Rarely — I mostly stay back', pts: 0 },
      { text: "Sometimes, but we don't move as a unit", pts: 1 },
      { text: 'Often — we move to net together when we have a good ball', pts: 2 },
      { text: 'We control the net deliberately, move as a unit, and know when to retreat', pts: 3 },
    ],
  },
  {
    tag: 'Accuracy — Lobs',
    text: 'Out of 10 lobs, how many land deep in the back court (past the service line) without hitting the back glass first?',
    options: [
      { text: '0–2 — my lobs either go out or are too short', pts: 0 },
      { text: '3–5 — inconsistent depth and direction', pts: 1 },
      { text: '6–8 — mostly deep but direction is inconsistent', pts: 2 },
      { text: '9–10 — I can place lobs to backhand or middle consistently', pts: 3 },
    ],
  },
  {
    tag: 'Match history',
    text: 'What is your competitive racquet sports background?',
    options: [
      { text: 'No prior racquet sport experience', pts: 0 },
      { text: 'Recreational tennis, squash, or pickleball (club level only)', pts: 1 },
      { text: 'Club league competitor in tennis/squash — 3.5+ NTRP or regional rating', pts: 2 },
      { text: 'Competitive tournament player or national/regional ranking in another racquet sport', pts: 3 },
    ],
  },
  {
    tag: 'Match history — Padel',
    text: 'What is your padel match experience?',
    options: [
      { text: 'Under 5 matches ever played', pts: 0 },
      { text: '5–20 matches, mostly casual club games', pts: 1 },
      { text: '20–50 matches including some club tournaments', pts: 2 },
      { text: '50+ matches and/or official FIP/WPR registered tournament results', pts: 3 },
    ],
  },
  {
    tag: 'Ego check',
    text: 'You lose a match convincingly. What is your most honest assessment of why?',
    options: [
      { text: "I couldn't keep the ball in play consistently", pts: 0 },
      { text: 'My wall play broke down under pressure', pts: 1 },
      { text: 'We were tactically outplayed — our positioning and movement were poor', pts: 2 },
      { text: 'The opponents were technically and tactically superior — I know specifically what they did better', pts: 3 },
    ],
  },
]

interface LevelResult {
  appLevel: string
  name: string
  range: string
  color: string
  bg: string
  blurb: string
  focus: string[]
}

const LEVEL_RESULTS: LevelResult[] = [
  {
    appLevel: '4',
    name: 'Beginner',
    range: 'Level 1.0 – 2.0',
    color: '#990033',
    bg: 'rgba(153,0,51,0.12)',
    blurb: "You're in the early stages of your padel journey. Your priority right now is developing consistency and building a relationship with the glass. The walls are padel's defining feature — embrace them.",
    focus: [
      'Glass fundamentals: let every ball bounce off the back glass before hitting',
      'Shot consistency: forehand and backhand groundstrokes with controlled direction',
      'Basic court positioning: understand why one partner is at net and one at base',
      'Learn the terminology: bandeja, chiquita, vibora, bajada de pared',
    ],
  },
  {
    appLevel: '3',
    name: 'Intermediate',
    range: 'Level 2.5 – 3.5',
    color: '#facc15',
    bg: 'rgba(250,204,21,0.12)',
    blurb: 'You have the fundamentals and can play a consistent rally, but your game still relies heavily on what happens in front of you. Your tactical awareness is developing — you know you should be at the net, but you don\'t always get there at the right moment.',
    focus: [
      'Wall play under pressure: practice bajada de pared and corner combinations',
      'Bandeja technique: develop a reliable overhead that defends the net position',
      'Net transition timing: learn to attack as a unit, not individually',
      'Lob depth and direction: place lobs to the backhand corner consistently',
    ],
  },
  {
    appLevel: '2',
    name: 'Advanced',
    range: 'Level 4.0 – 5.0',
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.12)',
    blurb: "You're a solid club-level competitor. Your glass play is reliable, you have tactical intent, and you can execute the main padel shots under match pressure. The gap between your level and the next is about consistency, shot selection, and the ability to control a point — not just react to it.",
    focus: [
      'Vibora vs bandeja decision-making: when to attack, when to consolidate',
      'Court control: dominate the net position and use the chiquita to stay there',
      'Partner communication: develop set plays and anticipate each other\'s movement',
      'Tactical variety: introduce more deception, pace variation, and angle play',
    ],
  },
  {
    appLevel: '1',
    name: 'Semi-pro / Competitive',
    range: 'Level 5.5+',
    color: '#cc9900',
    bg: 'rgba(204,153,0,0.12)',
    blurb: 'You play at a high competitive level. Your technique, wall play, and tactical understanding are well above the club average. The focus at this stage is refinement, mental resilience, and physical conditioning.',
    focus: [
      'Shot perfection under fatigue: maintain technique in 3rd-set pressure situations',
      'Advanced serve tactics: use spin and placement to create net opportunities',
      'Physical conditioning: padel at this level requires sustained lateral speed',
      'Tournament play: register with WPR or FIP to get an official rating baseline',
    ],
  },
]

function scoreToResult(score: number): LevelResult {
  if (score <= 10) return LEVEL_RESULTS[0]
  if (score <= 20) return LEVEL_RESULTS[1]
  if (score <= 27) return LEVEL_RESULTS[2]
  return LEVEL_RESULTS[3]
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const page: React.CSSProperties = { minHeight: '100vh', background: '#f5f0e8', fontFamily: "'DM Sans',sans-serif", color: '#111', padding: '0 16px 56px' }
const inner: React.CSSProperties = { maxWidth: 460, margin: '0 auto', paddingTop: 28 }

export default function OnboardingPage() {
  const router = useRouter()

  // step: 'name' | 'assessment' | 'result' | 'availability'
  const [step, setStep]               = useState<'name'|'assessment'|'result'|'availability'>('name')
  const [name, setName]               = useState('')
  const [nameError, setNameError]     = useState('')
  const [qIndex, setQIndex]           = useState(0)
  const [answers, setAnswers]         = useState<(number|null)[]>(new Array(QUESTIONS.length).fill(null))
  const [result, setResult]           = useState<LevelResult|null>(null)
  const [score, setScore]             = useState(0)
  const [availability, setAvailability] = useState<string[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
    })
  }, [router])

  function toggleSlot(slot: string) {
    setAvailability(prev => prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot])
  }

  function selectAnswer(i: number) {
    const updated = [...answers]
    updated[qIndex] = i
    setAnswers(updated)
  }

  function nextQ() {
    if (answers[qIndex] === null) return
    if (qIndex < QUESTIONS.length - 1) {
      setQIndex(qIndex + 1)
    } else {
      const total = answers.reduce((sum, ans, qi) => sum + (ans !== null ? QUESTIONS[qi].options[ans].pts : 0), 0)
      setScore(total)
      setResult(scoreToResult(total))
      setStep('result')
    }
  }

  function prevQ() {
    if (qIndex > 0) setQIndex(qIndex - 1)
  }

  async function handleSubmit() {
    if (availability.length === 0) { setError('Pick at least one time slot'); return }
    setLoading(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const initials = name.trim().split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    const appLevel = result?.appLevel || '4'

    // Use upsert so re-attempts don't fail if profile already exists
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id, name: name.trim(), avatar: initials, level: appLevel, availability,
    }, { onConflict: 'id' })

    if (profileError) { setError(profileError.message); setLoading(false); return }

    // Use upsert for ratings too - seed with level-based starting rating
    const startingRating = appLevel === '1' ? 6.0 : appLevel === '2' ? 5.0 : appLevel === '3' ? 3.5 : 2.0
    await supabase.from('ratings').upsert({
      player_id: user.id, player_name: name.trim(), avatar: initials,
      rating: startingRating, match_count: 0,
    }, { onConflict: 'player_id' })

    // Small delay to ensure DB write completes before redirect
    setTimeout(() => router.push('/'), 500)
  }

  const pct = Math.round(((qIndex + 1) / QUESTIONS.length) * 100)
  const q = QUESTIONS[qIndex]


  // ── STEP: Name ──────────────────────────────────────────────────────────────
  if (step === 'name') return (
    <div style={page}>
      <div style={{ ...inner, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 22 }}>🎾</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#000' }}>Court Connections</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#000' }}>Welcome! Let's get you set up.</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 6, lineHeight: 1.6 }}>
            First we'll ask your name, then run a quick 11-question assessment to place you at the right level. Takes about 3 minutes.
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Your name</div>
          <input
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '13px 14px', color: '#111', fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
            placeholder="e.g. Jamie Torres"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && name.trim() && setStep('assessment')}
          />
          {nameError && <div style={{ color: '#f87171', fontSize: 13, marginTop: 6 }}>{nameError}</div>}
        </div>

        <div style={{ background: 'rgba(0,198,162,0.06)', border: '1px solid rgba(0,198,162,0.2)', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#990033', marginBottom: 4 }}>Why we assess instead of self-rate</div>
          <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
            Self-rating leads to unbalanced matches. Our 11 questions use padel-specific scenarios — wall play, shot selection, tactical positioning — to place you accurately. No ego required.
          </div>
        </div>

        <button
          onClick={() => {
            if (!name.trim()) { setNameError('Please enter your name'); return }
            setNameError(''); setStep('assessment')
          }}
          style={{ width: '100%', background: '#990033', border: 'none', borderRadius: 12, padding: '14px 0', color: '#000', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Start Assessment →
        </button>
      </div>
    </div>
  )

  // ── STEP: Assessment ─────────────────────────────────────────────────────────
  if (step === 'assessment') return (
    <div style={page}>
      <div style={{ ...inner, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Progress */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Level Assessment</span>
            <span>{qIndex + 1} / {QUESTIONS.length}</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#990033', borderRadius: 4, transition: 'width 0.3s ease' }} />
          </div>
        </div>

        <div>
          <div style={{ display: 'inline-block', fontSize: 10, color: '#990033', background: 'rgba(0,198,162,0.1)', border: '1px solid rgba(0,198,162,0.2)', borderRadius: 20, padding: '2px 10px', fontWeight: 700, marginBottom: 12 }}>
            {q.tag}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#111', lineHeight: 1.5 }}>{q.text}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => selectAnswer(i)}
              style={{
                background: answers[qIndex] === i ? 'rgba(0,198,162,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${answers[qIndex] === i ? 'rgba(0,198,162,0.5)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 12, padding: '13px 16px',
                color: answers[qIndex] === i ? '#00c6a2' : '#888',
                fontWeight: answers[qIndex] === i ? 700 : 400,
                fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'left', lineHeight: 1.5, transition: 'all 0.15s',
              }}
            >
              {opt.text}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={prevQ}
            disabled={qIndex === 0}
            style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '11px 0', color: '#666', fontWeight: 700, fontSize: 14, cursor: qIndex === 0 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: qIndex === 0 ? 0.4 : 1 }}
          >
            Back
          </button>
          <button
            onClick={nextQ}
            disabled={answers[qIndex] === null}
            style={{ flex: 2, background: answers[qIndex] !== null ? 'linear-gradient(90deg,#00c6a2,#007aff)' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10, padding: '11px 0', color: answers[qIndex] !== null ? '#fff' : '#444', fontWeight: 800, fontSize: 14, cursor: answers[qIndex] !== null ? 'pointer' : 'default', fontFamily: 'inherit' }}
          >
            {qIndex === QUESTIONS.length - 1 ? 'See my result →' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── STEP: Result ──────────────────────────────────────────────────────────────
  if (step === 'result' && result) return (
    <div style={page}>
      <div style={{ ...inner, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ textAlign: 'center', paddingTop: 8 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Assessment complete · {score}/{QUESTIONS.length * 3} points</div>
          <div style={{ display: 'inline-block', background: result.bg, color: result.color, border: `1px solid ${result.color}50`, borderRadius: 20, padding: '4px 16px', fontSize: 13, fontWeight: 800, marginBottom: 12 }}>
            {result.range}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#000', marginBottom: 4 }}>{result.name}</div>
        </div>

        {/* Score bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 6 }}>
            <span>Score</span><span>{score} / {QUESTIONS.length * 3}</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((score / (QUESTIONS.length * 3)) * 100)}%`, height: '100%', background: result.color, borderRadius: 4, transition: 'width 1s ease' }} />
          </div>
        </div>

        {/* Blurb */}
        <div style={{ background: result.bg, border: `1px solid ${result.color}30`, borderRadius: 14, padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: result.color, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Why you were placed here</div>
          <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>{result.blurb}</div>
        </div>

        {/* Focus areas */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>What to work on</div>
          {result.focus.map((f, i) => (
            <div key={i} style={{ fontSize: 13, color: '#888', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.5 }}>{f}</div>
          ))}
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', fontSize: 12, color: '#666', lineHeight: 1.5 }}>
          Your level will adjust automatically as you play matches and log results. This is just your starting point.
        </div>

        <button
          onClick={() => setStep('availability')}
          style={{ width: '100%', background: '#990033', border: 'none', borderRadius: 12, padding: '14px 0', color: '#000', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Continue to finish setup →
        </button>
      </div>
    </div>
  )

  // ── STEP: Availability ────────────────────────────────────────────────────────
  return (
    <div style={page}>
      <div style={{ ...inner, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#000' }}>One last thing, {name.split(' ')[0]}</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>When are you usually available to play?</div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            When can you play?
          </div>
          <AvailabilityPicker value={availability} onChange={setAvailability} />
        </div>

        {/* Summary card */}
        {result && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: result.bg, border: `2px solid ${result.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: result.color, fontWeight: 900, fontSize: 13, flexShrink: 0 }}>
              {name.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{name}</div>
              <div style={{ fontSize: 11, color: result.color, fontWeight: 700 }}>{result.name} · {result.range}</div>
            </div>
          </div>
        )}

        {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 13 }}>{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={loading || availability.length === 0}
          style={{ width: '100%', background: availability.length > 0 ? 'linear-gradient(90deg,#00c6a2,#007aff)' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 12, padding: '14px 0', color: availability.length > 0 ? '#fff' : '#444', fontWeight: 800, fontSize: 15, cursor: availability.length > 0 ? 'pointer' : 'default', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Setting up your profile…' : 'Enter Court Connections →'}
        </button>
      </div>
    </div>
  )
}

