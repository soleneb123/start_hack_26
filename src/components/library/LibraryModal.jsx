import { useState } from 'react'
import { QUIZZES } from '../../data/quizData'
import { ASSET_ORDER, ASSET_CLASSES } from '../../data/assetData'
import { markQuizComplete, unlockArea } from '../../firebase/firestore'
import { useAuth } from '../../hooks/useAuth.jsx'

const AREA_CONFIG = {
  bonds: { color: '#60a5fa', icon: '🏛️' },
  gold: { color: '#fbbf24', icon: '⛏️' },
  smiStocks: { color: '#f97316', icon: '🇨🇭' },
  equityIndices: { color: '#4ade80', icon: '🌐' },
  singleStocks: { color: '#a78bfa', icon: '📈' },
  fx: { color: '#22d3ee', icon: '✈️' },
}

export default function LibraryModal({ onClose, unlockedAreas, onUnlock }) {
  const [selectedModule, setSelectedModule] = useState(null)
  const [quizState, setQuizState] = useState(null) // null | 'intro' | 'quiz' | 'result'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="pf-modal relative bg-slate-900 border border-slate-700 rounded-2xl w-[720px] max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📚</span>
            <div>
              <h2 className="text-lg font-bold text-white">Investment Library</h2>
              <p className="text-slate-400 text-xs">Learn about each asset class and unlock your city</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {!selectedModule ? (
            <ModuleList unlockedAreas={unlockedAreas} onSelect={setSelectedModule} />
          ) : quizState === null ? (
            <ModuleIntro
              moduleId={selectedModule}
              unlocked={unlockedAreas.includes(selectedModule)}
              onStartQuiz={() => setQuizState('quiz')}
              onBack={() => setSelectedModule(null)}
            />
          ) : quizState === 'quiz' ? (
            <QuizView
              moduleId={selectedModule}
              onComplete={(result) => {
                setQuizState({ type: 'result', ...result })
              }}
              onBack={() => setQuizState(null)}
            />
          ) : (
            <QuizResult
              moduleId={selectedModule}
              result={quizState}
              alreadyUnlocked={unlockedAreas.includes(selectedModule)}
              onUnlock={() => onUnlock(selectedModule, quizState.correctCount)}
              onBack={() => { setSelectedModule(null); setQuizState(null) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ModuleList({ unlockedAreas, onSelect }) {
  return (
    <div className="p-6 grid grid-cols-2 gap-4">
      {ASSET_ORDER.map((id, idx) => {
        const quiz = QUIZZES[id]
        const config = AREA_CONFIG[id]
        const unlocked = unlockedAreas.includes(id)
        const isAvailable = idx === 0 || unlockedAreas.includes(ASSET_ORDER[idx - 1])

        return (
          <button
            key={id}
            onClick={() => isAvailable && onSelect(id)}
            className={`text-left p-4 rounded-xl border transition-all ${
              unlocked
                ? 'border-green-500/30 bg-green-900/20 hover:bg-green-900/30'
                : isAvailable
                ? 'border-slate-600 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-500'
                : 'border-slate-700/30 bg-slate-900/30 opacity-40 cursor-not-allowed'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{config.icon}</span>
                <div>
                  <div className="font-semibold text-white text-sm">{quiz.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{ASSET_CLASSES[id]?.description?.split('.')[0]}</div>
                </div>
              </div>
              <span className="text-sm mt-0.5">
                {unlocked ? '✅' : isAvailable ? '🔓' : '🔒'}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: unlocked ? '100%' : '0%',
                    backgroundColor: config.color,
                  }}
                />
              </div>
              <span className="text-xs text-slate-400">{unlocked ? '5/5' : '0/5'}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ModuleIntro({ moduleId, unlocked, onStartQuiz, onBack }) {
  const quiz = QUIZZES[moduleId]
  const config = AREA_CONFIG[moduleId]
  const asset = ASSET_CLASSES[moduleId]

  return (
    <div className="p-8">
      <button onClick={onBack} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">
        ← Back to Library
      </button>

      <div className="flex items-center gap-4 mb-6">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
          style={{ backgroundColor: config.color + '22', border: `2px solid ${config.color}44` }}
        >
          {config.icon}
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{quiz.title}</h3>
          <p className="text-slate-400 text-sm">5 questions · Earn up to CHF 10,000</p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-5 mb-6 border border-slate-700">
        <p className="text-slate-300 leading-relaxed">{quiz.intro}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Avg Return" value={`${asset?.avgReturn}%/yr`} color={config.color} />
        <StatCard label="Volatility" value={`${asset?.volatility}%`} color={config.color} />
        <StatCard label="Capital Bonus" value="+CHF 2k/Q" color="#4ade80" />
      </div>

      {unlocked ? (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 text-green-300 text-center">
          ✅ You've already unlocked this area. You can retake the quiz for extra capital.
        </div>
      ) : null}

      <button
        onClick={onStartQuiz}
        className="w-full mt-4 py-3 rounded-xl font-bold text-black transition-all hover:scale-[1.02]"
        style={{ backgroundColor: config.color }}
      >
        {unlocked ? 'Retake Quiz' : 'Start Quiz & Unlock Area'}
      </button>
    </div>
  )
}

function QuizView({ moduleId, onComplete, onBack }) {
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({})
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)

  const quiz = QUIZZES[moduleId]
  const config = AREA_CONFIG[moduleId]
  const q = quiz.questions[current]
  const total = quiz.questions.length

  const handleSelect = (idx) => {
    if (revealed) return
    setSelected(idx)
  }

  const handleConfirm = () => {
    if (selected === null) return
    setRevealed(true)
    setAnswers(a => ({ ...a, [current]: selected }))
  }

  const handleNext = () => {
    if (current < total - 1) {
      setCurrent(c => c + 1)
      setSelected(null)
      setRevealed(false)
    } else {
      const correctCount = Object.entries({ ...answers, [current]: selected })
        .filter(([i, ans]) => ans === quiz.questions[parseInt(i)].correct).length
      onComplete({ correctCount, total })
    }
  }

  const isCorrect = revealed && selected === q.correct

  return (
    <div className="p-8">
      <button onClick={onBack} className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-2">
        ← Back
      </button>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(current / total) * 100}%`, backgroundColor: config.color }}
          />
        </div>
        <span className="text-slate-400 text-sm font-medium">{current + 1} / {total}</span>
      </div>

      {/* Question */}
      <div className="mb-6">
        <h3 className="text-white font-semibold text-lg leading-snug">{q.question}</h3>
      </div>

      {/* Options */}
      <div className="space-y-3 mb-6">
        {q.options.map((opt, i) => {
          let classes = 'w-full text-left p-4 rounded-xl border text-sm transition-all '
          if (!revealed) {
            classes += selected === i
              ? 'border-white bg-slate-700 text-white'
              : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
          } else {
            if (i === q.correct) classes += 'border-green-500 bg-green-900/30 text-green-300'
            else if (i === selected && i !== q.correct) classes += 'border-red-500 bg-red-900/30 text-red-300'
            else classes += 'border-slate-700 bg-slate-800/30 text-slate-500'
          }
          return (
            <button key={i} onClick={() => handleSelect(i)} className={classes}>
              <span className="font-semibold mr-2">{['A', 'B', 'C', 'D'][i]}.</span>
              {opt}
            </button>
          )
        })}
      </div>

      {/* Explanation */}
      {revealed && (
        <div className={`rounded-xl p-4 mb-4 border text-sm ${isCorrect ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-red-900/30 border-red-700 text-red-300'}`}>
          {isCorrect ? '✅ Correct! ' : '❌ Not quite. '}
          {q.explanation}
        </div>
      )}

      {!revealed ? (
        <button
          onClick={handleConfirm}
          disabled={selected === null}
          className="w-full py-3 rounded-xl font-bold text-black disabled:opacity-30 transition-all"
          style={{ backgroundColor: config.color }}
        >
          Confirm Answer
        </button>
      ) : (
        <button
          onClick={handleNext}
          className="w-full py-3 rounded-xl font-bold text-black transition-all"
          style={{ backgroundColor: config.color }}
        >
          {current < total - 1 ? 'Next Question →' : 'See Results'}
        </button>
      )}
    </div>
  )
}

function QuizResult({ moduleId, result, alreadyUnlocked, onUnlock, onBack }) {
  const config = AREA_CONFIG[moduleId]
  const { correctCount, total } = result
  const bonus = correctCount * 2000
  const passed = correctCount >= 3

  return (
    <div className="p-8 text-center">
      <div className="text-6xl mb-4">{passed ? '🎉' : '📖'}</div>
      <h3 className="text-2xl font-bold text-white mb-2">
        {correctCount}/{total} Correct
      </h3>
      <p className="text-slate-400 mb-6">
        {passed ? "Great job! You've earned capital." : "Keep learning and try again!"}
      </p>

      <div className="bg-slate-800 rounded-xl p-5 mb-6 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Capital Earned</span>
          <span className="text-green-400 font-bold">+CHF {bonus.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Area Status</span>
          <span style={{ color: config.color }} className="font-bold">
            {alreadyUnlocked ? 'Already Unlocked' : passed ? '🔓 Ready to Unlock!' : '🔒 Needs 3/5 to unlock'}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 transition-all font-semibold"
        >
          Back to Library
        </button>
        {!alreadyUnlocked && passed && (
          <button
            onClick={() => { onUnlock(); onBack() }}
            className="flex-1 py-3 rounded-xl font-bold text-black transition-all hover:scale-[1.02]"
            style={{ backgroundColor: config.color }}
          >
            Unlock Area 🏙️
          </button>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-slate-800 rounded-xl p-3 text-center border border-slate-700">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="font-bold text-sm" style={{ color }}>{value}</div>
    </div>
  )
}
