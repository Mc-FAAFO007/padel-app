with open('app/ratings/page.tsx', 'r') as f:
    content = f.read()

fixes = [
    # 1. Avatar - flat style, no glow
    (
        """function Avatar({ initials, size = 40, rating }: { initials: string; size?: number; rating: number }) {
  const b = getBand(rating)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: b.bg, border: `2px solid ${b.color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: b.color, fontWeight: 900, fontSize: size * 0.32, flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}""",
        """function Avatar({ initials, size = 40, rating }: { initials: string; size?: number; rating: number }) {
  const b = getBand(rating)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: b.bg, border: `2px solid ${b.color}35`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: b.color, fontWeight: 800, fontSize: size * 0.32, flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}"""
    ),

    # 2. Header
    (
        """        {/* Header */}
        <div style={{ padding:'22px 0 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:20, fontWeight:900, color:'#014a09' }}>The Arena</div>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Ratings · Matches · Leaderboard</div>
          </div>

        </div>""",
        """        {/* Header */}
        <div style={{ padding:'22px 0 8px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:20, fontWeight:800, color:'#014a09', letterSpacing:-0.5 }}>The Arena</div>
        </div>"""
    ),

    # 3. Internal nav → pills
    (
        """        {/* Nav */}
        <div style={{ display:'flex', background:'#014a09', borderRadius:12, padding:3, marginBottom:20, gap:2 }}>
          <button style={navBtn(view==='leaderboard')} onClick={() => setView('leaderboard')}>Leaderboard</button>
          <button style={navBtn(view==='log')}         onClick={() => setView('log')}>Log Match</button>
          <button style={navBtn(view==='my')}          onClick={() => setView('my')}>My Results</button>
        </div>""",
        """        {/* Nav pills */}
        <div style={{ display:'flex', gap:6, marginBottom:16 }}>
          {(['leaderboard','log','my'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background: view===v ? '#014a09' : 'rgba(1,74,9,0.07)', color: view===v ? '#ffcc66' : 'rgba(1,74,9,0.5)', fontSize:10, fontWeight: view===v ? 700 : 600, padding:'6px 14px', borderRadius:20, cursor:'pointer', border:'none', fontFamily:'inherit', whiteSpace:'nowrap' as const }}>
              {v === 'leaderboard' ? 'Leaderboard' : v === 'log' ? 'Log Match' : 'My Results'}
            </button>
          ))}
        </div>"""
    ),

    # 4. s object - update inner padding and lbl style
    (
        "    inner: { maxWidth:480, margin:'0 auto', padding:'0 16px 56px' },\n    lbl:   { fontSize:10, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:10 },",
        "    inner: { maxWidth:480, margin:'0 auto', padding:'0 16px 80px' },\n    lbl:   { fontSize:9, fontWeight:700, color:'rgba(1,74,9,0.35)', textTransform:'uppercase' as const, letterSpacing:'1px' as const, marginBottom:8 },"
    ),

    # 5. Leaderboard row - white card style
    (
        """                  display:'flex', alignItems:'center', gap:12,
                  padding:'12px 4px', borderBottom:'1px solid rgba(1,74,9,0.08)',
                  background: isMe ? 'rgba(1,74,9,0.05)' : 'transparent',
                  borderRadius: isMe ? 8 : 0,
                  margin: isMe ? '0 -4px' : 0,
                  cursor: isMe ? 'default' : 'pointer',""",
        """                  display:'flex', alignItems:'center', gap:12,
                  padding:'11px 14px', borderRadius:12, marginBottom:6,
                  background: isMe ? 'rgba(1,74,9,0.06)' : '#fff',
                  border: isMe ? '1px solid rgba(1,74,9,0.18)' : '1px solid rgba(1,74,9,0.06)',
                  cursor: isMe ? 'default' : 'pointer',"""
    ),

    # 6. Rating bar bg
    (
        "                    <div style={{ height:4, width:60, background:'#e8e0d5', borderRadius:4, overflow:'hidden', marginTop:4 }}>",
        "                    <div style={{ height:4, width:60, background:'rgba(1,74,9,0.1)', borderRadius:4, overflow:'hidden', marginTop:4 }}>"
    ),

    # 7. My rating card - dark green
    (
        """                <div style={{ background:'rgba(2,107,13,0.06)', border:'1px solid rgba(2,107,13,0.2)', borderRadius:16, padding:'16px', display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ fontSize:40, fontWeight:900, color:'#026b0d', lineHeight:1 }}>
                    {currentUser.rating.toFixed(1)}
                  </div>
                  <div>
                    <div style={{ fontSize:12, color:'#888', marginBottom:3 }}>Your current rating</div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#014a09' }}>{currentUser.player_name}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:6 }}>
                      <ConfBadge n={myHistory.length} />
                      <span style={{ fontSize:11, color:'#888' }}>{myHistory.length} matches · rank #{myRank}</span>
                    </div>
                  </div>
                </div>""",
        """                <div style={{ background:'#014a09', borderRadius:16, padding:'16px', display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ fontSize:40, fontWeight:900, color:'#ffcc66', lineHeight:1 }}>
                    {currentUser.rating.toFixed(1)}
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:'rgba(255,204,102,0.6)', marginBottom:3 }}>Your current rating</div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{currentUser.player_name}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:6 }}>
                      <ConfBadge n={myHistory.length} />
                      <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>{myHistory.length} matches · rank #{myRank}</span>
                    </div>
                  </div>
                </div>"""
    ),

    # 8. Stats mini cards
    (
        "                      <div style={{ flex:1, background:'#f5f5f1', borderRadius:14, padding:'12px' }}>",
        "                      <div style={{ flex:1, background:'#fff', borderRadius:12, padding:'12px', textAlign:'center' as const }}>"
    ),

    # 9. Stats mini card labels
    (
        "                        <div style={{ fontSize:11, color:'#888', textTransform:'uppercase', marginBottom:6 }}>Matches</div>",
        "                        <div style={{ fontSize:9, color:'rgba(1,74,9,0.4)', textTransform:'uppercase' as const, letterSpacing:'0.8px', marginBottom:4 }}>Matches</div>"
    ),
    (
        "                        <div style={{ fontSize:11, color:'#888', textTransform:'uppercase', marginBottom:6 }}>Currently</div>",
        "                        <div style={{ fontSize:9, color:'rgba(1,74,9,0.4)', textTransform:'uppercase' as const, letterSpacing:'0.8px', marginBottom:4 }}>Current</div>"
    ),
    (
        "                        <div style={{ fontSize:11, color:'#888', textTransform:'uppercase', marginBottom:6 }}>Trend</div>",
        "                        <div style={{ fontSize:9, color:'rgba(1,74,9,0.4)', textTransform:'uppercase' as const, letterSpacing:'0.8px', marginBottom:4 }}>Trend</div>"
    ),
    (
        "                        <div style={{ fontSize:22, fontWeight:900, color:'#014a09' }}>{myRatingTimeline.length}</div>",
        "                        <div style={{ fontSize:20, fontWeight:800, color:'#014a09' }}>{myRatingTimeline.length}</div>"
    ),
    (
        "                        <div style={{ fontSize:22, fontWeight:900, color:'#014a09' }}>{myRatingTimeline[myRatingTimeline.length-1].rating.toFixed(1)}</div>",
        "                        <div style={{ fontSize:20, fontWeight:800, color:'#014a09' }}>{myRatingTimeline[myRatingTimeline.length-1].rating.toFixed(1)}</div>"
    ),

    # 10. Rating graph bg
    (
        "                      <div style={{ background:'#f7f2e8', borderRadius:16, padding:'14px', overflowX:'auto' }}>",
        "                      <div style={{ background:'rgba(1,74,9,0.04)', borderRadius:16, padding:'14px', overflowX:'auto' }}>"
    ),

    # 11. Match history cards
    (
        """                    <div key={m.id} style={{
                      background:'#fff', border:`1px solid ${won?'rgba(0,102,51,0.3)':'rgba(153,0,51,0.3)'}`,
                      borderLeft:`3px solid ${won?'#006633':'#990033'}`, borderRadius:12, padding:'12px 14px', marginBottom:6,
                    }}>""",
        """                    <div key={m.id} style={{
                      background:'#fff', borderLeft:`3px solid ${won?'#006633':'#990033'}`,
                      borderRadius:'0 14px 14px 0', padding:'12px 14px', paddingLeft:11, marginBottom:6,
                    }}>"""
    ),

    # 12. Rating preview card
    (
        "            <div style={{ background:'#fff', border:'1px solid rgba(1,74,9,0.15)', borderRadius:12, padding:'12px 14px' }}>",
        "            <div style={{ background:'#fff', borderRadius:16, padding:'12px 14px' }}>"
    ),

    # 13. Player picker wrapper card
    (
        "                <div style={{ background:'#fff', border:'1px solid #e0d8cc', borderRadius:12, padding:'10px 12px' }}>",
        "                <div style={{ background:'#fff', borderRadius:16, padding:'10px 12px' }}>"
    ),

    # 14. Player picker buttons
    (
        "                        <button key={r.id} onClick={() => assignPlayer(r)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#fff', border:'1px solid #e0d8cc', borderRadius:10, cursor:'pointer', fontFamily:'inherit' }}>",
        "                        <button key={r.id} onClick={() => assignPlayer(r)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'rgba(1,74,9,0.04)', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'inherit', width:'100%', textAlign:'left' as const }}>"
    ),

    # 15. Pool drag cards
    (
        "                    <div key={r.player_id} draggable onDragStart={(e) => handleDragStart(e, r)} style={{ background:'#fff', border:'1px solid rgba(1,74,9,0.2)', borderRadius:11, padding:'10px 12px', display:'flex', alignItems:'center', gap:8, cursor:'grab', transition:'opacity 0.2s', opacity: draggedPlayer?.player_id === r.player_id ? 0.5 : 1 }}>",
        "                    <div key={r.player_id} draggable onDragStart={(e) => handleDragStart(e, r)} style={{ background:'#fff', borderRadius:12, padding:'10px 12px', display:'flex', alignItems:'center', gap:8, cursor:'grab', transition:'opacity 0.2s', opacity: draggedPlayer?.player_id === r.player_id ? 0.5 : 1 }}>"
    ),

    # 16. Player viewing modal bg
    (
        "            <div onClick={e => e.stopPropagation()} style={{ background:'#f5f0e8', borderRadius:'20px 20px 0 0', padding:'24px 20px 40px', width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>",
        "            <div onClick={e => e.stopPropagation()} style={{ background:'#f5f0e8', borderRadius:'20px 20px 0 0', padding:'24px 20px 40px', width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>"
    ),

    # 17. Viewing player rating card
    (
        "              <div style={{ background:'#014a09', border:'1px solid #026b0d', borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:16 }}>",
        "              <div style={{ background:'#014a09', borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:16 }}>"
    ),
]

applied = 0
failed = []
for old, new in fixes:
    if old in content:
        content = content.replace(old, new)
        applied += 1
    else:
        failed.append(old[:80].strip())

with open('app/ratings/page.tsx', 'w') as f:
    f.write(content)

print(f"Applied {applied}/{len(fixes)} fixes")
if failed:
    print(f"\nFailed ({len(failed)}):")
    for f in failed:
        print(f"  - {repr(f)}")

