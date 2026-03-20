# Investopia

> A gamified investment simulation built in 36 hours at START Global Hackathon 2026, in partnership with PostFinance.

**Live demo:** [soleneb123.github.io/start_hack_26](https://soleneb123.github.io/start_hack_26/)

---

## Why Investopia?

Around 50% of adults never invest - not because they can't, but because investing feels intimidating, complex, and risky. Investopia was built to change that.

Designed for people aged **14 to 30 with zero prior knowledge**, Investopia makes learning to invest feel like playing a city-builder. You manage a real portfolio across 18 years of historical market data, experience market crashes, discover what diversification actually does, and compete with others, all without risking a single franc.

---

## How to Play

### 1. Start with CHF 10,000 in 2007
Every player begins with the same capital and the same starting year. Time advances automatically — each year passes every 5 seconds (or 500ms in speed mode). You're investing across 18 years of real market history: the 2008 financial crisis, the 2022 rate shock, the 2024 tech boom.

### 2. Unlock asset classes through the Library
Before you can trade any asset class, you need to pass a short 5-question quiz about it. Get 3 out of 5 right and the market opens for you.

The six asset classes you can unlock, in order:

| # | Asset Class | Examples |
|---|-------------|---------|
| 1 | **Bonds** | Swiss & global bonds |
| 2 | **Gold** | Safe-haven commodity |
| 3 | **SMI Stocks** | Nestlé, Roche, Novartis, UBS |
| 4 | **Equity Indices** | SMI, DAX, Euro Stoxx, DJIA |
| 5 | **Single Stocks** | Apple, Microsoft, NVIDIA |
| 6 | **Foreign Exchange** | USD/CHF, EUR/CHF |

### 3. Buy and sell
Once an asset class is unlocked, open the Market to buy instruments by entering a CHF amount, or sell in chunks (25%, 50%, or 100% of your position). Watch your portfolio value change year over year as real historical prices drive the simulation.

### 4. Survive the Fire Drill
At any point, you can trigger (or the game may trigger) a **Fire Drill**, a simulated market crisis. How much you lose depends entirely on how diversified your portfolio is:

| Markets held | Portfolio loss |
|---|---|
| 6 | **0%** — city saved |
| 5 | 3% |
| 4 | 10% |
| 3 | 20% |
| 2 | 35% |
| 1 | 50% |
| 0 | **100%** — total wipeout |

This is the game's core lesson: diversification is not optional.

### 5. Climb the leaderboard
Your final score (max 1,000 points) is calculated across four dimensions:

- **Returns (250 pts)** — Did you beat a simple savings account?
- **Diversification (250 pts)** — Did you spread across all six asset classes?
- **Risk management (250 pts)** — Did you avoid catastrophic drawdowns?
- **Consistency (250 pts)** — Was your performance steady year over year?

---

## Key Features

- **3D city map** built with Three.js — each district represents an asset class, and your city grows as you invest
- **Real 2007–2025 market data** — you live through actual historical crashes and bull runs
- **Library quizzes** — earn access to markets by learning about them first
- **Fire Drill mechanic** — visual simulation of a market crisis with building fire effects
- **Trophy system** — unlock achievements for milestones like first buy, full diversification, or surviving a crash
- **Leaderboard** — compete against other players and compare strategies with legendary investor profiles (Buffett, Wood, Soros)
- **Portfolio chart** — track your net worth progression year by year

---

## What You'll Learn

- What bonds, stocks, gold, and other asset classes are — and when to use them
- Why diversification protects you (not just theoretically — you feel it in the Fire Drill)
- How time in the market beats timing the market
- How real market events (2008, 2022, 2024) affected different asset classes differently
- How to read unrealized gains/losses and track portfolio performance

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React, Tailwind CSS |
| 3D | Three.js, React Three Fiber, @react-three/drei |
| Charts | Recharts |
| Backend | Firebase (Auth + Firestore) |
| Build | Vite |
| Deploy | GitHub Pages |

---

## Context

Investopia was built in **36 hours** at **START Global Hackathon 2026** for the PostFinance challenge track.

**The challenge brief:** Build a gamified investment education prototype for beginners that teaches risk profiling, diversification, long-term investing, and asset class basics — without encouraging gambling behavior.

**The team:** students competing under time pressure, using real PostFinance market data. Co-authors: Peter Thürbach, Antonin Ricard Boual, Andriy Svidrun, Solène Berney

---

## Running Locally

```bash
git clone https://github.com/soleneb123/start_hack_26.git
cd start_hack_26
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## License

Built for educational and hackathon purposes. Market data provided by PostFinance.
