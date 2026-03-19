import { useState, useEffect } from 'react'
import { logoutUser } from '../../firebase/auth'
import { useAuth } from '../../hooks/useAuth.jsx'
import { ASSET_ORDER } from '../../data/assetData'
import { GAME_END_YEAR, GAME_START_YEAR } from '../../data/stockData'
import { getPrice } from '../../firebase/firestore'

const PF_YELLOW = '#FFD000'

export default function Header({ onOpenLeaderboard, onOpenLibrary, currentYear, yearProgress = 0, isFinished, onRestart, onFireDrill, onNewGame, simPaused, onToggleSim, speedMode, onToggleSpeed }) {
  const [light, setLight] = useState(() => localStorage.getItem('pf-theme') === 'light')

  useEffect(() => {
    document.body.classList.toggle('light', light)
    localStorage.setItem('pf-theme', light ? 'light' : 'dark')
  }, [light])
  const { user, userData } = useAuth()
  const cash          = userData?.cash ?? userData?.capital ?? 10000
  const totalYears    = GAME_END_YEAR - GAME_START_YEAR

  const portfolio = userData?.portfolio || {}
  let portfolioValue    = 0
  let portfolioInvested = 0
  for (const [instId, h] of Object.entries(portfolio)) {
    if ((h.shares || 0) > 0) {
      const price = getPrice(instId, currentYear)
      portfolioValue    += h.shares * price
      portfolioInvested += (h.avgPurchasePrice || price) * h.shares
    }
  }
  const portfolioGain   = portfolioValue - portfolioInvested
  const portfolioRetPct = portfolioInvested > 0 ? (portfolioGain / portfolioInvested) * 100 : null
  const totalNetWorth   = cash + portfolioValue

  return (
    <header style={{ borderBottom: `1px solid ${PF_YELLOW}22` }} className="pf-header absolute top-0 left-0 right-0 z-30 bg-[#0d1117] backdrop-blur">
      <div className="flex items-center justify-between px-5 py-0" style={{ height: 48 }}>

        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-black text-white text-base tracking-tight select-none">
            Invest<span style={{ color: PF_YELLOW }}>opia</span>
          </span>
          <div style={{ width: 1, height: 20, background: '#ffffff18' }} />
          <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: PF_YELLOW + 'AA' }}>by PostFinance</span>
        </div>

        {/* Center stats */}
        <div className="flex items-center gap-1">
          <StatPill label="Cash" value={`CHF ${cash.toLocaleString('de-CH', { maximumFractionDigits: 0 })}`} valueStyle={{ color: PF_YELLOW, fontWeight: 800 }} />
          <PortfolioStat netWorth={totalNetWorth} returnPct={portfolioRetPct} gain={portfolioGain} />

          {/* Year block */}
          <div style={{ borderLeft: '1px solid #ffffff10', borderRight: '1px solid #ffffff10' }} className="flex items-center gap-2 px-3 h-full py-2">
            <div>
              <div className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: '#ffffff44' }}>Year</div>
              <div className="text-sm font-black leading-tight" style={{ color: PF_YELLOW }}>{currentYear}</div>
            </div>
            <div className="flex flex-col gap-0.5 w-16">
              <div className="flex justify-between" style={{ fontSize: 8, color: '#ffffff30' }}>
                <span>{GAME_START_YEAR}</span><span>{GAME_END_YEAR}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: '#ffffff18' }}>
                <div className="h-full rounded-full" style={{ width: `${((currentYear - GAME_START_YEAR) / totalYears) * 100}%`, background: PF_YELLOW, transition: 'none' }} />
              </div>
              {!isFinished && (
                <div className="h-0.5 rounded-full overflow-hidden" style={{ background: '#ffffff12' }}>
                  <div className="h-full rounded-full" style={{ width: `${yearProgress * 100}%`, background: PF_YELLOW + '60', transition: 'none' }} />
                </div>
              )}
            </div>
            {!isFinished && (
              <button
                onClick={onToggleSim}
                title={simPaused ? 'Start simulation' : 'Pause simulation'}
                style={simPaused
                  ? { background: PF_YELLOW, color: '#0d1117', border: 'none' }
                  : { background: '#ffffff14', color: '#ffffffCC', border: '1px solid #ffffff20' }
                }
                className="w-7 h-7 rounded flex items-center justify-center text-xs font-black transition-all"
              >
                {simPaused ? '▶' : '⏸'}
              </button>
            )}
            <button
              onClick={onRestart}
              title={`Reset to ${GAME_START_YEAR}`}
              className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold transition-all"
              style={{ background: '#ffffff0A', color: '#ffffff66', border: '1px solid #ffffff14' }}
            >
              ↺
            </button>
          </div>

          <StatPill label="Player" value={user?.displayName || 'Investor'} valueStyle={{ color: '#ffffffCC', fontWeight: 600 }} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {isFinished && <span className="text-[11px] px-2" style={{ color: '#ffffff44' }}>{GAME_END_YEAR} — final year</span>}

          <NavBtn onClick={() => setLight(l => !l)} title={light ? 'Switch to dark mode' : 'Switch to light mode'}>
            {light ? 'Dark' : 'Light'}
          </NavBtn>
          <NavBtn onClick={onToggleSpeed} active={speedMode} title={speedMode ? '0.5s/year — click to slow down' : 'Demo mode: 0.5s/year'}>
            {speedMode ? 'Demo On' : 'Demo'}
          </NavBtn>
          <NavBtn onClick={onFireDrill} title="Test your diversification">Risk Drill</NavBtn>
          <NavBtn onClick={onOpenLibrary}>Library</NavBtn>
          <NavBtn onClick={onOpenLeaderboard}>Leaderboard</NavBtn>

          <div style={{ width: 1, height: 20, background: '#ffffff14', margin: '0 4px' }} />

          <NavBtn onClick={onRestart} title="Reset year to 2007">Restart</NavBtn>
          <NavBtn onClick={onNewGame} title="Wipe all progress and start fresh" danger>New Game</NavBtn>
          <button
            onClick={logoutUser}
            className="px-2 py-1 text-[11px] transition-all rounded"
            style={{ color: '#ffffff33' }}
            onMouseEnter={e => e.target.style.color = '#ffffffAA'}
            onMouseLeave={e => e.target.style.color = '#ffffff33'}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* PostFinance yellow accent line at bottom */}
      <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${PF_YELLOW}66, transparent)` }} />
    </header>
  )
}

function StatPill({ label, value, valueStyle }) {
  return (
    <div className="flex flex-col px-3 py-1.5" style={{ borderRight: '1px solid #ffffff10' }}>
      <div className="text-[9px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: '#ffffff44' }}>{label}</div>
      <div className="text-xs leading-tight" style={valueStyle}>{value}</div>
    </div>
  )
}

function PortfolioStat({ netWorth, returnPct, gain }) {
  const positive = gain >= 0
  const retColor = positive ? '#4ade80' : '#f87171'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderRight: '1px solid #ffffff10' }}>
      <div>
        <div className="text-[9px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: '#ffffff44' }}>Net Worth</div>
        <div className="text-xs font-bold leading-tight text-white">
          CHF {netWorth.toLocaleString('de-CH', { maximumFractionDigits: 0 })}
        </div>
      </div>
      {returnPct !== null && (
        <div className="text-xs font-black leading-tight pl-2" style={{ borderLeft: '1px solid #ffffff14', color: retColor }}>
          {positive ? '+' : ''}{returnPct.toFixed(1)}%
        </div>
      )}
    </div>
  )
}

function NavBtn({ children, onClick, title, active, danger }) {
  const base = {
    fontSize: 11, fontWeight: 600, padding: '4px 10px',
    borderRadius: 4, border: '1px solid', cursor: 'pointer',
    transition: 'all 0.15s',
  }
  const style = active
    ? { ...base, background: PF_YELLOW, color: '#0d1117', borderColor: PF_YELLOW }
    : danger
    ? { ...base, background: 'transparent', color: '#ffffff44', borderColor: '#ffffff14' }
    : { ...base, background: 'transparent', color: '#ffffffBB', borderColor: '#ffffff18' }

  return (
    <button
      onClick={onClick}
      title={title}
      style={style}
      onMouseEnter={e => {
        if (active) return
        e.currentTarget.style.background = danger ? '#ff000022' : `${PF_YELLOW}18`
        e.currentTarget.style.color = danger ? '#f87171' : '#FFD000'
        e.currentTarget.style.borderColor = danger ? '#f8717144' : `${PF_YELLOW}66`
      }}
      onMouseLeave={e => {
        if (active) return
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = danger ? '#ffffff44' : '#ffffffBB'
        e.currentTarget.style.borderColor = danger ? '#ffffff14' : '#ffffff18'
      }}
    >
      {children}
    </button>
  )
}
