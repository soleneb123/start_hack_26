export default function StreakModal({ streakData, onClose }) {
  if (!streakData) return null

  const { streak, bonus, xp, newlyUnlockedAssetManager } = streakData
  const flames = Math.min(streak, 7)
  const isRecord = streak >= 7

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="pf-modal relative bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        {/* Flame */}
        <div className="text-6xl mb-2 animate-bounce">🔥</div>

        <h2 className="text-white text-2xl font-bold mb-1">
          Day {streak} Streak!
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          {streak === 1
            ? 'Welcome back! Keep coming back daily.'
            : isRecord
            ? '🏆 Max streak reached! You\'re unstoppable.'
            : `${7 - streak} more day${7 - streak !== 1 ? 's' : ''} to reach max rewards.`}
        </p>

        {/* Special unlock banner at day 5 */}
        {newlyUnlockedAssetManager && (
          <div className="bg-amber-900/50 border border-amber-500/60 rounded-xl px-4 py-3 mb-5 text-left">
            <div className="text-amber-400 font-bold text-sm mb-1">🗼 Asset Manager Unlocked!</div>
            <div className="text-slate-300 text-xs">The Eiffel Tower district is now open on your city map. You've been promoted to Asset Manager!</div>
          </div>
        )}

        {/* Flame bar */}
        <div className="flex justify-center gap-1 mb-6">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={`text-xl transition-all ${i < flames ? 'opacity-100' : 'opacity-20'}`}>
              🔥
            </span>
          ))}
        </div>

        {/* Rewards */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1 bg-slate-800 rounded-xl py-3 px-2">
            <div className="text-green-400 font-bold text-lg">+{bonus.toLocaleString()}</div>
            <div className="text-slate-400 text-xs">CHF Capital</div>
          </div>
          <div className="flex-1 bg-slate-800 rounded-xl py-3 px-2">
            <div className="text-amber-400 font-bold text-lg">+{xp}</div>
            <div className="text-slate-400 text-xs">XP</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-colors"
        >
          Claim & Play 🏙️
        </button>
      </div>
    </div>
  )
}
