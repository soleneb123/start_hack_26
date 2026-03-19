import { useState } from 'react'
import { INSTRUMENTS, GAME_START_YEAR } from '../../data/stockData'
import { getPrice } from '../../firebase/firestore'
import { YEARS, ASSET_CLASSES, SAVINGS_RATE } from '../../data/assetData'

const PF_YELLOW = '#FFD000'

function fmtCHF(n) {
  return `CHF ${(+n).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtCHFshort(n) {
  if (Math.abs(n) >= 1_000_000) return `CHF ${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)     return `CHF ${(n / 1_000).toFixed(1)}k`
  return `CHF ${n.toFixed(0)}`
}
function fmtShares(n) {
  return n >= 1 ? n.toFixed(4) : n.toFixed(6)
}

export default function PortfolioModal({ onClose, portfolio = {}, cash = 500000, currentYear }) {
  const [showChart, setShowChart] = useState(false)
  const [hoverIdx, setHoverIdx]   = useState(null)

  const rows = Object.entries(portfolio)
    .filter(([, h]) => (h.shares || 0) > 0)
    .map(([id, h]) => {
      const inst      = INSTRUMENTS[id] || {}
      const price     = getPrice(id, currentYear)
      const value     = h.shares * price
      const invested  = (h.avgPurchasePrice || price) * h.shares
      const gain      = value - invested
      const returnPct = invested > 0 ? ((value / invested) - 1) * 100 : 0
      return { id, inst, h, price, value, invested, gain, returnPct }
    })
    .sort((a, b) => b.value - a.value)

  const totalValue    = rows.reduce((s, r) => s + r.value, 0)
  const totalInvested = rows.reduce((s, r) => s + r.invested, 0)
  const totalGain     = totalValue - totalInvested
  const totalRetPct   = totalInvested > 0 ? ((totalValue / totalInvested) - 1) * 100 : null
  const netWorth      = cash + totalValue

  // ── Diversification Score ────────────────────────────────────────────────
  // Group portfolio value by asset class (districtId)
  const byClass = {}
  for (const { inst, value } of rows) {
    const k = inst.districtId || 'other'
    byClass[k] = (byClass[k] || 0) + value
  }
  const classCount = Object.keys(byClass).length
  const hhi = totalValue > 0
    ? Object.values(byClass).reduce((s, v) => s + Math.pow(v / totalValue, 2), 0)
    : 1
  // 100 = perfectly spread (HHI=1/6), 0 = fully concentrated (HHI=1)
  const minHHI = 1 / 6
  const divScore = totalValue > 0
    ? Math.round(Math.max(0, Math.min(100, (1 - hhi) / (1 - minHHI) * 100)))
    : 0
  const divGrade = divScore >= 80 ? { g: 'A', label: 'Well Diversified',    col: '#4ade80' }
                 : divScore >= 55 ? { g: 'B', label: 'Moderate Spread',     col: '#a3e635' }
                 : divScore >= 30 ? { g: 'C', label: 'Concentrated',         col: '#fb923c' }
                 :                  { g: 'D', label: 'High Concentration',   col: '#f87171' }

  // ── Risk-Return Score ────────────────────────────────────────────────────
  // Weighted portfolio volatility from asset class annualised vol
  const weightedVol = totalValue > 0
    ? Object.entries(byClass).reduce((s, [k, v]) => {
        const vol = ASSET_CLASSES[k]?.volatility ?? 15
        return s + (v / totalValue) * vol
      }, 0)
    : 0
  // Years since GAME_START_YEAR to annualise return
  const yearsHeld = Math.max(1, currentYear - GAME_START_YEAR)
  const annualisedReturn = totalInvested > 0
    ? (Math.pow(totalValue / totalInvested, 1 / yearsHeld) - 1) * 100
    : 0
  const savingsAnnual = SAVINGS_RATE          // 0.5 %
  const excessReturn  = annualisedReturn - savingsAnnual
  // Sharpe-like: excess / vol, scaled to 0-100 (1.5 = perfect = 100)
  const rrRaw   = weightedVol > 0 ? excessReturn / weightedVol : 0
  const rrScore = Math.round(Math.max(0, Math.min(100, (rrRaw / 1.5) * 100)))
  const rrGrade = rrScore >= 75 ? { g: 'A', label: 'Excellent Risk/Return', col: '#4ade80' }
               : rrScore >= 50  ? { g: 'B', label: 'Good Risk/Return',      col: '#a3e635' }
               : rrScore >= 25  ? { g: 'C', label: 'Fair Risk/Return',      col: '#fb923c' }
               :                  { g: 'D', label: 'Poor Risk/Return',       col: '#f87171' }

  // Chart: compute portfolio value at each year up to currentYear
  const chartYears = YEARS.filter(y => y <= currentYear)
  const chartData  = chartYears.map(y => {
    const pv = Object.entries(portfolio)
      .filter(([, h]) => (h.shares || 0) > 0)
      .reduce((sum, [id, h]) => sum + h.shares * getPrice(id, y), 0)
    return { year: y, value: pv }
  })

  const hoveredPoint = hoverIdx !== null ? chartData[hoverIdx] : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="pf-modal relative bg-[#0d1117] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" style={{ border: '1px solid #FFD00022' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #ffffff10' }}>
          <div>
            <h2 className="text-white font-black text-lg">PostFinance — Portfolio Summary</h2>
            <div className="text-xs mt-0.5" style={{ color: '#ffffff44' }}>Year {currentYear} · All holdings at current prices</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-px shrink-0" style={{ background: '#ffffff08', borderBottom: '1px solid #ffffff10' }}>
          {[
            { label: 'Cash',         value: fmtCHF(cash),       style: { color: PF_YELLOW }, clickable: false },
            { label: 'Portfolio',    value: fmtCHF(totalValue),  style: { color: '#ffffff' }, clickable: false },
            { label: 'Net Worth',    value: fmtCHF(netWorth),    style: { color: PF_YELLOW }, clickable: false },
            {
              label: 'Total Return',
              value: totalRetPct !== null ? `${totalRetPct >= 0 ? '+' : ''}${totalRetPct.toFixed(1)}%` : '—',
              style: { color: totalRetPct === null ? '#ffffff44' : totalRetPct >= 0 ? '#4ade80' : '#f87171' },
              clickable: true,
            },
          ].map(({ label, value, style, clickable }) => (
            <div
              key={label}
              onClick={() => clickable && rows.length > 0 && setShowChart(s => !s)}
              className="px-4 py-3 transition-all"
              style={{
                background: '#0d1117',
                cursor: clickable && rows.length > 0 ? 'pointer' : 'default',
                ...(clickable && showChart ? { background: PF_YELLOW + '12', borderBottom: `2px solid ${PF_YELLOW}` } : {}),
              }}
              onMouseEnter={e => { if (clickable && rows.length > 0) e.currentTarget.style.background = '#ffffff08' }}
              onMouseLeave={e => { e.currentTarget.style.background = clickable && showChart ? PF_YELLOW + '12' : '#0d1117' }}
            >
              <div className="text-[10px] uppercase tracking-wider" style={{ color: '#ffffff33' }}>
                {label}{clickable && rows.length > 0 && <span style={{ color: '#ffffff22', marginLeft: 4 }}>{showChart ? '▲' : '▼'}</span>}
              </div>
              <div className="text-sm font-black mt-0.5" style={style}>{value}</div>
            </div>
          ))}
        </div>

        {/* Score panel */}
        {rows.length > 0 && (
          <div className="grid grid-cols-2 gap-px shrink-0" style={{ background: '#ffffff08', borderBottom: '1px solid #ffffff10' }}>
            {[
              {
                title: 'Diversification',
                score: divScore,
                grade: divGrade,
                stats: [
                  { label: 'Asset classes', value: classCount },
                  { label: 'Concentration (HHI)', value: hhi.toFixed(2) },
                ],
              },
              {
                title: 'Risk-Return',
                score: rrScore,
                grade: rrGrade,
                stats: [
                  { label: 'Ann. return', value: `${annualisedReturn >= 0 ? '+' : ''}${annualisedReturn.toFixed(1)}%` },
                  { label: 'Portfolio vol', value: `${weightedVol.toFixed(1)}%` },
                ],
              },
            ].map(({ title, score, grade, stats }) => (
              <div key={title} className="px-4 py-3" style={{ background: '#0d1117' }}>
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#ffffff33' }}>{title} Score</div>
                <div className="flex items-center gap-3">
                  {/* Gauge bar */}
                  <div className="flex-1">
                    <div className="h-1.5 rounded-full" style={{ background: '#ffffff0f' }}>
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${score}%`, background: grade.col }}
                      />
                    </div>
                  </div>
                  {/* Grade badge */}
                  <div
                    className="text-xs font-black px-2 py-0.5 rounded"
                    style={{ background: grade.col + '22', color: grade.col, minWidth: 26, textAlign: 'center' }}
                  >
                    {grade.g}
                  </div>
                  {/* Numeric score */}
                  <div className="text-sm font-black" style={{ color: grade.col, minWidth: 36, textAlign: 'right' }}>
                    {score}<span className="text-[9px] font-normal" style={{ color: grade.col + '88' }}>/100</span>
                  </div>
                </div>
                <div className="text-[10px] mt-1 mb-1.5" style={{ color: grade.col + 'bb' }}>{grade.label}</div>
                <div className="flex gap-4">
                  {stats.map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-[9px]" style={{ color: '#ffffff33' }}>{label}</div>
                      <div className="text-xs font-semibold" style={{ color: '#ffffff88' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Portfolio chart — shown when Total Return is clicked */}
        {showChart && chartData.length > 1 && (
          <div className="px-5 pt-4 pb-2 shrink-0" style={{ borderBottom: '1px solid #ffffff0a' }}>
            <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: '#ffffff33' }}>
              Portfolio value over time (current holdings)
            </div>
            <PortfolioChart data={chartData} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
            {hoveredPoint && (
              <div className="mt-2 flex justify-between text-xs" style={{ color: '#ffffff55' }}>
                <span>{hoveredPoint.year}</span>
                <span style={{ color: PF_YELLOW, fontWeight: 700 }}>{fmtCHFshort(hoveredPoint.value)}</span>
              </div>
            )}
          </div>
        )}

        {/* Holdings table */}
        {rows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#ffffff33' }}>
            No holdings yet. Buy assets from the district markets.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider sticky top-0"
              style={{ color: '#ffffff33', background: '#0d1117', borderBottom: '1px solid #ffffff08' }}>
              <span>Asset</span>
              <span className="text-right w-20">Shares</span>
              <span className="text-right w-24">Price</span>
              <span className="text-right w-24">Value</span>
              <span className="text-right w-20">Return</span>
            </div>

            {rows.map(({ id, inst, h, price, value, gain, returnPct }) => {
              const pos = returnPct >= 0
              return (
                <div key={id}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-4 py-2.5 transition-colors"
                  style={{ borderBottom: '1px solid #ffffff06' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#ffffff05'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <div className="text-white text-sm font-semibold">{inst.name}</div>
                    <div className="text-xs" style={{ color: '#ffffff33' }}>{inst.description}</div>
                  </div>
                  <div className="text-xs font-mono text-right w-20" style={{ color: '#ffffff66' }}>{fmtShares(h.shares)}</div>
                  <div className="text-xs font-mono text-right w-24" style={{ color: '#ffffff66' }}>{fmtCHF(price)}</div>
                  <div className="text-xs font-bold font-mono text-right w-24 text-white">{fmtCHF(value)}</div>
                  <div className="text-xs font-black text-right w-20" style={{ color: pos ? '#4ade80' : '#f87171' }}>
                    {pos ? '+' : ''}{returnPct.toFixed(1)}%
                    <div className="text-[9px] font-normal" style={{ color: pos ? '#4ade8088' : '#f8717188' }}>
                      {pos ? '+' : ''}{fmtCHF(gain)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        {rows.length > 0 && (
          <div className="px-4 py-2 flex items-center justify-between shrink-0" style={{ borderTop: '1px solid #ffffff10' }}>
            <span className="text-xs" style={{ color: '#ffffff33' }}>Total unrealised P&amp;L</span>
            <span className="text-sm font-black" style={{ color: totalGain >= 0 ? '#4ade80' : '#f87171' }}>
              {totalGain >= 0 ? '+' : ''}{fmtCHF(totalGain)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── SVG line/area chart ───────────────────────────────────────────────────────
function PortfolioChart({ data, hoverIdx, setHoverIdx }) {
  const W = 600, H = 120, PL = 8, PR = 8, PT = 8, PB = 20
  const iW = W - PL - PR
  const iH = H - PT - PB

  const vals   = data.map(d => d.value)
  const minVal = Math.min(0, ...vals)
  const maxVal = Math.max(...vals) * 1.08 || 1

  const toX = i  => PL + (i / (data.length - 1)) * iW
  const toY = v  => PT + iH - ((v - minVal) / (maxVal - minVal)) * iH

  const linePts  = data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ')
  const areaPath = [
    `M ${toX(0)},${toY(0)}`,
    ...data.map((d, i) => `L ${toX(i)},${toY(d.value)}`),
    `L ${toX(data.length - 1)},${toY(0)}`,
    'Z',
  ].join(' ')

  // Year labels: first, middle, last
  const labelIdxs = [0, Math.floor((data.length - 1) / 2), data.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      style={{ overflow: 'visible', cursor: 'crosshair' }}
      onMouseLeave={() => setHoverIdx(null)}
      onMouseMove={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        const mx   = ((e.clientX - rect.left) / rect.width) * W - PL
        const idx  = Math.round((mx / iW) * (data.length - 1))
        setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)))
      }}
    >
      <defs>
        <linearGradient id="pfGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={PF_YELLOW} stopOpacity="0.28" />
          <stop offset="100%" stopColor={PF_YELLOW} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Zero baseline */}
      <line x1={PL} y1={toY(0)} x2={W - PR} y2={toY(0)} stroke="#ffffff10" strokeWidth="1" />

      {/* Area fill */}
      <path d={areaPath} fill="url(#pfGrad)" />

      {/* Line */}
      <polyline points={linePts} fill="none" stroke={PF_YELLOW} strokeWidth="1.8" strokeLinejoin="round" />

      {/* Year labels */}
      {labelIdxs.map(i => (
        <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#ffffff33">{data[i].year}</text>
      ))}

      {/* Hover indicator */}
      {hoverIdx !== null && (
        <>
          <line
            x1={toX(hoverIdx)} y1={PT}
            x2={toX(hoverIdx)} y2={PT + iH}
            stroke={PF_YELLOW} strokeWidth="1" strokeDasharray="3 2" opacity="0.5"
          />
          <circle cx={toX(hoverIdx)} cy={toY(data[hoverIdx].value)} r="4" fill={PF_YELLOW} />
        </>
      )}
    </svg>
  )
}
