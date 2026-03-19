import { useState, useEffect } from 'react'
import { getLeaderboard } from '../../firebase/firestore'
import { getScoreGrade } from '../../utils/simulation'
import { useAuth } from '../../hooks/useAuth.jsx'

export default function Leaderboard({ onClose }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    getLeaderboard()
      .then(data => { setEntries(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="pf-modal relative bg-slate-900 border border-slate-700 rounded-2xl w-[520px] max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <h2 className="text-lg font-bold text-white">City Leaderboard</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
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
                  <div
                    key={entry.id}
                    className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${
                      isMe ? 'border-green-500/50 bg-green-900/20' : 'border-slate-700 bg-slate-800/30'
                    }`}
                  >
                    <div className="w-8 text-center font-black text-lg" style={{ color: idx < 3 ? ['#fbbf24', '#94a3b8', '#cd7c3a'][idx] : '#64748b' }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-sm truncate">{entry.username || 'Anonymous'}</span>
                        {isMe && <span className="text-green-400 text-xs">(you)</span>}
                      </div>
                      <div className="text-slate-400 text-xs">
                        {entry.unlockedAreas?.length || 0}/6 areas unlocked
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-lg" style={{ color: grade.color }}>{grade.grade}</div>
                      <div className="text-slate-400 text-xs">{(entry.totalScore || 0).toLocaleString()} pts</div>
                    </div>
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
