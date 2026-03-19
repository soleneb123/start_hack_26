import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { runSimulation, getScoreGrade } from '../../utils/simulation'
import { ASSET_CLASSES, ASSET_ORDER } from '../../data/assetData'
import { saveSimulationResult } from '../../firebase/firestore'
import { useAuth } from '../../hooks/useAuth.jsx'

const AREA_CONFIG = {
  bonds: { color: '#60a5fa', icon: '🏛️', label: 'Bonds' },
  gold: { color: '#fbbf24', icon: '⛏️', label: 'Gold' },
  smiStocks: { color: '#f97316', icon: '🇨🇭', label: 'SMI Stocks' },
  equityIndices: { color: '#4ade80', icon: '🌐', label: 'Equity Indices' },
  singleStocks: { color: '#a78bfa', icon: '📈', label: 'Single Stocks' },
  fx: { color: '#22d3ee', icon: '✈️', label: 'FX' },
}

export default function SimulationModal({ onClose, unlockedAreas, capital, onSimulationComplete, onSimulationStateChange }) {
  const [phase, setPhase] = useState('allocate') // 'allocate' | 'running' | 'results'
  const [allocation, setAllocation] = useState(() => {
    const init = {}
    ASSET_ORDER.forEach(id => { init[id] = 0 })
    return init
  })
  const [simResult, setSimResult] = useState(null)
  const [currentYear, setCurrentYear] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const { user } = useAuth()
  const intervalRef = useRef(null)

  const totalAllocated = Object.values(allocation).reduce((s, v) => s + v, 0)
  const remaining = 100 - totalAllocated

  // Concentration warning
  const maxSingle = Math.max(...Object.values(allocation))
  const showConcentrationWarning = maxSingle > 50
  const showRiskWarning = (allocation.singleStocks || 0) + (allocation.fx || 0) > 60

  const handleSlider = (id, val) => {
    const newVal = parseInt(val)
    const others = totalAllocated - (allocation[id] || 0)
    if (others + newVal > 100) return
    setAllocation(a => ({ ...a, [id]: newVal }))
  }

  const startSimulation = () => {
    if (totalAllocated !== 100) return
    const result = runSimulation(allocation, capital)
    setSimResult(result)
    setPhase('running')
    setCurrentYear(0)
    setIsPlaying(true)
    // Broadcast allocation immediately so city updates building sizes
    if (onSimulationStateChange) {
      onSimulationStateChange({ buildingStates: {}, allocation })
    }
  }

  // Auto-play year by year + broadcast building states to city map
  useEffect(() => {
    if (!isPlaying || !simResult) return
    if (currentYear >= simResult.yearlyResults.length - 1) {
      setIsPlaying(false)
      return
    }
    intervalRef.current = setTimeout(() => {
      setCurrentYear(y => {
        const next = y + 1
        const yearData = simResult.yearlyResults[next]
        if (yearData && onSimulationStateChange) {
          onSimulationStateChange({ buildingStates: yearData.buildingStates, allocation: simResult.allocation })
        }
        return next
      })
    }, 900)
    return () => clearTimeout(intervalRef.current)
  }, [isPlaying, currentYear, simResult])

  useEffect(() => {
    if (simResult && currentYear >= simResult.yearlyResults.length - 1 && !isPlaying) {
      setTimeout(() => setPhase('results'), 600)
    }
  }, [currentYear, isPlaying, simResult])

  const saveResult = async () => {
    if (!user || !simResult) return
    try {
      await saveSimulationResult(user.uid, {
        score: simResult.score.total,
        finalValue: simResult.finalValue,
        totalReturn: simResult.totalReturn,
        allocation: simResult.allocation,
      })
      onSimulationComplete?.(simResult)
    } catch (e) {
      console.error(e)
    }
  }

  // During running phase: side panel so city map stays visible
  if (phase === 'running' && simResult) {
    return (
      <div className="fixed right-4 top-14 bottom-12 w-[380px] z-50 flex flex-col bg-slate-900/95 backdrop-blur border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <span className="text-white font-bold text-sm">Simulation Running...</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 text-sm">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <RunningPhase
            result={simResult}
            currentYear={currentYear}
            isPlaying={isPlaying}
            onToggle={() => setIsPlaying(p => !p)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="pf-modal relative bg-slate-900 border border-slate-700 rounded-2xl w-[860px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h2 className="text-lg font-bold text-white">
                {phase === 'allocate' ? 'Build Your Portfolio' : 'Results'}
              </h2>
              <p className="text-slate-400 text-xs">Starting Capital: CHF {capital.toLocaleString()}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {phase === 'allocate' && (
            <AllocatePhase
              allocation={allocation}
              unlockedAreas={unlockedAreas}
              onSlider={handleSlider}
              remaining={remaining}
              totalAllocated={totalAllocated}
              showConcentrationWarning={showConcentrationWarning}
              showRiskWarning={showRiskWarning}
              onStart={startSimulation}
            />
          )}
          {phase === 'results' && simResult && (
            <ResultsPhase
              result={simResult}
              capital={capital}
              onSave={saveResult}
              onRerun={() => { setPhase('allocate'); setSimResult(null) }}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function AllocatePhase({ allocation, unlockedAreas, onSlider, remaining, totalAllocated, showConcentrationWarning, showRiskWarning, onStart }) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Allocate your portfolio</h3>
        <div className={`px-3 py-1 rounded-full text-sm font-bold ${totalAllocated === 100 ? 'bg-green-900/50 text-green-400' : 'bg-slate-800 text-slate-400'}`}>
          {totalAllocated}% / 100%
        </div>
      </div>

      {/* Warnings */}
      {showConcentrationWarning && (
        <div className="mb-4 bg-yellow-900/30 border border-yellow-700 rounded-xl p-3 text-yellow-300 text-sm flex items-start gap-2">
          <span>⚠️</span>
          <span>Concentration risk! You have more than 50% in a single asset. A bad year in that asset could severely hurt your portfolio.</span>
        </div>
      )}
      {showRiskWarning && (
        <div className="mb-4 bg-red-900/30 border border-red-700 rounded-xl p-3 text-red-300 text-sm flex items-start gap-2">
          <span>🚨</span>
          <span>High risk profile! Single Stocks + FX make up over 60% of your portfolio. This is speculative, not investing.</span>
        </div>
      )}

      <div className="space-y-4 mb-6">
        {ASSET_ORDER.map(id => {
          const config = AREA_CONFIG[id]
          const asset = ASSET_CLASSES[id]
          const unlocked = unlockedAreas.includes(id)
          const val = allocation[id] || 0

          return (
            <div key={id} className={`rounded-xl p-4 border ${unlocked ? 'border-slate-700 bg-slate-800/30' : 'border-slate-800 bg-slate-900/30 opacity-40'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{config.icon}</span>
                  <div>
                    <span className="text-white font-medium text-sm">{config.label}</span>
                    <span className="text-slate-500 text-xs ml-2">avg {asset?.avgReturn}%/yr · vol {asset?.volatility}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm" style={{ color: unlocked ? config.color : '#6b7280' }}>
                    {val}%
                  </span>
                  {!unlocked && <span className="text-slate-600 text-xs">🔒 Locked</span>}
                </div>
              </div>
              {unlocked && (
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={val}
                  onChange={e => onSlider(id, e.target.value)}
                  className="w-full accent-green-500 h-1.5"
                  style={{ accentColor: config.color }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Visual allocation bar */}
      <div className="flex h-4 rounded-full overflow-hidden mb-4 gap-px">
        {ASSET_ORDER.filter(id => allocation[id] > 0).map(id => (
          <div
            key={id}
            style={{ width: `${allocation[id]}%`, backgroundColor: AREA_CONFIG[id].color }}
            title={`${AREA_CONFIG[id].label}: ${allocation[id]}%`}
          />
        ))}
        {remaining > 0 && (
          <div style={{ width: `${remaining}%` }} className="bg-slate-700" />
        )}
      </div>

      <button
        onClick={onStart}
        disabled={totalAllocated !== 100}
        className="w-full py-3 rounded-xl font-bold text-black bg-green-500 hover:bg-green-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"
      >
        {totalAllocated !== 100 ? `Allocate remaining ${remaining}% to run simulation` : '▶ Run 15-Year Simulation'}
      </button>
    </div>
  )
}

function RunningPhase({ result, currentYear, isPlaying, onToggle }) {
  const yearData = result.yearlyResults.slice(0, currentYear + 1)
  const thisYear = result.yearlyResults[currentYear]
  const isEarthquake = thisYear?.earthquake

  const chartData = yearData.map(y => ({
    year: y.year,
    portfolio: y.portfolioValue,
    benchmark: y.benchmarkValue,
  }))

  return (
    <div className={`p-6 ${isEarthquake ? 'animate-pulse' : ''}`}>
      {/* Earthquake overlay */}
      {isEarthquake && (
        <div className="mb-4 bg-red-900/50 border border-red-600 rounded-xl p-3 text-red-300 text-sm text-center animate-bounce">
          🌋 EARTHQUAKE! Market crash hits concentrated portfolio! Diversified investors protected.
        </div>
      )}

      {/* Current year indicator */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-3xl font-black text-white">{thisYear?.year}</div>
          <div className={`text-sm font-semibold ${(thisYear?.yearReturn || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {(thisYear?.yearReturn || 0) >= 0 ? '+' : ''}{thisYear?.yearReturn?.toFixed(1)}% this year
            <span className="text-slate-400 font-normal ml-2">
              ({(thisYear?.changeFromPrev || 0) >= 0 ? '+' : ''}CHF {(thisYear?.changeFromPrev || 0).toLocaleString()})
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-white">CHF {thisYear?.portfolioValue?.toLocaleString()}</div>
          <div className="text-xs text-slate-400">Benchmark: CHF {thisYear?.benchmarkValue?.toLocaleString()}</div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-48 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v, n) => [`CHF ${v.toLocaleString()}`, n === 'portfolio' ? 'Your Portfolio' : 'Savings Benchmark']}
            />
            <Area type="monotone" dataKey="benchmark" stroke="#60a5fa" strokeWidth={1.5} fill="url(#bg)" strokeDasharray="4 2" />
            <Area type="monotone" dataKey="portfolio" stroke="#4ade80" strokeWidth={2} fill="url(#pg)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Per-asset mini status */}
      <div className="flex gap-2 flex-wrap mb-4">
        {Object.entries(thisYear?.buildingStates || {}).map(([id, state]) => (
          <div
            key={id}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: AREA_CONFIG[id]?.color + '22',
              color: AREA_CONFIG[id]?.color,
              border: `1px solid ${AREA_CONFIG[id]?.color}44`
            }}
          >
            {AREA_CONFIG[id]?.icon}
            <span>{AREA_CONFIG[id]?.label}</span>
            <span>{state === 'boom' ? '🚀' : state === 'ok' ? '✅' : state === 'down' ? '📉' : '🌋'}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onToggle}
        className="w-full py-2 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 transition-all text-sm font-medium"
      >
        {isPlaying ? '⏸ Pause' : '▶ Resume'}
      </button>
    </div>
  )
}

function ResultsPhase({ result, capital, onSave, onRerun, onClose }) {
  const grade = getScoreGrade(result.score.total)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    await onSave()
    setSaved(true)
  }

  const chartData = result.yearlyResults.map(y => ({
    year: y.year,
    portfolio: y.portfolioValue,
    benchmark: y.benchmarkValue,
  }))

  return (
    <div className="p-6">
      {/* Score hero */}
      <div className="text-center mb-6 p-6 rounded-2xl border"
        style={{ background: grade.color + '11', borderColor: grade.color + '44' }}>
        <div className="text-6xl font-black mb-2" style={{ color: grade.color }}>{grade.grade}</div>
        <div className="text-white font-bold text-xl">{grade.label}</div>
        <div className="text-slate-400 text-sm mt-1">{result.score.total} / 1000 points</div>
      </div>

      {/* Score breakdown */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        {Object.entries(result.score.breakdown).map(([key, val]) => {
          const maxes = { returns: 250, diversification: 250, volatility: 250, longTerm: 150, riskProfile: 100 }
          const labels = { returns: 'Returns', diversification: 'Diversity', volatility: 'Stability', longTerm: 'Long-Term', riskProfile: 'Risk Profile' }
          const pct = val / maxes[key]
          return (
            <div key={key} className="bg-slate-800 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-400 mb-2">{labels[key]}</div>
              <div className="w-full h-1.5 bg-slate-700 rounded-full mb-2 overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct * 100}%` }} />
              </div>
              <div className="text-white text-xs font-bold">{val}<span className="text-slate-500">/{maxes[key]}</span></div>
            </div>
          )
        })}
      </div>

      {/* Returns summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-slate-400 text-xs mb-1">Your Portfolio</div>
          <div className="text-white font-bold text-xl">CHF {result.finalValue.toLocaleString()}</div>
          <div className={`text-sm font-semibold ${parseFloat(result.totalReturn) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            +{result.totalReturn}% over 15 years
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-slate-400 text-xs mb-1">Savings Benchmark</div>
          <div className="text-slate-300 font-bold text-xl">CHF {result.benchmarkFinalValue.toLocaleString()}</div>
          <div className="text-slate-400 text-sm">+{result.benchmarkReturn}% over 15 years</div>
        </div>
      </div>

      {/* Mini chart */}
      <div className="h-36 mb-4 bg-slate-800/50 rounded-xl p-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} formatter={v => [`CHF ${v.toLocaleString()}`]} />
            <Area type="monotone" dataKey="benchmark" stroke="#60a5fa" strokeWidth={1} fill="none" strokeDasharray="4 2" />
            <Area type="monotone" dataKey="portfolio" stroke="#4ade80" strokeWidth={2} fill="url(#pg2)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <FeedbackPanel result={result} />

      <div className="flex gap-3 mt-4">
        <button onClick={onRerun} className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 transition-all font-semibold text-sm">
          🔄 Try Again
        </button>
        <button
          onClick={handleSave}
          disabled={saved}
          className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-400 disabled:bg-slate-700 disabled:text-slate-400 text-black font-bold transition-all text-sm"
        >
          {saved ? '✅ Saved to Leaderboard' : '🏆 Save Score'}
        </button>
      </div>
    </div>
  )
}

function FeedbackPanel({ result }) {
  const { breakdown } = result.score
  const maxes = { returns: 250, diversification: 250, volatility: 250, longTerm: 150, riskProfile: 100 }

  const wellDone = []
  const improve = []

  // Returns
  const retPct = breakdown.returns / maxes.returns
  if (retPct >= 0.72)
    wellDone.push({ icon: '📈', text: 'Strong returns! Your portfolio significantly outperformed the savings benchmark.' })
  else if (retPct < 0.35)
    improve.push({ icon: '📉', text: 'Low returns. Shift more capital to higher-growth assets like Equity Indices or SMI Stocks.' })

  // Diversification
  const divPct = breakdown.diversification / maxes.diversification
  if (divPct >= 0.75)
    wellDone.push({ icon: '🌐', text: 'Excellent diversification! You spread risk well across multiple asset classes.' })
  else if (divPct < 0.4)
    improve.push({ icon: '⚠️', text: 'Too concentrated. Spread capital across more asset classes to reduce single-asset risk.' })

  // Stability
  const volPct = breakdown.volatility / maxes.volatility
  if (volPct >= 0.75)
    wellDone.push({ icon: '🏦', text: 'Very stable portfolio. Your investments had minimal drawdowns throughout the 15 years.' })
  else if (volPct < 0.35)
    improve.push({ icon: '🌋', text: 'High volatility. Your portfolio swung wildly — add stable assets like Bonds or Gold to cushion downturns.' })

  // Long-term / all assets used
  if (breakdown.longTerm >= 135)
    wellDone.push({ icon: '🎯', text: 'Great long-term thinking! You made use of all your unlocked asset classes.' })
  else if (breakdown.longTerm < 90)
    improve.push({ icon: '🔍', text: 'You left some asset classes at 0%. Even small allocations to each improve diversification.' })

  // Risk profile
  if (breakdown.riskProfile >= 90)
    wellDone.push({ icon: '🛡️', text: 'Balanced risk profile. You kept speculative assets (Single Stocks + FX) in check.' })
  else if (breakdown.riskProfile < 55)
    improve.push({ icon: '🎰', text: 'Too much in speculative assets. Over 60% in Single Stocks + FX is gambling, not investing.' })

  // Bonus: significantly beat benchmark
  const finalReturn = parseFloat(result.totalReturn)
  const benchReturn = parseFloat(result.benchmarkReturn)
  if (finalReturn > benchReturn * 3 && finalReturn > 0)
    wellDone.push({ icon: '🚀', text: `You crushed the benchmark — CHF ${result.finalValue.toLocaleString()} vs CHF ${result.benchmarkFinalValue.toLocaleString()}!` })

  if (wellDone.length === 0 && improve.length === 0) return null

  return (
    <div className="mt-4 space-y-3">
      <h4 className="text-white font-bold text-sm">📋 Portfolio Feedback</h4>
      {wellDone.length > 0 && (
        <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 space-y-2">
          <div className="text-green-400 text-xs font-bold uppercase tracking-wider mb-2">What you did well</div>
          {wellDone.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-green-300">
              <span className="shrink-0">{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      )}
      {improve.length > 0 && (
        <div className="bg-orange-900/20 border border-orange-800 rounded-xl p-4 space-y-2">
          <div className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">Areas to improve</div>
          {improve.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-orange-300">
              <span className="shrink-0">{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
