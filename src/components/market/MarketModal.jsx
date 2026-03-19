import { useState } from 'react'
import { INSTRUMENTS, DISTRICT_INSTRUMENTS } from '../../data/stockData'
import { INSTRUMENT_INFO } from '../../data/instrumentInfo'
import { DISTRICT_CFG } from '../city/CityScene'
import { getPrice, buyStock, sellStock } from '../../firebase/firestore'

function pct(a, b) {
  if (!a || !b) return null
  return +((b / a - 1) * 100).toFixed(2)
}
function fmtCHF(n) {
  return `CHF ${(+n).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtShares(n) {
  return n >= 1 ? n.toFixed(4) : n.toFixed(6)
}

// ── Instrument info panel ─────────────────────────────────────────────────────
function InfoPanel({ id }) {
  const info = INSTRUMENT_INFO[id]
  if (!info) return (
    <div className="px-5 py-4 bg-slate-800/60 border-t border-slate-700/40 text-slate-500 text-xs">
      No long-term analysis available yet.
    </div>
  )

  return (
    <div className="px-5 py-4 bg-slate-950/80 border-t border-slate-700/40 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-slate-400 font-semibold">Horizon:</span>
        <span className="font-bold px-2.5 py-0.5 rounded-full text-[11px]"
          style={{ background: info.horizonColor + '22', color: info.horizonColor, border: `1px solid ${info.horizonColor}44` }}>
          {info.horizon}
        </span>
      </div>
      <p className="text-slate-300 leading-relaxed text-[13px]">{info.thesis}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-900/20 border border-green-800/30 rounded-xl p-3">
          <div className="text-green-400 font-bold mb-1.5 text-[11px] uppercase tracking-wide">Drivers</div>
          <ul className="space-y-1">
            {info.drivers.map((d, i) => (
              <li key={i} className="text-slate-400 leading-snug">· {d}</li>
            ))}
          </ul>
        </div>
        <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-3">
          <div className="text-red-400 font-bold mb-1.5 text-[11px] uppercase tracking-wide">Risks</div>
          <ul className="space-y-1">
            {info.risks.map((r, i) => (
              <li key={i} className="text-slate-400 leading-snug">· {r}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-2.5">
        <span className="text-amber-400 font-bold">Verdict: </span>
        <span className="text-slate-300">{info.verdict}</span>
      </div>
    </div>
  )
}

// ── Single instrument row ─────────────────────────────────────────────────────
function InstrumentRow({ uid, id, currentYear, cash, holding, onRefresh }) {
  const inst      = INSTRUMENTS[id]
  const price     = getPrice(id, currentYear)
  const prevPrice = getPrice(id, currentYear - 1)
  const change    = pct(prevPrice, price)
  const heldShares = holding?.shares || 0
  const heldValue  = heldShares * price
  const avgPrice   = holding?.avgPurchasePrice || price
  const totalReturn = heldShares > 0 ? pct(avgPrice, price) : null

  const [expanded, setExpanded] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [buyAmount, setBuyAmount] = useState('')
  const [sellPct, setSellPct]   = useState(100)
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState(null)

  const handleBuy = async () => {
    const amt = parseFloat(buyAmount)
    if (!amt || amt <= 0) return
    setBusy(true); setErr(null)
    try {
      await buyStock(uid, id, amt)
      setBuyAmount('')
      await onRefresh()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const handleSell = async () => {
    const shares = heldShares * (sellPct / 100)
    setBusy(true); setErr(null)
    try {
      await sellStock(uid, id, shares)
      await onRefresh()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const sharesForAmount = buyAmount ? parseFloat(buyAmount) / price : 0
  const sharesToSell    = heldShares * (sellPct / 100)

  return (
    <div className="rounded-lg transition-colors" style={{ border: heldShares > 0 ? '1px solid #FFD00033' : '1px solid #ffffff12' }}>
      {/* Summary row */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
        {/* ⓘ info button */}
        <button
          onClick={() => setShowInfo(v => !v)}
          title="Long-term investor perspective"
          className={`shrink-0 w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center transition-all border ${
            showInfo
              ? 'bg-amber-500 border-amber-400 text-black'
              : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-amber-500 hover:text-amber-400'
          }`}
        >
          i
        </button>

        {/* Main clickable area → expand buy/sell */}
        <button
          className="flex-1 flex items-center gap-4 text-left min-w-0"
          onClick={() => setExpanded(e => !e)}
        >
          {/* Name + description */}
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold text-sm">{inst.name}</div>
            <div className="text-slate-500 text-xs mt-0.5">{inst.description}</div>
          </div>

          {/* Price + YoY */}
          <div className="text-right shrink-0 w-32">
            <div className="text-white text-sm font-mono font-bold">{fmtCHF(price)}</div>
            {change !== null && (
              <div className={`text-xs font-semibold mt-0.5 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {change >= 0 ? '+' : ''}{change}% YoY
              </div>
            )}
          </div>

          {/* Holding */}
          {heldShares > 0 && (
            <div className="text-right shrink-0 w-32 border-l border-slate-700 pl-3">
              <div className="text-sm font-bold font-mono" style={{ color: '#FFD000' }}>{fmtCHF(heldValue)}</div>
              <div className={`text-xs mt-0.5 font-semibold ${totalReturn !== null && totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalReturn !== null ? `${totalReturn >= 0 ? '+' : ''}${totalReturn}% tot.` : `${fmtShares(heldShares)} sh.`}
              </div>
            </div>
          )}

          <span className="text-slate-600 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Long-term info panel */}
      {showInfo && <InfoPanel id={id} />}

      {/* Expanded buy/sell panel */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-5 py-4 bg-slate-900/50">
          <div className="flex gap-5 flex-wrap">
            {/* Buy */}
            <div className="flex-1 min-w-[200px]">
              <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">Buy</div>
              <div className="flex gap-2">
                <input
                  type="number" min="0" step="100" placeholder="CHF amount"
                  value={buyAmount}
                  onChange={e => setBuyAmount(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 font-mono"
                />
                <button
                  onClick={handleBuy}
                  disabled={busy || !buyAmount || parseFloat(buyAmount) > cash || parseFloat(buyAmount) <= 0}
                  className="disabled:opacity-40 text-xs font-bold px-4 py-2 rounded transition-colors"
                  style={{ background: '#FFD000', color: '#0d1117' }}
                >
                  {busy ? '…' : 'Buy'}
                </button>
              </div>
              {buyAmount > 0 && (
                <div className="text-slate-400 text-xs mt-1.5 font-mono">≈ {fmtShares(sharesForAmount)} shares</div>
              )}
              <div className="text-slate-500 text-xs mt-1">Available: <span className="text-slate-300 font-mono">{fmtCHF(cash)}</span></div>
            </div>

            {/* Sell */}
            {heldShares > 0 && (
              <div className="flex-1 min-w-[200px]">
                <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">Sell</div>
                <div className="flex gap-2">
                  <select
                    value={sellPct}
                    onChange={e => setSellPct(+e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                  >
                    <option value={25}>25%</option>
                    <option value={50}>50%</option>
                    <option value={75}>75%</option>
                    <option value={100}>All (100%)</option>
                  </select>
                  <button
                    onClick={handleSell} disabled={busy}
                    className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                  >
                    {busy ? '…' : 'Sell'}
                  </button>
                </div>
                <div className="text-slate-400 text-xs mt-1.5 font-mono">
                  {fmtShares(sharesToSell)} sh. → <span className="text-amber-400">{fmtCHF(sharesToSell * price)}</span>
                </div>
              </div>
            )}
          </div>

          {err && <div className="mt-3 text-red-400 text-xs font-semibold">{err}</div>}
        </div>
      )}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function MarketModal({ uid, districtId, currentYear, cash, portfolio, onClose, onRefresh }) {
  const cfg         = DISTRICT_CFG[districtId]
  const instruments = DISTRICT_INSTRUMENTS[districtId] || []

  const districtValue = instruments.reduce((sum, id) => {
    const h = portfolio[id]
    return h ? sum + h.shares * getPrice(id, currentYear) : sum
  }, 0)

  const districtInvested = instruments.reduce((sum, id) => {
    const h = portfolio[id]
    return h ? sum + (h.avgPurchasePrice || getPrice(id, currentYear)) * h.shares : sum
  }, 0)

  const districtReturn = districtInvested > 0 ? pct(districtInvested, districtValue) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="pf-modal relative bg-[#0d1117] rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl" style={{ border: '1px solid #FFD00022' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
          <div>
            <h2 className="text-white font-bold text-xl">{cfg?.icon} {cfg?.label}</h2>
            <div className="text-slate-400 text-sm mt-0.5">{cfg?.description}</div>
          </div>
          <div className="flex items-center gap-5">
            {districtValue > 0 && (
              <div className="text-right">
                <div className="font-bold text-base font-mono" style={{ color: '#FFD000' }}>{fmtCHF(districtValue)}</div>
                <div className={`text-xs font-semibold ${districtReturn !== null && districtReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {districtReturn !== null ? `${districtReturn >= 0 ? '+' : ''}${districtReturn}% total return` : 'invested here'}
                </div>
              </div>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none w-8 h-8 flex items-center justify-center">×</button>
          </div>
        </div>

        {/* Year badge */}
        <div className="px-6 pt-3 pb-2 flex items-center gap-3">
          <span className="bg-slate-800 border border-slate-600 text-slate-300 text-xs font-semibold px-3 py-1 rounded-full">
            Year {currentYear}
          </span>
          <span className="text-slate-500 text-xs">Prices at year-end · Click a row to trade</span>
        </div>

        {/* Column headers */}
        <div className="px-4 pb-1 flex items-center gap-3 text-[10px] text-slate-600 uppercase tracking-wider font-semibold">
          <div className="w-6 shrink-0" />
          <div className="flex-1 pl-1">Instrument</div>
          <div className="w-32 text-right pr-1">Price / YoY</div>
          <div className="w-32 text-right pr-1">Your Position</div>
          <div className="w-5 shrink-0" />
        </div>

        {/* Instrument list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 flex flex-col gap-1.5">
          {instruments.map(id => (
            <InstrumentRow
              key={id}
              uid={uid}
              id={id}
              currentYear={currentYear}
              cash={cash}
              holding={portfolio[id]}
              onRefresh={onRefresh}
            />
          ))}
        </div>

        <div className="border-t border-slate-700/60 px-6 py-2.5 text-xs text-slate-600">
          Advance the year on the city map to see how your investments perform.
        </div>
      </div>
    </div>
  )
}
