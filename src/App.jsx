import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import AuthPage from './components/auth/AuthPage'
import CityMap from './components/city/CityMap'
import Header from './components/ui/Header'
import LibraryModal from './components/library/LibraryModal'
import MarketModal from './components/market/MarketModal'
import Leaderboard from './components/leaderboard/Leaderboard'
import StreakModal from './components/ui/StreakModal'
import FireDrillModal from './components/ui/FireDrillModal'
import MuseumModal from './components/ui/MuseumModal'
import PortfolioModal from './components/ui/PortfolioModal'
import { markQuizComplete, unlockArea, advanceYear, syncTotalScore, resetUserProgress, sellStock, getPrice } from './firebase/firestore'
import { ASSET_ORDER } from './data/assetData'
import { GAME_END_YEAR, GAME_START_YEAR, DISTRICT_INSTRUMENTS } from './data/stockData'

function CityApp() {
  const { user, userData, loading, refreshUserData, streakData, clearStreakData } = useAuth()
  const [modal, setModal] = useState(null)
  const [speedMode, setSpeedMode] = useState(false)
  const [adMode, setAdMode] = useState(false)
  const [adElapsed, setAdElapsed] = useState(0)
  const YEAR_INTERVAL_MS = speedMode ? 500 : 5000

  // ── Year state (managed locally for instant UI, synced to Firebase async) ──
  const [currentYear, setCurrentYear] = useState(GAME_START_YEAR)
  const [yearProgress, setYearProgress] = useState(0) // 0–1 for countdown bar
  const yearInitialized = useRef(false)

  // Initialize year from Firebase once when userData first loads
  useEffect(() => {
    if (userData && !yearInitialized.current) {
      setCurrentYear(userData.currentYear ?? GAME_START_YEAR)
      yearInitialized.current = true
    }
  }, [userData])

  const [simPaused, setSimPaused] = useState(true)
  const [portfolioHistory, setPortfolioHistory] = useState([])

  // Track net worth each year for the mini chart
  useEffect(() => {
    if (!userData) return
    const p = userData?.portfolio || {}
    const c = userData?.cash ?? userData?.capital ?? 0
    let pv = 0
    for (const [instId, h] of Object.entries(p)) {
      if ((h.shares || 0) > 0) pv += h.shares * getPrice(instId, currentYear)
    }
    const netWorth = c + pv
    setPortfolioHistory(prev => {
      if (prev.length > 0 && prev[prev.length - 1].year === currentYear) {
        return prev.map(pt => pt.year === currentYear ? { year: currentYear, value: netWorth } : pt)
      }
      return [...prev, { year: currentYear, value: netWorth }]
    })
  }, [currentYear, userData])

  // ── Ad mode ────────────────────────────────────────────────────────────────
  // Toggle with 'A' key; tracks elapsed time for overlay text phases
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setAdMode(m => !m)
        setAdElapsed(0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!adMode) { setAdElapsed(0); return }
    const id = setInterval(() => setAdElapsed(t => Math.min(15, t + 0.1)), 100)
    return () => clearInterval(id)
  }, [adMode])

  // Auto-advance year every YEAR_INTERVAL_MS (only when not paused)
  useEffect(() => {
    if (!user || loading || simPaused) return

    // Progress bar animation
    const progressId = setInterval(() => {
      setYearProgress(p => (p + 0.05) % 1)
    }, YEAR_INTERVAL_MS * 0.05)

    // Year advance
    const yearId = setInterval(() => {
      setCurrentYear(y => {
        if (y >= GAME_END_YEAR) return y
        const next = y + 1
        advanceYear(user.uid, next).catch(console.error)
        if (next >= GAME_END_YEAR) syncTotalScore(user.uid).catch(console.error)
        return next
      })
      setYearProgress(0)
    }, YEAR_INTERVAL_MS)

    return () => { clearInterval(progressId); clearInterval(yearId) }
  }, [user?.uid, loading, simPaused, YEAR_INTERVAL_MS])

  // ── Hooks before early returns ─────────────────────────────────────────────
  const unlockedAreas = userData?.unlockedAreas || []
  const cash          = userData?.cash ?? userData?.capital ?? 10000
  const portfolio     = userData?.portfolio || {}
  const allUnlocked   = unlockedAreas.length >= ASSET_ORDER.length

  // ── Monument state ─────────────────────────────────────────────────────────
  const [placingMonument, setPlacingMonument] = useState(null) // { type, slotId } | null
  const [placedMonuments, setPlacedMonuments] = useState([null, null]) // [slot1, slot2]

  const handlePlaceMonument = (type, slotId) => {
    setPlacingMonument({ type, slotId })
  }
  const handleMonumentPlaced = (pos) => {
    if (!placingMonument) return
    const { type, slotId } = placingMonument
    setPlacedMonuments(prev => {
      const next = [...prev]
      next[slotId - 1] = { type, pos }
      return next
    })
    setPlacingMonument(null)
  }
  const handleRemoveMonument = (slotId) => {
    setPlacedMonuments(prev => {
      const next = [...prev]
      next[slotId - 1] = null
      return next
    })
  }

  // ── Fire drill state ───────────────────────────────────────────────────────
  const [fireDrill, setFireDrill] = useState(null) // null | { phase, burning, plan, tick, diversifiedCount, missingDistricts }

  const diversifiedDistricts = useMemo(() =>
    ASSET_ORDER.filter(d => (DISTRICT_INSTRUMENTS[d] || []).some(id => (portfolio[id]?.shares || 0) > 0)),
    [portfolio]
  )
  const missingDistricts = useMemo(() => ASSET_ORDER.filter(d => !diversifiedDistricts.includes(d)), [diversifiedDistricts])

  const startFireDrill = useCallback(() => {
    const allHeld = Object.entries(portfolio)
      .filter(([, h]) => h.shares > 0)
      .map(([id]) => id)
      .sort(() => Math.random() - 0.5) // shuffle

    const count = diversifiedDistricts.length
    const burnFraction = count === 0 ? 0 : count === 1 ? 0.50 : count === 2 ? 0.35 : count === 3 ? 0.20 : count === 4 ? 0.10 : count === 5 ? 0.03 : 0
    // plan = which instruments will fully burn (fraction of all held)
    const plan = allHeld.slice(0, Math.round(allHeld.length * burnFraction))

    setFireDrill({
      phase: 'running',
      burning: new Set(plan.slice(0, 1)),
      plan,
      tick: 0,
      diversifiedCount: count,
      missingDistricts,
    })
  }, [portfolio, diversifiedDistricts, missingDistricts])

  // Spread fires every 3 seconds while drill is running
  useEffect(() => {
    if (!fireDrill || fireDrill.phase !== 'running') return
    const TICK_MS = 3000
    const TOTAL_TICKS = 4
    const id = setInterval(() => {
      setFireDrill(prev => {
        if (!prev || prev.phase !== 'running') return prev
        const newTick = prev.tick + 1
        const revealUntil = Math.ceil(prev.plan.length * (newTick / (TOTAL_TICKS - 1)))
        const newBurning = new Set(prev.plan.slice(0, revealUntil))
        if (newTick >= TOTAL_TICKS) return { ...prev, phase: 'result', burning: newBurning, tick: newTick }
        return { ...prev, burning: newBurning, tick: newTick }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [fireDrill?.phase])

  // When drill ends → actually burn the assets (sell all shares in burning buildings)
  useEffect(() => {
    if (!fireDrill || fireDrill.phase !== 'result' || !user) return
    if (fireDrill.assetsLost) return  // prevent double-burn
    if (fireDrill.burning.size === 0) return

    setFireDrill(prev => prev ? { ...prev, assetsLost: true } : prev)

    Promise.all(
      [...fireDrill.burning].map(instId =>
        sellStock(user.uid, instId, null).catch(() => {})  // null = sell all
      )
    ).then(() => refreshUserData()).catch(console.error)
  }, [fireDrill?.phase])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-lg font-bold animate-pulse" style={{ color: '#FFD000' }}>Loading Investopia...</div>
      </div>
    )
  }

  if (!user) return <AuthPage />

  const handleAreaClick = (areaId) => {
    if (!unlockedAreas.includes(areaId)) {
      setModal('library')
    } else {
      setModal({ market: areaId })
    }
  }

  const handleUnlock = async (moduleId, correctCount) => {
    if (!user) return
    try {
      await markQuizComplete(user.uid, moduleId, correctCount)
      if (correctCount >= 3 && !unlockedAreas.includes(moduleId)) {
        await unlockArea(user.uid, moduleId)
      }
      await refreshUserData()
    } catch (e) {
      console.error('Error unlocking:', e)
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* ── Ad mode full-screen overlay ──────────────────────────────────────── */}
      {adMode && (() => {
        const phase = adElapsed < 1.0 ? 0 : adElapsed < 3.0 ? 1 : adElapsed < 5.0 ? 2 : adElapsed < 10.0 ? 3 : 4
        const phrases = [
          'Investopia',
          'Discover every asset class',
          'Build your portfolio from scratch',
          'Grow your own city with a diversified portfolio',
          '',   // final phase — big title takes over
        ]
        const finalPhase    = adElapsed >= 10.0
        const darkenOpacity = finalPhase ? Math.min(0.62, (adElapsed - 10.0) / 2.5) : 0
        const titleOpacity  = finalPhase ? Math.min(1, (adElapsed - 10.0) / 1.5) : 0
        const subOpacity    = finalPhase ? Math.min(1, (adElapsed - 11.3) / 1.0) : 0

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none' }}>

            {/* ── Darkening vignette (final phase) ── */}
            <div style={{
              position: 'absolute', inset: 0,
              background: `rgba(0,0,0,${darkenOpacity})`,
              transition: 'background 0.3s',
            }} />

            {/* ── INVESTOPIA title (final phase) ── */}
            {finalPhase && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 10,
              }}>
                <div style={{
                  fontSize: 78, fontWeight: 900, letterSpacing: '0.1em',
                  color: '#FFD000',
                  textShadow: '0 0 60px #FFD000BB, 0 0 20px #FFD00077',
                  fontFamily: 'Arial Black, Impact, sans-serif',
                  opacity: titleOpacity,
                  transition: 'opacity 0.3s',
                }}>
                  INVESTOPIA
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 600, letterSpacing: '0.22em',
                  color: 'white', textTransform: 'uppercase',
                  textShadow: '0 2px 12px rgba(0,0,0,0.9)',
                  opacity: subOpacity,
                  transition: 'opacity 0.3s',
                }}>
                  by PostFinance
                </div>
              </div>
            )}

            {/* ── Top branding bar ── */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              padding: '18px 28px', display: 'flex', alignItems: 'center', gap: 14,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: '#FFD000', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 18, color: '#1a1200',
              }}>P</div>
              <span style={{ color: '#FFD000', fontWeight: 800, fontSize: 20, letterSpacing: '0.04em' }}>
                PostFinance
              </span>
            </div>

            {/* ── Bottom phrase + progress bar ── */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '0 0 32px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent)',
              opacity: finalPhase ? 0 : 1,
              transition: 'opacity 0.8s',
            }}>
              <div style={{
                textAlign: 'center', color: 'white',
                fontSize: 28, fontWeight: 800, letterSpacing: '0.02em',
                textShadow: '0 2px 16px rgba(0,0,0,0.8)',
                marginBottom: 18,
              }}>
                {phrases[phase]}
              </div>
              <div style={{ margin: '0 auto', width: 220, height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: '#FFD000',
                  width: `${(adElapsed / 15) * 100}%`,
                  transition: 'width 0.1s linear',
                }} />
              </div>
            </div>

            {/* ── Exit button ── */}
            <button
              style={{
                position: 'absolute', top: 18, right: 22,
                background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.25)',
                color: 'white', borderRadius: 8, padding: '6px 14px',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', pointerEvents: 'all',
              }}
              onClick={() => setAdMode(false)}
            >
              Exit ✕
            </button>
          </div>
        )
      })()}

      {!adMode && (
        <Header
          onOpenLeaderboard={() => setModal('leaderboard')}
          onOpenLibrary={() => setModal('library')}
          currentYear={currentYear}
          yearProgress={simPaused ? 0 : yearProgress}
          isFinished={currentYear >= GAME_END_YEAR}
          simPaused={simPaused}
          onToggleSim={() => setSimPaused(p => !p)}
          speedMode={speedMode}
          onToggleSpeed={() => setSpeedMode(m => !m)}
          onRestart={() => {
            setCurrentYear(GAME_START_YEAR)
            setYearProgress(0)
            setSimPaused(true)
            advanceYear(user.uid, GAME_START_YEAR).catch(console.error)
          }}
          onNewGame={async () => {
            if (!window.confirm('Start a brand new game? This resets your cash, portfolio and year — it cannot be undone.')) return
            await resetUserProgress(user.uid)
            setCurrentYear(GAME_START_YEAR)
            setYearProgress(0)
            setSimPaused(true)
            yearInitialized.current = false
            await refreshUserData()
          }}
          onFireDrill={startFireDrill}
        />
      )}

      <div className={`absolute inset-0 ${adMode ? '' : 'pt-12'}`}>
        <CityMap
          unlockedAreas={unlockedAreas}
          cash={cash}
          portfolio={portfolio}
          currentYear={currentYear}
          onAreaClick={handleAreaClick}
          onLibraryClick={() => setModal('library')}
          onPortfolioClick={() => setModal('portfolio')}
          onMuseumClick={() => setModal('museum')}
          showLabels={modal === null && !fireDrill}
          assetManagerUnlocked={userData?.assetManagerUnlocked ?? false}
          fireDrillBurning={fireDrill?.burning}
          fireDrillPhase={fireDrill?.phase ?? null}
          placingMonument={placingMonument?.type ?? null}
          placedMonuments={placedMonuments}
          onMonumentPlaced={handleMonumentPlaced}
          adMode={adMode}
        />
      </div>

      {/* Bottom status bar */}
      {!adMode && (
        <div className="absolute bottom-0 left-0 right-0 px-6 py-3 bg-slate-900/70 backdrop-blur border-t border-slate-700/50 flex items-center justify-between z-20">
          <div className="text-slate-400 text-xs">
            {allUnlocked
              ? 'All markets unlocked. Click any district to trade.'
              : unlockedAreas.length === 0
              ? 'Welcome. Open the Library to learn about bonds and earn your first CHF.'
              : `${ASSET_ORDER.length - unlockedAreas.length} market${ASSET_ORDER.length - unlockedAreas.length !== 1 ? 's' : ''} locked. Keep learning in the Library.`
            }
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              {ASSET_ORDER.map(id => (
                <div
                  key={id}
                  className={`w-2 h-2 rounded-full transition-all ${unlockedAreas.includes(id) ? 'bg-green-400' : 'bg-slate-700'}`}
                  title={id}
                />
              ))}
            </div>
            <button
              onClick={() => { setAdMode(true); setAdElapsed(0) }}
              className="text-xs font-bold px-3 py-1 rounded-lg border transition-all"
              style={{ background: '#FFD000', color: '#1a1200', borderColor: '#FFD000' }}
              title="Launch 15-second ad mode (or press A)"
            >
              🎬 Ad
            </button>
          </div>
        </div>
      )}

      {!adMode && <StreakModal streakData={streakData} onClose={() => { clearStreakData(); refreshUserData() }} />}
      {!adMode && <FireDrillModal fireDrill={fireDrill} onClose={() => setFireDrill(null)} />}

      {!adMode && modal === 'library' && (
        <LibraryModal onClose={() => setModal(null)} unlockedAreas={unlockedAreas} onUnlock={handleUnlock} />
      )}
      {!adMode && modal?.market && (
        <MarketModal
          uid={user.uid}
          districtId={modal.market}
          currentYear={currentYear}
          cash={cash}
          portfolio={portfolio}
          onClose={() => setModal(null)}
          onRefresh={refreshUserData}
        />
      )}
      {!adMode && modal === 'leaderboard' && <Leaderboard onClose={() => setModal(null)} />}
      {!adMode && modal === 'portfolio' && (
        <PortfolioModal
          onClose={() => setModal(null)}
          portfolio={portfolio}
          cash={cash}
          currentYear={currentYear}
        />
      )}
      {!adMode && modal === 'museum' && (
        <MuseumModal
          onClose={() => setModal(null)}
          userData={userData}
          portfolio={portfolio}
          currentYear={currentYear}
          onPlaceMonument={handlePlaceMonument}
          onRemoveMonument={handleRemoveMonument}
          placedMonuments={placedMonuments}
        />
      )}
      {/* Mini portfolio chart — bottom right, always visible during simulation */}
      {!adMode && portfolioHistory.length >= 2 && (
        <MiniPortfolioChart history={portfolioHistory} />
      )}

      {!adMode && modal === 'assetManager' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-slate-900 border border-amber-500/40 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
            <h2 className="text-white text-xl font-bold mb-2">Asset Manager HQ</h2>
            <p className="text-slate-400 text-sm mb-4">Advanced portfolio quizzes coming soon.</p>
            <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl px-4 py-3 mb-6 text-xs text-amber-300">Under construction</div>
            <button onClick={() => setModal(null)} className="w-full font-bold py-3 rounded-xl transition-colors" style={{ background: '#FFD000', color: '#1a1200' }}>Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniPortfolioChart({ history }) {
  const W = 200, H = 70, PX = 8, PY = 6
  const vals = history.map(p => p.value)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)
  const range = maxV - minV || 1

  const toX = i => PX + (i / (history.length - 1)) * (W - PX * 2)
  const toY = v => PY + (1 - (v - minV) / range) * (H - PY * 2)

  const pts = history.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ')
  const fillPts = `${toX(0)},${H} ${pts} ${toX(history.length - 1)},${H}`

  const first = vals[0]
  const last = vals[vals.length - 1]
  const pct = ((last - first) / first) * 100
  const isUp = pct >= 0
  const col = isUp ? '#4ade80' : '#f87171'

  return (
    <div style={{
      position: 'fixed', bottom: 56, right: 16, zIndex: 20,
      background: 'rgba(13,17,23,0.92)', backdropFilter: 'blur(8px)',
      border: `1px solid ${col}44`, borderRadius: 14,
      padding: '8px 10px', width: 220,
      boxShadow: '0 8px 32px #00000088',
      fontFamily: 'system-ui, sans-serif',
      pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#ffffff66', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Net Worth</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: col }}>
          {isUp ? '+' : ''}{pct.toFixed(1)}%
        </span>
      </div>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        <polygon points={fillPts} fill={col + '22'} />
        <polyline points={pts} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={toX(history.length - 1)} cy={toY(last)} r={3} fill={col} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 9, color: '#ffffff44' }}>
        <span>{history[0].year}</span>
        <span style={{ color: '#ffffffBB', fontWeight: 600, fontSize: 10 }}>
          CHF {Math.round(last).toLocaleString('de-CH')}
        </span>
        <span>{history[history.length - 1].year}</span>
      </div>
    </div>
  )
}

export default function App() {
  return <AuthProvider><CityApp /></AuthProvider>
}
