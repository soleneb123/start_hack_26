import { useState, useEffect } from 'react'
import { getLeaderboard } from '../../firebase/firestore'
import { getScoreGrade } from '../../utils/simulation'
import { useAuth } from '../../hooks/useAuth.jsx'

const LEGENDS = [
  {
    name: 'Nancy Pelosi',
    avatar: '🏛️',
    title: 'Speaker Emerita · San Francisco',
    accent: '#4ade80',
    stat: '+3,041% on NVDA',
    statLabel: 'since avg. purchase price',
    signature: 'Bought NVDA call options before the AI spending boom while her committee oversaw tech regulation. Timing that Wall Street could only dream of.',
    quote: "I don't know what my husband invests in.",
    portfolio: { singleStocks: 70, equityIndices: 22, bonds: 5, gold: 2, smiStocks: 1, fx: 0 },
    style: 'Single-stock conviction, tech-heavy',
  },
  {
    name: 'Warren Buffett',
    avatar: '🎩',
    title: 'Oracle of Omaha · Berkshire Hathaway',
    accent: '#fbbf24',
    stat: '+20%/yr avg',
    statLabel: 'over 58 years',
    signature: 'Bought Apple in 2016 for ~$35/share. By 2023 it was 40% of Berkshire\'s portfolio worth over $170B. His secret? Do nothing.',
    quote: 'Be fearful when others are greedy, greedy when others are fearful.',
    portfolio: { singleStocks: 65, equityIndices: 15, bonds: 15, gold: 0, smiStocks: 5, fx: 0 },
    style: 'Value investing, buy-and-hold forever',
  },
  {
    name: 'George Soros',
    avatar: '🌍',
    title: 'The Man Who Broke the Bank of England',
    accent: '#f87171',
    stat: '+$1B in one day',
    statLabel: 'shorting the British pound, Sept 1992',
    signature: 'In 1992 he bet $10B that the UK couldn\'t sustain its ERM peg. The British government raised rates to 15% trying to stop him. He won.',
    quote: "It's not whether you're right or wrong, but how much money you make when you're right.",
    portfolio: { fx: 55, singleStocks: 25, equityIndices: 15, bonds: 5, gold: 0, smiStocks: 0 },
    style: 'Global macro, FX speculation',
  },
  {
    name: 'Michael Burry',
    avatar: '🔮',
    title: 'The Big Short · Scion Asset Management',
    accent: '#a78bfa',
    stat: '+490% in 2007',
    statLabel: 'while S&P 500 crashed −40%',
    signature: 'Read mortgage bond prospectuses nobody else read. Spotted fraud in subprime loans in 2005 and bought credit default swaps — pure financial weapons.',
    quote: 'Everyone wants to be Warren Buffett, but nobody wants to do the work.',
    portfolio: { singleStocks: 80, bonds: 10, equityIndices: 5, gold: 5, smiStocks: 0, fx: 0 },
    style: 'Deep value, contrarian concentrated bets',
  },
  {
    name: 'Cathie Wood',
    avatar: '🚀',
    title: 'Queen of Innovation · ARK Invest',
    accent: '#22d3ee',
    stat: '+346% in 2020',
    statLabel: 'ARK Innovation ETF single year',
    signature: 'Bought Tesla in 2018 at $18/share (split-adjusted), held through a −75% drawdown when everyone mocked her, then watched it 10x.',
    quote: 'We invest in the future, not the past.',
    portfolio: { singleStocks: 88, equityIndices: 10, bonds: 0, gold: 0, smiStocks: 2, fx: 0 },
    style: '100% disruptive innovation, maximum volatility',
  },
  {
    name: 'Peter Lynch',
    avatar: '📊',
    title: 'Fidelity Magellan · The People\'s Investor',
    accent: '#f97316',
    stat: '+29.2%/yr',
    statLabel: 'Magellan Fund 1977–1990',
    signature: 'Grew Fidelity Magellan from $18M to $14B in 13 years by "investing in what you know" — buying Dunkin\' Donuts after a good cup of coffee.',
    quote: 'Know what you own, and know why you own it.',
    portfolio: { singleStocks: 65, equityIndices: 15, smiStocks: 10, bonds: 5, gold: 3, fx: 2 },
    style: 'Diversified stock-picking, 1,400 positions at peak',
  },
]

const ASSET_COLORS = {
  bonds: '#60a5fa', gold: '#fbbf24', smiStocks: '#f97316',
  equityIndices: '#4ade80', singleStocks: '#a78bfa', fx: '#22d3ee',
}
const ASSET_LABELS = {
  bonds: 'Bonds', gold: 'Gold', smiStocks: 'SMI', equityIndices: 'Indices', singleStocks: 'Stocks', fx: 'FX',
}

export default function Leaderboard({ onClose }) {
  const [tab, setTab]       = useState('rankings')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const { user } = useAuth()

  useEffect(() => {
    getLeaderboard()
      .then(data => { setEntries(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="pf-modal relative bg-[#0d1117] rounded-2xl flex flex-col shadow-2xl"
        style={{ border: '1px solid #ffffff12', width: 560, height: '82vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid #ffffff10' }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <h2 className="text-base font-black text-white">Leaderboard</h2>
              <p className="text-[11px]" style={{ color: '#ffffff33' }}>City rankings &amp; legendary investors</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800">✕</button>
        </div>

        {/* Tab strip */}
        <div className="flex gap-2 px-5 py-3 shrink-0" style={{ borderBottom: '1px solid #ffffff10' }}>
          {[
            { id: 'rankings', label: '🏙️ City Rankings' },
            { id: 'legends',  label: '⭐ Legends' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-1.5 text-xs font-bold rounded-full transition-all"
              style={tab === t.id
                ? { background: '#FFD000', color: '#0d1117' }
                : { background: '#ffffff10', color: '#ffffffBB', border: '1px solid #ffffff15' }
              }>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {tab === 'rankings' ? (
            loading ? (
              <div className="text-center text-slate-400 py-12">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <div className="text-4xl mb-3">🏙️</div>
                <div>No scores yet. Be the first!</div>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, idx) => {
                  const grade = getScoreGrade(entry.totalScore || 0)
                  const isMe = user?.uid === entry.id
                  return (
                    <div key={entry.id}
                      className="flex items-center gap-4 p-3 rounded-xl border transition-all"
                      style={{
                        border: isMe ? '1px solid #4ade8044' : '1px solid #ffffff10',
                        background: isMe ? '#4ade8010' : '#ffffff05',
                      }}>
                      <div className="w-8 text-center font-black text-lg"
                        style={{ color: idx < 3 ? ['#fbbf24','#94a3b8','#cd7c3a'][idx] : '#64748b' }}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold text-sm truncate">{entry.username || 'Anonymous'}</span>
                          {isMe && <span className="text-xs" style={{ color: '#4ade80' }}>(you)</span>}
                        </div>
                        <div className="text-xs" style={{ color: '#ffffff44' }}>{entry.unlockedAreas?.length || 0}/6 areas unlocked</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-lg" style={{ color: grade.color }}>{grade.grade}</div>
                        <div className="text-xs" style={{ color: '#ffffff44' }}>{(entry.totalScore || 0).toLocaleString()} pts</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-xs px-1 pb-1" style={{ color: '#ffffff33' }}>
                Real investors famous for extraordinary — and sometimes controversial — returns.
              </p>
              {LEGENDS.map((legend, idx) => {
                const isOpen = expanded === idx
                return (
                  <div key={legend.name}
                    className="rounded-xl overflow-hidden transition-all"
                    style={{
                      border: `1px solid ${isOpen ? legend.accent + '44' : '#ffffff12'}`,
                      background: isOpen ? legend.accent + '08' : '#ffffff05',
                    }}>
                    {/* Row */}
                    <button className="w-full text-left px-4 py-3 flex items-center gap-3"
                      onClick={() => setExpanded(isOpen ? null : idx)}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ background: legend.accent + '18', border: `1px solid ${legend.accent}33` }}>
                        {legend.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm text-white">{legend.name}</div>
                        <div className="text-[10px] truncate" style={{ color: '#ffffff44' }}>{legend.title}</div>
                      </div>
                      <div className="text-right shrink-0 mr-2">
                        <div className="text-sm font-black" style={{ color: legend.accent }}>{legend.stat}</div>
                        <div className="text-[9px]" style={{ color: '#ffffff33' }}>{legend.statLabel}</div>
                      </div>
                      <div className="text-xs" style={{ color: '#ffffff33' }}>{isOpen ? '▲' : '▼'}</div>
                    </button>

                    {/* Expanded */}
                    {isOpen && (
                      <div className="px-4 pb-4 space-y-3">

                        {/* Signature trade */}
                        <div className="rounded-lg p-3" style={{ background: legend.accent + '0d', border: `1px solid ${legend.accent}22` }}>
                          <div className="text-[9px] uppercase tracking-widest font-semibold mb-1" style={{ color: legend.accent + 'AA' }}>Signature Move</div>
                          <p className="text-xs leading-relaxed" style={{ color: '#ffffffBB' }}>{legend.signature}</p>
                        </div>

                        {/* Portfolio allocation */}
                        <div>
                          <div className="text-[9px] uppercase tracking-widest font-semibold mb-2" style={{ color: '#ffffff33' }}>
                            Portfolio Style — {legend.style}
                          </div>
                          <div className="space-y-1.5">
                            {Object.entries(legend.portfolio)
                              .filter(([, v]) => v > 0)
                              .sort(([, a], [, b]) => b - a)
                              .map(([k, v]) => (
                                <div key={k} className="flex items-center gap-2">
                                  <div className="text-[9px] w-14 shrink-0" style={{ color: ASSET_COLORS[k] }}>{ASSET_LABELS[k]}</div>
                                  <div className="flex-1 h-1.5 rounded-full" style={{ background: '#ffffff0a' }}>
                                    <div className="h-1.5 rounded-full" style={{ width: `${v}%`, background: ASSET_COLORS[k] }} />
                                  </div>
                                  <div className="text-[9px] font-bold w-7 text-right" style={{ color: ASSET_COLORS[k] }}>{v}%</div>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Quote */}
                        <div className="rounded-lg px-3 py-2.5 flex gap-2" style={{ background: '#ffffff07', border: '1px solid #ffffff0a' }}>
                          <span style={{ color: '#ffffff22', fontSize: 20, lineHeight: 1, marginTop: -2 }}>"</span>
                          <p className="text-xs italic leading-relaxed" style={{ color: '#ffffff88' }}>{legend.quote}</p>
                        </div>

                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
