import { INSTRUMENTS } from '../../data/stockData'
import { getPrice } from '../../firebase/firestore'

function fmtCHF(n) {
  return `CHF ${(+n).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtShares(n) {
  return n >= 1 ? n.toFixed(4) : n.toFixed(6)
}

export default function PortfolioModal({ onClose, portfolio = {}, cash = 10000, currentYear }) {
  const rows = Object.entries(portfolio)
    .filter(([, h]) => (h.shares || 0) > 0)
    .map(([id, h]) => {
      const inst       = INSTRUMENTS[id] || {}
      const price      = getPrice(id, currentYear)
      const value      = h.shares * price
      const invested   = (h.avgPurchasePrice || price) * h.shares
      const gain       = value - invested
      const returnPct  = invested > 0 ? ((value / invested) - 1) * 100 : 0
      return { id, inst, h, price, value, invested, gain, returnPct }
    })
    .sort((a, b) => b.value - a.value)

  const totalValue    = rows.reduce((s, r) => s + r.value, 0)
  const totalInvested = rows.reduce((s, r) => s + r.invested, 0)
  const totalGain     = totalValue - totalInvested
  const totalRetPct   = totalInvested > 0 ? ((totalValue / totalInvested) - 1) * 100 : null
  const netWorth      = cash + totalValue

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="pf-modal relative bg-[#0d1117] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" style={{ border: '1px solid #FFD00022' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60">
          <div>
            <h2 className="text-white font-black text-lg">PostFinance — Portfolio Summary</h2>
            <div className="text-slate-400 text-xs mt-0.5">Year {currentYear} · All holdings at current prices</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-px bg-slate-700/30 border-b border-slate-700/40">
          {[
            { label: 'Cash',          value: fmtCHF(cash),      color: '' },
            { label: 'Portfolio',     value: fmtCHF(totalValue), color: 'text-white' },
            { label: 'Net Worth',     value: fmtCHF(netWorth),   color: 'text-white' },
            {
              label: 'Total Return',
              value: totalRetPct !== null
                ? `${totalRetPct >= 0 ? '+' : ''}${totalRetPct.toFixed(1)}%`
                : '—',
              color: totalRetPct === null ? 'text-slate-400' : totalRetPct >= 0 ? 'text-green-400' : 'text-red-400',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-4 py-3 bg-slate-900">
              <div className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</div>
              <div className={`text-sm font-black mt-0.5 ${color || 'text-white'}`} style={label === 'Cash' || label === 'Net Worth' ? { color: '#FFD000' } : {}}>{value}</div>
            </div>
          ))}
        </div>

        {/* Holdings table */}
        {rows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            No holdings yet. Buy assets from the district markets.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-800 sticky top-0 bg-slate-900">
              <span>Asset</span>
              <span className="text-right w-20">Shares</span>
              <span className="text-right w-24">Price</span>
              <span className="text-right w-24">Value</span>
              <span className="text-right w-20">Return</span>
            </div>

            {rows.map(({ id, inst, h, price, value, gain, returnPct }) => {
              const pos = returnPct >= 0
              return (
                <div
                  key={id}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-4 py-2.5 border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors"
                >
                  <div>
                    <div className="text-white text-sm font-semibold">{inst.name}</div>
                    <div className="text-slate-500 text-xs">{inst.description}</div>
                  </div>
                  <div className="text-slate-300 text-xs font-mono text-right w-20">
                    {fmtShares(h.shares)}
                  </div>
                  <div className="text-slate-300 text-xs font-mono text-right w-24">
                    {fmtCHF(price)}
                  </div>
                  <div className="text-white text-xs font-bold font-mono text-right w-24">
                    {fmtCHF(value)}
                  </div>
                  <div className={`text-xs font-black text-right w-20 ${pos ? 'text-green-400' : 'text-red-400'}`}>
                    {pos ? '+' : ''}{returnPct.toFixed(1)}%
                    <div className={`text-[9px] font-normal ${pos ? 'text-green-600' : 'text-red-600'}`}>
                      {pos ? '+' : ''}{fmtCHF(gain)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer total gain */}
        {rows.length > 0 && (
          <div className="border-t border-slate-700/60 px-4 py-2 flex items-center justify-between">
            <span className="text-slate-500 text-xs">Total unrealised P&L</span>
            <span className={`text-sm font-black ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalGain >= 0 ? '+' : ''}{fmtCHF(totalGain)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
