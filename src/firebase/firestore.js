import { doc, updateDoc, collection, getDocs, query, orderBy, limit, setDoc, arrayUnion, getDoc, deleteField } from 'firebase/firestore'
import { db } from './config'
import { INSTRUMENTS, GAME_END_YEAR } from '../data/stockData'

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  const data = snap.data() || {}
  // Migration: old users have `capital` but not `cash` — treat capital as cash
  if (data.cash === undefined) data.cash = data.capital ?? 10000
  if (data.portfolio === undefined) data.portfolio = {}
  if (data.currentYear === undefined) data.currentYear = 2007
  return data
}

// Price of an instrument at a given year (in CHF)
export function getPrice(instrumentId, year) {
  const inst = INSTRUMENTS[instrumentId]
  if (!inst) return 0
  // Use exact year, or fall back to nearest prior year
  for (let y = year; y >= 2007; y--) {
    if (inst.pricesByYear[y] != null) return inst.pricesByYear[y]
  }
  return 0
}

// Current CHF value of a holding
export function getHoldingValue(instrumentId, shares, year) {
  return shares * getPrice(instrumentId, year)
}

// ── Quiz / unlock ─────────────────────────────────────────────────────────────
export async function markQuizComplete(uid, quizId, correctCount) {
  const bonus = correctCount * 1000   // CHF reward for learning
  const data  = await getUserDoc(uid)
  await updateDoc(doc(db, 'users', uid), {
    completedQuizzes: arrayUnion(quizId),
    cash: (data.cash ?? 10000) + bonus,
  })
}

export async function unlockArea(uid, areaId) {
  await updateDoc(doc(db, 'users', uid), {
    unlockedAreas: arrayUnion(areaId),
  })
}

// ── Portfolio: buy ────────────────────────────────────────────────────────────
export async function buyStock(uid, instrumentId, amountCHF) {
  const data  = await getUserDoc(uid)
  const cash  = data.cash ?? 0
  const year  = data.currentYear ?? 2007
  const price = getPrice(instrumentId, year)

  if (price <= 0) throw new Error('No price available')
  if (amountCHF > cash) throw new Error('Insufficient cash')
  if (amountCHF <= 0)   throw new Error('Amount must be positive')

  const inst   = INSTRUMENTS[instrumentId]
  const shares   = amountCHF / price
  const portfolio = data.portfolio || {}
  const existing  = portfolio[instrumentId]

  const oldShares = existing?.shares || 0
  const newShares = oldShares + shares
  // Weighted average purchase price
  const oldAvg = existing?.avgPurchasePrice || price
  const newAvg = (oldAvg * oldShares + price * shares) / newShares

  await updateDoc(doc(db, 'users', uid), {
    cash: +(cash - amountCHF).toFixed(2),
    [`portfolio.${instrumentId}`]: {
      shares:           +newShares.toFixed(6),
      districtId:       inst.districtId,
      avgPurchasePrice: +newAvg.toFixed(6),
    },
  })
}

// ── Portfolio: sell ───────────────────────────────────────────────────────────
export async function sellStock(uid, instrumentId, sharesToSell) {
  const data  = await getUserDoc(uid)
  const year  = data.currentYear ?? 2007
  const price = getPrice(instrumentId, year)
  const portfolio = data.portfolio || {}
  const holding   = portfolio[instrumentId]

  if (!holding || holding.shares <= 0) throw new Error('No holdings')

  // null means sell everything
  const shares = sharesToSell === null ? holding.shares : sharesToSell
  if (shares > holding.shares + 0.000001) throw new Error('Not enough shares')
  if (shares <= 0)                        throw new Error('Must sell more than 0')

  const proceeds     = shares * price
  const remainShares = +(holding.shares - shares).toFixed(6)

  const updates = {
    cash: +((data.cash ?? 0) + proceeds).toFixed(2),
  }
  if (remainShares < 0.000001) {
    updates[`portfolio.${instrumentId}`] = deleteField()
  } else {
    updates[`portfolio.${instrumentId}`] = {
      shares: remainShares,
      districtId: holding.districtId,
      avgPurchasePrice: holding.avgPurchasePrice,
    }
  }
  await updateDoc(doc(db, 'users', uid), updates)
}

// ── Advance year ──────────────────────────────────────────────────────────────
export async function advanceYear(uid, newYear) {
  await updateDoc(doc(db, 'users', uid), { currentYear: newYear })
}

// ── Daily streak ──────────────────────────────────────────────────────────────
export async function checkDailyStreak(uid) {
  const data      = await getUserDoc(uid)
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const lastLogin = data.lastLoginDate || ''

  if (lastLogin === today) {
    return { streak: data.streak || 1, bonus: 0, xp: 0, alreadyClaimed: true }
  }

  const streak       = lastLogin === yesterday ? (data.streak || 0) + 1 : 1
  const cappedStreak = Math.min(streak, 7)
  const bonus        = 3000
  const xp           = cappedStreak * 50

  const updates = {
    streak,
    lastLoginDate: today,
    cash: (data.cash ?? 10000) + bonus,
    xp:   (data.xp   ?? 0)    + xp,
  }
  if (streak >= 5) updates.assetManagerUnlocked = true

  await updateDoc(doc(db, 'users', uid), updates)
  return { streak, bonus, xp, alreadyClaimed: false, newlyUnlockedAssetManager: streak === 5 }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
export async function getLeaderboard() {
  const q    = query(collection(db, 'users'), orderBy('totalScore', 'desc'), limit(20))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Full game reset ───────────────────────────────────────────────────────────
export async function resetUserProgress(uid) {
  await updateDoc(doc(db, 'users', uid), {
    cash:        10000,
    portfolio:   {},
    currentYear: 2007,
    totalScore:  0,
    xp:          0,
    streak:      0,
  })
}

// ── Update total score (call after advancing year) ────────────────────────────
export async function syncTotalScore(uid) {
  const data     = await getUserDoc(uid)
  const year     = data.currentYear ?? 2007
  const portfolio = data.portfolio || {}
  let portfolioValue = data.cash ?? 0
  for (const [id, h] of Object.entries(portfolio)) {
    portfolioValue += getHoldingValue(id, h.shares, year)
  }
  const score = Math.round(portfolioValue)
  if (score > (data.totalScore || 0)) {
    await updateDoc(doc(db, 'users', uid), { totalScore: score })
  }
}
