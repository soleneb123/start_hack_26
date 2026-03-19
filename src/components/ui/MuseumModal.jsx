import { useMemo, useState } from 'react'
import { ASSET_ORDER } from '../../data/assetData'
import { DISTRICT_INSTRUMENTS, INSTRUMENTS } from '../../data/stockData'
import { getPrice } from '../../firebase/firestore'

const TROPHIES = [
  {
    id: 'first_buy',
    icon: '🥉', name: 'First Steps',
    description: 'Make your very first investment',
    check: ({ portfolio }) => Object.values(portfolio).some(h => (h.shares || 0) > 0),
  },
  {
    id: 'bond_buyer',
    icon: '🏛️', name: 'Bond Holder',
    description: 'Buy bonds — the foundation of every portfolio',
    check: ({ portfolio }) =>
      (DISTRICT_INSTRUMENTS['bonds'] || []).some(id => (portfolio[id]?.shares || 0) > 0),
  },
  {
    id: 'gold_buyer',
    icon: '⛏️', name: 'Gold Rush',
    description: 'Own gold — the oldest safe haven',
    check: ({ portfolio }) =>
      (DISTRICT_INSTRUMENTS['gold'] || []).some(id => (portfolio[id]?.shares || 0) > 0),
  },
  {
    id: 'smi_buyer',
    icon: '🇨🇭', name: 'Swiss Pride',
    description: 'Invest in Swiss blue-chip stocks',
    check: ({ portfolio }) =>
      (DISTRICT_INSTRUMENTS['smiStocks'] || []).some(id => (portfolio[id]?.shares || 0) > 0),
  },
  {
    id: 'tech_buyer',
    icon: '📈', name: 'Tech Pioneer',
    description: 'Invest in individual tech companies',
    check: ({ portfolio }) =>
      (DISTRICT_INSTRUMENTS['singleStocks'] || []).some(id => (portfolio[id]?.shares || 0) > 0),
  },
  {
    id: 'fx_buyer',
    icon: '⚓', name: 'Sailor',
    description: 'Trade foreign exchange currencies',
    check: ({ portfolio }) =>
      (DISTRICT_INSTRUMENTS['fx'] || []).some(id => (portfolio[id]?.shares || 0) > 0),
  },
  {
    id: 'diversifier',
    icon: '🌐', name: 'Diversifier',
    description: 'Invest in 3 or more different markets',
    check: ({ portfolio }) => {
      const count = ASSET_ORDER.filter(d =>
        (DISTRICT_INSTRUMENTS[d] || []).some(id => (portfolio[id]?.shares || 0) > 0)
      ).length
      return count >= 3
    },
  },
  {
    id: 'all_markets',
    icon: '🏆', name: 'All Markets',
    description: 'Have holdings in all 6 markets simultaneously',
    check: ({ portfolio }) =>
      ASSET_ORDER.every(d =>
        (DISTRICT_INSTRUMENTS[d] || []).some(id => (portfolio[id]?.shares || 0) > 0)
      ),
  },
  {
    id: 'bull_run',
    icon: '🐂', name: 'Bull Run',
    description: 'Achieve +50% return on any single asset',
    check: ({ portfolio, currentYear }) =>
      Object.entries(portfolio).some(([id, h]) => {
        if (!(h.shares > 0) || !h.avgPurchasePrice) return false
        const price = getPrice(id, currentYear)
        return (price / h.avgPurchasePrice - 1) >= 0.5
      }),
  },
  {
    id: 'diamond_hands',
    icon: '💎', name: 'Diamond Hands',
    description: 'Achieve +100% return on any single asset',
    check: ({ portfolio, currentYear }) =>
      Object.entries(portfolio).some(([id, h]) => {
        if (!(h.shares > 0) || !h.avgPurchasePrice) return false
        const price = getPrice(id, currentYear)
        return (price / h.avgPurchasePrice - 1) >= 1.0
      }),
  },
  {
    id: 'streak_5',
    icon: '🔥', name: 'Streak Master',
    description: 'Log in 5 days in a row',
    check: ({ userData }) => userData?.assetManagerUnlocked === true,
  },
  {
    id: 'wealthy',
    icon: '💰', name: 'Wealthy',
    description: 'Net worth exceeds CHF 20,000',
    check: ({ netWorth }) => netWorth >= 20000,
  },
  {
    id: 'rich',
    icon: '💎', name: 'Rich',
    description: 'Net worth exceeds CHF 100,000',
    check: ({ netWorth }) => netWorth >= 100000,
  },
  {
    id: 'millionaire',
    icon: '🤑', name: 'Millionaire',
    description: 'Net worth exceeds CHF 1,000,000',
    check: ({ netWorth }) => netWorth >= 1000000,
  },
]

const MONUMENT_OPTIONS = [
  { type: 'eiffelTower', icon: '🗼', label: 'Eiffel Tower', description: 'The iconic Parisian landmark' },
  { type: 'bigBen',      icon: '🕰️', label: 'Big Ben',      description: 'London\'s famous clock tower' },
  { type: 'yacht',       icon: '⛵', label: 'Yacht',         description: 'A luxury sailing yacht' },
]

const MONUMENT_SLOTS = [
  { id: 1, threshold: 5  },
  { id: 2, threshold: 10 },
  { id: 3, threshold: 13 },
]

export default function MuseumModal({ onClose, userData, portfolio, currentYear, onPlaceMonument, onRemoveMonument, placedMonuments = [] }) {
  const [tab, setTab] = useState('achievements') // 'achievements' | 'monuments'
  const cash = userData?.cash ?? userData?.capital ?? 10000

  const netWorth = useMemo(() => {
    let pv = 0
    for (const [id, h] of Object.entries(portfolio)) {
      if ((h.shares || 0) > 0) pv += h.shares * getPrice(id, currentYear)
    }
    return cash + pv
  }, [portfolio, currentYear, cash])

  const trophies = useMemo(() =>
    TROPHIES.map(t => ({
      ...t,
      earned: t.check({ portfolio, currentYear, userData, netWorth }),
    })),
    [portfolio, currentYear, userData, netWorth]
  )

  const earnedCount = trophies.filter(t => t.earned).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="pf-modal relative bg-[#0d1117] rounded-xl w-full max-w-3xl max-h-[88vh] flex shadow-2xl overflow-hidden" style={{ border: '1px solid #FFD00022' }}>

        {/* ── Left sidebar ── */}
        <div className="w-52 shrink-0 bg-slate-950/60 border-r border-slate-700/50 flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-slate-700/40">
            <div className="font-black text-base" style={{ color: '#FFD000' }}>Museum</div>
            <div className="text-slate-500 text-xs mt-0.5">{earnedCount}/{trophies.length} trophies</div>
            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all" style={{ background: '#FFD000' }}
                style={{ width: `${(earnedCount / trophies.length) * 100}%` }}
              />
            </div>
          </div>

          <nav className="flex flex-col gap-1 p-2 flex-1">
            {[
              { key: 'achievements', label: 'Achievements' },
              { key: 'monuments',    label: 'Monuments'    },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded text-sm font-semibold text-left transition-all border"
                style={tab === item.key
                  ? { background: '#FFD00018', borderColor: '#FFD00044', color: '#FFD000' }
                  : { background: 'transparent', borderColor: 'transparent', color: '#94a3b8' }
                }
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="px-3 pb-4 text-[10px] text-slate-600 leading-snug">
            Invest & diversify to unlock more trophies and monument slots.
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60">
            <div className="text-white font-bold text-base">
              {tab === 'achievements' ? 'Earned Achievements' : 'Monument Collection'}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
          </div>

          {/* ── Achievements tab ── */}
          {tab === 'achievements' && (
            <div className="flex-1 overflow-y-auto px-4 py-3 grid grid-cols-2 gap-2">
              {trophies.map(t => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 rounded-xl p-3 border transition-all ${
                    t.earned
                      ? 'bg-amber-900/20 border-amber-600/50'
                      : 'bg-slate-800/40 border-slate-700/40 opacity-50'
                  }`}
                >
                  <div className={`text-3xl ${t.earned ? '' : 'grayscale'}`}>{t.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-bold ${t.earned ? '' : 'text-slate-400'}`} style={t.earned ? { color: '#FFD000' } : {}}>
                      {t.name}
                    </div>
                    <div className="text-slate-500 text-xs leading-tight">{t.description}</div>
                  </div>
                  {t.earned && <div className="text-green-400 text-[10px] font-bold shrink-0 uppercase tracking-wide">Done</div>}
                </div>
              ))}
            </div>
          )}

          {/* ── Monuments tab ── */}
          {tab === 'monuments' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
              {/* Monument catalog */}
              <div>
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Available Monuments</div>
                <div className="grid grid-cols-3 gap-2">
                  {MONUMENT_OPTIONS.map(m => {
                    const placed = placedMonuments.some(p => p?.type === m.type)
                    return (
                      <div key={m.type} className={`rounded-xl p-3 text-center border ${placed ? 'border-green-600/50 bg-green-900/20' : 'border-slate-700/50 bg-slate-800/40'}`}>
                        <div className="text-3xl mb-1">{m.icon}</div>
                        <div className="text-white text-xs font-bold">{m.label}</div>
                        <div className="text-slate-500 text-[10px] mt-0.5">{m.description}</div>
                        {placed && <div className="text-green-400 text-[10px] font-bold mt-1">Placed</div>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Placement slots */}
              <div>
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Placement Slots</div>
                <div className="flex flex-col gap-2">
                  {MONUMENT_SLOTS.map(slot => {
                    const slotUnlocked = earnedCount >= slot.threshold
                    const placed = placedMonuments[slot.id - 1]
                    return (
                      <div
                        key={slot.id}
                        className={`rounded-xl p-3 border ${
                          slotUnlocked
                            ? 'bg-slate-800/60 border-amber-600/40'
                            : 'bg-slate-800/20 border-slate-700/30 opacity-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-400 font-semibold">Slot {slot.id}</span>
                          {!slotUnlocked && (
                            <span className="text-[10px] text-slate-500">
                              Locked — {slot.threshold} trophies needed ({Math.max(0, slot.threshold - earnedCount)} more)
                            </span>
                          )}
                        </div>
                        {placed ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-green-400 font-semibold">
                                {MONUMENT_OPTIONS.find(m => m.type === placed.type)?.label} — placed
                              </span>
                              <button
                                onClick={() => onRemoveMonument?.(slot.id)}
                                className="text-[10px] text-red-400 hover:text-red-300 border border-red-700/40 hover:border-red-500/60 px-2 py-0.5 rounded-md transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-500 mb-0.5">Replace with:</div>
                            <div className="flex gap-2">
                              {MONUMENT_OPTIONS.filter(m => m.type !== placed.type).map(m => (
                                <button
                                  key={m.type}
                                  onClick={() => { onRemoveMonument?.(slot.id); onPlaceMonument?.(m.type, slot.id); onClose() }}
                                  className="flex-1 bg-slate-700/40 hover:bg-amber-600/30 border border-slate-600/50 hover:border-amber-500/50 text-white text-xs font-bold py-1.5 rounded-lg transition-colors"
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : slotUnlocked ? (
                          <div className="flex gap-2">
                            {MONUMENT_OPTIONS.map(m => (
                              <button
                                key={m.type}
                                onClick={() => { onPlaceMonument?.(m.type, slot.id); onClose() }}
                                className="flex-1 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/50 text-white text-xs font-bold py-2 rounded-lg transition-colors"
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">Earn {slot.threshold} trophies to unlock</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
