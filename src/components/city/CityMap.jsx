import { useState, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import CityScene, { DISTRICT_CFG } from './CityScene'
import { INSTRUMENTS, GAME_START_YEAR } from '../../data/stockData'
import { getPrice } from '../../firebase/firestore'

function AreaTooltip({ area, unlocked }) {
  const cfg = DISTRICT_CFG[area]
  if (!cfg) return null
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/96 border border-slate-200 rounded-xl px-5 py-3 pointer-events-none z-20 min-w-[220px] text-center shadow-lg">
      <div className="font-bold text-slate-800 text-sm">{cfg.icon} {cfg.label}</div>
      <div className="text-slate-500 text-xs mt-1">{cfg.description}</div>
      {!unlocked && <div className="text-amber-600 text-xs mt-2 font-semibold">Complete quiz to unlock</div>}
      {unlocked  && <div className="text-green-600 text-xs mt-2 font-semibold">Click temple to open market</div>}
    </div>
  )
}

// ── 2D stock chart panel (rendered outside Canvas so clicks always work) ──────
function StockChartPanel({ instId, name, currentYear, onClose }) {
  const prices = []
  for (let y = GAME_START_YEAR; y <= currentYear; y++) {
    const p = getPrice(instId, y)
    if (p) prices.push({ year: y, price: p })
  }

  if (prices.length < 2) return null

  const minP = Math.min(...prices.map(p => p.price))
  const maxP = Math.max(...prices.map(p => p.price))
  const W = 320, H = 140, PAD = 10

  const toX = i => PAD + (i / (prices.length - 1)) * (W - PAD * 2)
  const toY = p => PAD + (1 - (p - minP) / Math.max(0.001, maxP - minP)) * (H - PAD * 2)

  const linePts = prices.map((p, i) => `${toX(i)},${toY(p.price)}`).join(' ')
  const fillPts = `${toX(0)},${H} ${linePts} ${toX(prices.length - 1)},${H}`

  const first = prices[0].price
  const last  = prices[prices.length - 1].price
  const pct   = ((last / first) - 1) * 100
  const col   = pct >= 0 ? '#4ade80' : '#f87171'
  const fmt   = n => n >= 10 ? n.toFixed(2) : n.toFixed(4)

  // Year tick marks every ~4 years
  const tickYears = prices.filter((_, i) => i === 0 || i === prices.length - 1 || prices[i].year % 4 === 0)

  return (
    <div style={{
      position: 'absolute', bottom: 24, right: 24, zIndex: 40,
      background: '#0f172a', border: `2px solid ${col}55`,
      borderRadius: 16, padding: '16px 18px', width: 370,
      boxShadow: '0 16px 48px #000000BB',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ color: 'white', fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>{name}</div>
          <div style={{ color: col, fontWeight: 700, fontSize: 14, marginTop: 3 }}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}% since {GAME_START_YEAR}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            color: '#94a3b8', background: 'rgba(255,255,255,0.08)',
            border: '1px solid #334155', borderRadius: 8,
            cursor: 'pointer', fontSize: 20, lineHeight: 1,
            padding: '2px 9px', marginLeft: 12,
          }}
        >×</button>
      </div>

      {/* Chart */}
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        {/* Horizontal grid */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f}
            x1={PAD} y1={PAD + f * (H - PAD * 2)}
            x2={W - PAD} y2={PAD + f * (H - PAD * 2)}
            stroke="#1e293b" strokeWidth={1} />
        ))}
        {/* Fill under line */}
        <polygon points={fillPts} fill={col + '20'} />
        {/* Price line */}
        <polyline points={linePts} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" />
        {/* Start dot */}
        <circle cx={toX(0)} cy={toY(first)} r={4} fill="#94a3b8" />
        {/* End dot */}
        <circle cx={toX(prices.length - 1)} cy={toY(last)} r={5} fill={col} />
      </svg>

      {/* X-axis year labels */}
      <div style={{ position: 'relative', height: 16, marginTop: 4 }}>
        {tickYears.map((p, i) => {
          const idx = prices.indexOf(p)
          const x = toX(idx)
          return (
            <span key={p.year} style={{
              position: 'absolute', left: x, transform: 'translateX(-50%)',
              fontSize: 10, color: '#64748b', whiteSpace: 'nowrap',
            }}>{p.year}</span>
          )
        })}
      </div>

      {/* Footer prices */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12 }}>
        <span style={{ color: '#64748b' }}>{GAME_START_YEAR}: CHF {fmt(first)}</span>
        <span style={{ color: 'white', fontWeight: 600 }}>{currentYear}: CHF {fmt(last)}</span>
      </div>
    </div>
  )
}

export default function CityMap({
  unlockedAreas, cash = 10000, portfolio = {}, currentYear = 2007,
  onAreaClick, onLibraryClick, onPortfolioClick, onMuseumClick,
  showLabels = true, assetManagerUnlocked = false, fireDrillBurning, fireDrillPhase,
  placingMonument = null, placedMonuments = [], onMonumentPlaced,
}) {
  const [hovered, setHovered]             = useState(null)
  const [selectedStock, setSelectedStock] = useState(null) // { instId, name }
  const [showDistrictLabels, setShowDistrictLabels] = useState(false)

  const handleAreaClick      = useCallback((id) => onAreaClick(id),    [onAreaClick])
  const handleLibraryClick   = useCallback(() => onLibraryClick(),     [onLibraryClick])
  const handlePortfolioClick = useCallback(() => onPortfolioClick?.(), [onPortfolioClick])
  const handleMuseumClick    = useCallback(() => onMuseumClick?.(),    [onMuseumClick])
  const handleStockSelect    = useCallback(({ instId, name }) => {
    setSelectedStock(prev => prev?.instId === instId ? null : { instId, name })
  }, [])

  return (
    <div className="relative w-full h-full" style={{ background: '#87CEEB' }}>
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 62, 56]} fov={44} />
        <OrbitControls
          target={[0, 2, 0]}
          minDistance={22}
          maxDistance={320}
          maxPolarAngle={Math.PI / 2.12}
          minPolarAngle={0.12}
          enableDamping
          dampingFactor={0.08}
          enablePan
          panSpeed={1.4}
          mouseButtons={{
            LEFT:   THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT:  THREE.MOUSE.PAN,
          }}
          touches={{
            ONE:  THREE.TOUCH.ROTATE,
            TWO:  THREE.TOUCH.DOLLY_PAN,
          }}
        />
        <CityScene
          unlockedAreas={unlockedAreas}
          cash={cash}
          portfolio={portfolio}
          currentYear={currentYear}
          onAreaClick={handleAreaClick}
          onLibraryClick={handleLibraryClick}
          onPortfolioClick={handlePortfolioClick}
          onMuseumClick={handleMuseumClick}
          hovered={hovered}
          setHovered={setHovered}
          showLabels={showLabels}
          showDistrictLabels={showDistrictLabels && showLabels}
          assetManagerUnlocked={assetManagerUnlocked}
          fireDrillBurning={fireDrillBurning}
          fireDrillPhase={fireDrillPhase}
          onStockSelect={handleStockSelect}
          placingMonument={placingMonument}
          placedMonuments={placedMonuments}
          onMonumentPlaced={onMonumentPlaced}
        />
      </Canvas>

      {/* District tooltip */}
      {hovered && DISTRICT_CFG[hovered] && (
        <AreaTooltip area={hovered} unlocked={unlockedAreas.includes(hovered)} />
      )}

      {/* Stock chart — 2D overlay, always works regardless of 3D scene */}
      {selectedStock && (
        <StockChartPanel
          instId={selectedStock.instId}
          name={selectedStock.name}
          currentYear={currentYear}
          onClose={() => setSelectedStock(null)}
        />
      )}

      {/* District label toggle button */}
      <button
        onClick={() => setShowDistrictLabels(p => !p)}
        className={`absolute top-3 left-3 z-20 px-3 py-1.5 rounded-lg text-sm font-bold border transition-all shadow ${
          showDistrictLabels
            ? 'bg-white text-slate-900 border-white'
            : 'bg-black/40 text-white border-white/30 hover:bg-black/60'
        }`}
      >
        {showDistrictLabels ? 'Hide Labels' : 'Show Labels'}
      </button>

      {/* Placement mode banner */}
      {placingMonument && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-amber-600/95 text-white text-sm font-bold px-5 py-2 rounded-xl border border-amber-400 shadow-lg pointer-events-none">
          {placingMonument === 'eiffelTower' ? 'Eiffel Tower' : placingMonument === 'bigBen' ? 'Big Ben' : 'Yacht'} — Click a golden ring to place
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-14 right-3 z-20 text-xs text-slate-200 bg-black/40 rounded-lg px-2 py-1 pointer-events-none select-none">
        Left drag: rotate · Right drag: pan · Scroll: zoom · Click building for chart
      </div>
    </div>
  )
}
