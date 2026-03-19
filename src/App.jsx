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
import { markQuizComplete, unlockArea, advanceYear, syncTotalScore, resetUserProgress, sellStock } from './firebase/firestore'
import { ASSET_ORDER } from './data/assetData'
import { GAME_END_YEAR, GAME_START_YEAR, DISTRICT_INSTRUMENTS } from './data/stockData'

function CityApp() {
  const { user, userData, loading, refreshUserData, streakData, clearStreakData } = useAuth()
  const [modal, setModal] = useState(null)
  const [speedMode, setSpeedMode] = useState(false)
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

      <div className="absolute inset-0 pt-12">
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
        />
      </div>

      {/* Bottom status bar */}
      <div className="absolute bottom-0 left-0 right-0 px-6 py-3 bg-slate-900/70 backdrop-blur border-t border-slate-700/50 flex items-center justify-between z-20">
        <div className="text-slate-400 text-xs">
          {allUnlocked
            ? 'All markets unlocked. Click any district to trade.'
            : unlockedAreas.length === 0
            ? 'Welcome. Open the Library to learn about bonds and earn your first CHF.'
            : `${ASSET_ORDER.length - unlockedAreas.length} market${ASSET_ORDER.length - unlockedAreas.length !== 1 ? 's' : ''} locked. Keep learning in the Library.`
          }
        </div>
        <div className="flex gap-2">
          {ASSET_ORDER.map(id => (
            <div
              key={id}
              className={`w-2 h-2 rounded-full transition-all ${unlockedAreas.includes(id) ? 'bg-green-400' : 'bg-slate-700'}`}
              title={id}
            />
          ))}
        </div>
      </div>

      <StreakModal streakData={streakData} onClose={() => { clearStreakData(); refreshUserData() }} />
      <FireDrillModal fireDrill={fireDrill} onClose={() => setFireDrill(null)} />

      {modal === 'library' && (
        <LibraryModal onClose={() => setModal(null)} unlockedAreas={unlockedAreas} onUnlock={handleUnlock} />
      )}
      {modal?.market && (
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
      {modal === 'leaderboard' && <Leaderboard onClose={() => setModal(null)} />}
      {modal === 'portfolio' && (
        <PortfolioModal
          onClose={() => setModal(null)}
          portfolio={portfolio}
          cash={cash}
          currentYear={currentYear}
        />
      )}
      {modal === 'museum' && (
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
      {modal === 'assetManager' && (
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

export default function App() {
  return <AuthProvider><CityApp /></AuthProvider>
}
