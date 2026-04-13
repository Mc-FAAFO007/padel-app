'use client'
import { useState } from 'react'

export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const
export const PERIODS = ['Morning','Afternoon','Evening'] as const
export type Day = typeof DAYS[number]
export type Period = typeof PERIODS[number]

export function encodeSlot(day: Day, period: Period): string {
  return `${day.slice(0,3)} ${period}`
}

const PERIOD_COLOR: Record<Period, { active: string; activeBg: string; dot: string }> = {
  Morning:   { active: '#cc9900', activeBg: 'rgba(204,153,0,0.12)',   dot: '#cc9900' },
  Afternoon: { active: '#990033', activeBg: 'rgba(153,0,51,0.12)',   dot: '#990033' },
  Evening:   { active: '#000099', activeBg: 'rgba(0,0,153,0.10)',    dot: '#000099' },
}

interface Props {
  value: string[]
  onChange: (slots: string[]) => void
}

export default function AvailabilityPicker({ value, onChange }: Props) {
  const [openDays, setOpenDays] = useState<Record<string,boolean>>({})

  function toggleDay(day: Day) {
    setOpenDays(prev => ({ ...prev, [day]: !prev[day] }))
  }

  function toggleSlot(day: Day, period: Period) {
    const slot = encodeSlot(day, period)
    onChange(value.includes(slot) ? value.filter(s => s !== slot) : [...value, slot])
  }

  function hasPeriod(day: Day, period: Period) {
    return value.includes(encodeSlot(day, period))
  }

  function hasAny(day: Day) {
    return PERIODS.some(p => hasPeriod(day, p))
  }

  const totalSelected = value.length
  const daysWithSlots = DAYS.filter(d => hasAny(d)).length

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
      {DAYS.map(day => {
        const isOpen = openDays[day] ?? false
        const selected = hasAny(day)
        return (
          <div key={day} style={{
            borderRadius:12, overflow:'hidden',
            border:`1px solid ${selected ? 'rgba(2,107,13,0.3)' : '#ddd'}`,
            borderLeft:`3px solid ${selected ? '#026b0d' : 'transparent'}`,
          }}>
            <button onClick={() => toggleDay(day)} style={{
              width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'12px 14px',
              background: selected ? 'rgba(2,107,13,0.05)' : 'rgba(0,0,0,0.02)',
              border:'none', cursor:'pointer', fontFamily:'inherit',
            }}>
              <span style={{ fontSize:14, fontWeight:700, color: selected ? '#026b0d' : '#111' }}>
                {day}
              </span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ display:'flex', gap:4 }}>
                  {PERIODS.map(p => (
                    <div key={p} style={{
                      width:6, height:6, borderRadius:'50%',
                      background: hasPeriod(day, p) ? PERIOD_COLOR[p].dot : '#ccc',
                      transition:'background 0.15s'
                    }} />
                  ))}
                </div>
                <span style={{
                  fontSize:10, color:'#555', display:'inline-block',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition:'transform 0.2s'
                }}>▼</span>
              </div>
            </button>
            {isOpen && (
              <div style={{
                padding:'10px 12px 12px', background:'#ede8e0',
                display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7
              }}>
                {PERIODS.map(period => {
                  const on = hasPeriod(day, period)
                  const c = PERIOD_COLOR[period]
                  return (
                    <button key={period} onClick={() => toggleSlot(day, period)} style={{
                      padding:'10px 0', borderRadius:9,
                      fontSize:12, fontWeight:700, cursor:'pointer',
                      fontFamily:'inherit', textAlign:'center',
                      border:`1px solid ${on ? c.active+'80' : '#ddd'}`,
                      background: on ? c.activeBg : 'rgba(0,0,0,0.03)',
                      color: on ? c.active : '#555',
                      transition:'all 0.15s',
                    }}>
                      {period}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      <div style={{
        padding:'10px 14px', borderRadius:10, marginTop:2,
        background: totalSelected > 0 ? 'rgba(2,107,13,0.06)' : 'rgba(0,0,0,0.03)',
        border:`1px solid ${totalSelected > 0 ? 'rgba(2,107,13,0.2)' : '#ddd'}`,
        fontSize:12, fontWeight:600,
        color: totalSelected > 0 ? '#026b0d' : '#888',
      }}>
        {totalSelected === 0
          ? 'Tap a day to select your availability'
          : `${totalSelected} slot${totalSelected!==1?'s':''} selected across ${daysWithSlots} day${daysWithSlots!==1?'s':''}`
        }
      </div>
    </div>
  )
}
