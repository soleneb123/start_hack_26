import { useEffect, useState } from 'react'
import { ASSET_ORDER } from '../../data/assetData'

const DISTRICT_LABELS = {
  bonds:         'Bonds',
  equityIndices: 'Indices',
  gold:          'Gold',
  smiStocks:     'Swiss',
  singleStocks:  'Tech',
  fx:            'FX',
}

function getFeedback(count, missingDistricts) {
  const missing = missingDistricts.map(d => DISTRICT_LABELS[d]).join(', ')
  if (count === 0) return {
    icon: null, title: 'No Portfolio',
    color: '#DC2626', bg: '#450a0a',
    msg: 'You have no investments yet. Start by learning in the Library and buying your first asset.',
    extra: null,
  }
  if (count === 1) return {
    icon: null, title: 'Total Wipeout',
    color: '#DC2626', bg: '#450a0a',
    msg: 'All capital in one market. When that sector burns, you lose everything. Spread across at least 3 markets.',
    extra: `Missing: ${missing}`,
  }
  if (count === 2) return {
    icon: null, title: 'Severe Damage',
    color: '#EA580C', bg: '#431407',
    msg: 'Two markets is not enough. A correlated crash wipes out most of your portfolio.',
    extra: `Add: ${missing}`,
  }
  if (count === 3) return {
    icon: null, title: 'Significant Damage',
    color: '#F59E0B', bg: '#422006',
    msg: 'Decent start, but 3 markets leaves you vulnerable. Bonds and Gold are great safe havens to add.',
    extra: `Consider adding: ${missing}`,
  }
  if (count === 4) return {
    icon: null, title: 'Moderate Damage',
    color: '#F59E0B', bg: '#422006',
    msg: 'Good diversification! A few small fires but mostly under control. One or two more markets seals the deal.',
    extra: `You could still add: ${missing}`,
  }
  if (count === 5) return {
    icon: null, title: 'Minor Damage',
    color: '#22C55E', bg: '#052e16',
    msg: 'Strong portfolio. Firefighters contained almost every fire. Just one more market for full protection.',
    extra: `Last missing: ${missing}`,
  }
  return {
    icon: null, title: 'City Saved!',
    color: '#22C55E', bg: '#052e16',
    msg: 'Perfect diversification across all 6 markets. Your firefighters contained every fire. Textbook risk management!',
    extra: null,
  }
}

const TOTAL_TICKS = 4
const TICK_MS    = 3000

export default function FireDrillModal({ fireDrill, onClose }) {
  const [timeLeft, setTimeLeft] = useState(TOTAL_TICKS * TICK_MS / 1000)

  useEffect(() => {
    if (fireDrill?.phase !== 'running') return
    setTimeLeft(TOTAL_TICKS * TICK_MS / 1000)
    const id = setInterval(() => setTimeLeft(t => Math.max(0, +(t - 0.1).toFixed(1))), 100)
    return () => clearInterval(id)
  }, [fireDrill?.phase])

  if (!fireDrill) return null

  const { phase, burning, diversifiedCount, missingDistricts } = fireDrill
  const feedback = getFeedback(diversifiedCount, missingDistricts)
  const progress = (TOTAL_TICKS * TICK_MS / 1000 - timeLeft) / (TOTAL_TICKS * TICK_MS / 1000)

  return (
    <div style={{
      position: 'fixed',
      bottom: 56,
      left: 16,
      zIndex: 50,
      width: phase === 'result' ? 340 : 280,
      background: '#0f172aee',
      border: `2px solid ${phase === 'result' ? feedback.color + '88' : '#f97316aa'}`,
      borderRadius: 16,
      boxShadow: '0 8px 32px #000000cc',
      fontFamily: 'system-ui, sans-serif',
      overflow: 'hidden',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid #1e293b',
        background: phase === 'result' ? feedback.bg + 'cc' : '#1e293bcc',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'white', fontWeight: 800, fontSize: 13 }}>
            {phase === 'running' ? 'Fire Emergency' : feedback.title}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 10 }}>
            {phase === 'running' ? 'Fire spreading through city…' : 'Risk assessment complete'}
          </div>
        </div>
        {phase === 'result' && (
          <button
            onClick={onClose}
            style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.08)', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '1px 8px' }}
          >×</button>
        )}
      </div>

      {/* Running phase */}
      {phase === 'running' && (
        <div style={{ padding: '12px 14px' }}>
          {/* Progress bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
              <span>Simulation</span>
              <span>{timeLeft.toFixed(0)}s left</span>
            </div>
            <div style={{ height: 6, background: '#1e293b', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${progress * 100}%`, background: 'linear-gradient(90deg,#F59E0B,#DC2626)', transition: 'width 0.1s linear' }} />
            </div>
          </div>

          {/* Fire count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', borderRadius: 10, padding: '8px 12px' }}>
            <div>
              <div style={{ color: '#fb923c', fontWeight: 800, fontSize: 18 }}>{burning.size}</div>
              <div style={{ color: '#94a3b8', fontSize: 10 }}>building{burning.size !== 1 ? 's' : ''} on fire</div>
            </div>
          </div>

          {/* District coverage */}
          <div style={{ display: 'flex', gap: 4, marginTop: 10, justifyContent: 'space-between' }}>
            {ASSET_ORDER.map(id => {
              const has = !missingDistricts.includes(id)
              return (
                <div key={id} style={{ textAlign: 'center', opacity: has ? 1 : 0.35 }}>
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{DISTRICT_LABELS[id]}</div>
                  <div style={{ fontSize: 9, color: has ? '#4ade80' : '#f87171', marginTop: 2 }}>{has ? 'Y' : 'N'}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Result phase */}
      {phase === 'result' && (
        <div style={{ padding: '12px 14px' }}>
          {/* Score bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
              <span>Diversification</span>
              <span style={{ fontWeight: 700, color: feedback.color }}>{diversifiedCount}/{ASSET_ORDER.length} markets</span>
            </div>
            <div style={{ height: 8, background: '#1e293b', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${(diversifiedCount / ASSET_ORDER.length) * 100}%`, background: feedback.color }} />
            </div>
            <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: feedback.color, marginTop: 4 }}>
              {Math.round((diversifiedCount / ASSET_ORDER.length) * 100)}%
            </div>
          </div>

          {/* Damage summary */}
          <div style={{
            borderRadius: 10, padding: '10px 12px', marginBottom: 10,
            background: burning.size > 0 ? '#450a0a88' : '#052e1688',
            border: `1px solid ${burning.size > 0 ? '#7f1d1d88' : '#14532d88'}`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: feedback.color, marginBottom: 4 }}>
              {burning.size > 0
                ? `${burning.size} holding${burning.size !== 1 ? 's' : ''} lost`
                : 'Fully diversified — all assets protected'}
            </div>
            <p style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.5, margin: 0 }}>{feedback.msg}</p>
            {burning.size > 0 && (
              <div style={{ marginTop: 6, fontSize: 10, color: '#fca5a5', borderTop: '1px solid #7f1d1d55', paddingTop: 6, fontWeight: 600 }}>
                Those positions were sold at market value.
              </div>
            )}
            {feedback.extra && (
              <div style={{ marginTop: 4, fontSize: 10, color: '#64748b', borderTop: '1px solid #1e293b', paddingTop: 4 }}>
                {feedback.extra}
              </div>
            )}
          </div>

          {/* Market grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginBottom: 12 }}>
            {ASSET_ORDER.map(id => {
              const invested = !missingDistricts.includes(id)
              return (
                <div key={id} style={{
                  borderRadius: 8, padding: '4px 2px', textAlign: 'center',
                  border: `1px solid ${invested ? '#15803d88' : '#991b1b88'}`,
                  background: invested ? '#052e1644' : '#450a0a44',
                }}>
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, opacity: invested ? 1 : 0.4 }}>{DISTRICT_LABELS[id]}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: invested ? '#4ade80' : '#f87171', marginTop: 2 }}>
                    {invested ? 'Safe' : 'Burnt'}
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10, fontWeight: 700,
              color: 'white', fontSize: 12, border: 'none', cursor: 'pointer',
              background: feedback.color,
            }}
          >
            Got it — back to city
          </button>
        </div>
      )}
    </div>
  )
}
