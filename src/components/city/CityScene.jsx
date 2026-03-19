import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { ASSET_ORDER } from '../../data/assetData'
import { DISTRICT_INSTRUMENTS, INSTRUMENTS, GAME_START_YEAR, GAME_END_YEAR } from '../../data/stockData'
import { getPrice } from '../../firebase/firestore'

// ── District config ───────────────────────────────────────────────────────────
export const DISTRICT_CFG = {
  bonds:         { label: 'Financial Quarter', icon: '🏛️', color: '#C9A84C', description: 'Government & Corporate Bonds' },
  equityIndices: { label: 'Global Exchange',   icon: '🌐', color: '#0D9488', description: 'Global Equity Index Funds' },
  gold:          { label: 'Gold Vault',         icon: '⛏️', color: '#FBBF24', description: 'Commodities & Precious Metals' },
  smiStocks:     { label: 'Swiss Quarter',      icon: '🇨🇭', color: '#DC2626', description: 'SMI Blue-Chip Stocks' },
  singleStocks:  { label: 'Tech Hub',           icon: '📈', color: '#7C3AED', description: 'Individual Company Stocks' },
  fx:            { label: 'Trade Harbour',      icon: '⚓', color: '#0891B2', description: 'Foreign Exchange Currencies' },
}

const DISTRICT_POSITIONS = {
  bonds:         [-34, 0, -30],
  equityIndices: [  0, 0, -30],
  gold:          [ 34, 0, -30],
  smiStocks:     [-34, 0,   6],
  singleStocks:  [ 34, 0,   6],
  fx:            [  0, 0,  30],
}
const PLATFORM_HALF = 46
const HOOD = 22       // neighbourhood footprint (world units)

// ── Helpers ───────────────────────────────────────────────────────────────────
function shadeColor(hex, factor) {
  const h = hex.replace('#', '')
  const r = Math.min(255, Math.round(parseInt(h.slice(0, 2), 16) * factor))
  const g = Math.min(255, Math.round(parseInt(h.slice(2, 4), 16) * factor))
  const b = Math.min(255, Math.round(parseInt(h.slice(4, 6), 16) * factor))
  return `rgb(${r},${g},${b})`
}

// ── Diversification factor ────────────────────────────────────────────────────
// Returns 0.35 (all-in-one asset) → 1.0 (perfectly spread)
function getDiversificationFactor(allocation, unlockedAreas) {
  if (!allocation || unlockedAreas.length === 0) return 1
  const active = unlockedAreas.filter(id => (allocation[id] || 0) > 5).length
  return 0.35 + 0.65 * (active / Math.max(1, unlockedAreas.length))
}

// ── District data ─────────────────────────────────────────────────────────────
function getDistrictData(id, allocation, capital, unlocked, divFactor = 1) {
  const allocPct = allocation?.[id] || 0
  const chf = (allocPct / 100) * capital

  if (!unlocked) return { gridN: 2, maxH: 3.5, locked: true,  muted: true  }
  if (allocPct === 0) return { gridN: 2, maxH: 3.0, locked: false, muted: true  }

  let gridN =
    chf < 1000  ? 2 :
    chf < 3000  ? 3 :
    chf < 8000  ? 4 :
    chf < 20000 ? 5 : 6

  let maxH =
    chf < 1000  ? 2.5 :
    chf < 3000  ? 5   :
    chf < 8000  ? 9   :
    chf < 20000 ? 13  : 19

  // Diversification penalty: fewer + shorter buildings when portfolio is concentrated
  gridN = Math.max(1, Math.round(gridN * divFactor))
  maxH  = Math.max(1.5, maxH * divFactor)

  return { gridN, maxH, locked: false, muted: false }
}

// ── Building grid generator ───────────────────────────────────────────────────
function generateBuildings(gridN, maxH) {
  const gap = HOOD / gridN
  const bw  = gap * 0.68
  const out = []

  for (let i = 0; i < gridN; i++) {
    for (let j = 0; j < gridN; j++) {
      const x  = (i - (gridN - 1) / 2) * gap
      const z  = (j - (gridN - 1) / 2) * gap
      const fi = i / Math.max(1, gridN - 1)
      const fj = j / Math.max(1, gridN - 1)
      const edge = Math.min(fi, 1 - fi, fj, 1 - fj) * 2
      const rnd  = ((i * 7 + j * 13 + i * j * 5) % 10) / 10
      const h    = maxH * (0.38 + edge * 0.32 + rnd * 0.30)
      const shade = (i * 3 + j * 5) % 3
      out.push({ x, z, w: bw, d: bw, h, shade })
    }
  }
  return out
}

// ── Shared building factory ───────────────────────────────────────────────────
// Creates body + floor bands + glass window panel + rooftop details
function makeBuilding(w, d, h, shade, colors, accentColor, glassColor, opts = {}) {
  const safeH  = Math.max(h, 0.6)
  const body   = colors[shade % colors.length]
  const parts  = []
  const shine  = opts.shininess ?? 18

  // ── Main body ──
  if (opts.stepped && safeH > 9) {
    const [h1, h2, h3] = [safeH * 0.44, safeH * 0.30, safeH * 0.26]
    parts.push({ geomType: 'box', args: [w,       h1, d      ], pos: [0, h1 / 2,           0], color: body,        shininess: shine })
    parts.push({ geomType: 'box', args: [w * 0.78, h2, d * 0.78], pos: [0, h1 + h2 / 2,    0], color: body,        shininess: shine })
    parts.push({ geomType: 'box', args: [w * 0.54, h3, d * 0.54], pos: [0, h1 + h2 + h3/2, 0], color: accentColor, shininess: shine + 25 })

    // Bands only in lower section
    const bi = Math.max(1.5, h1 / Math.ceil(h1 / 2))
    for (let y = bi; y < h1 - 0.2; y += bi)
      parts.push({ geomType: 'box', args: [w + 0.07, 0.11, d + 0.07], pos: [0, y, 0], color: accentColor, shininess: 55 })

  } else {
    parts.push({ geomType: 'box', args: [w, safeH, d], pos: [0, safeH / 2, 0], color: body, shininess: shine, transparent: opts.transparent, opacity: opts.opacity ?? 1 })

    // Floor bands across full height
    const bi = Math.max(1.2, safeH / Math.ceil(safeH / 2))
    for (let y = bi; y < safeH - 0.2; y += bi)
      parts.push({ geomType: 'box', args: [w + 0.07, 0.11, d + 0.07], pos: [0, y, 0], color: accentColor, shininess: 55 })
  }

  // ── Podium / base ──
  if (safeH > 3)
    parts.push({ geomType: 'box', args: [w * 1.1, 0.55, d * 1.1], pos: [0, 0.275, 0], color: accentColor, shininess: 25 })

  // ── Glass window panel (front face) ──
  if (glassColor && safeH > 1.5)
    parts.push({ geomType: 'box', args: [w * 0.74, safeH * 0.88, 0.04], pos: [0, safeH * 0.49, d / 2 + 0.022], color: glassColor, shininess: 85, transparent: true, opacity: 0.42 })

  // ── Crown ──
  if (opts.crown === 'pointed' && safeH > 5)
    parts.push({ geomType: 'cone', args: [w * 0.38, safeH * 0.18, 4], pos: [0, safeH + safeH * 0.09, 0], color: accentColor, shininess: 55 })
  else if (opts.crown === 'spire' && safeH > 5) {
    parts.push({ geomType: 'box', args: [w * 0.38, 0.28, d * 0.38], pos: [0, safeH + 0.14, 0], color: accentColor, shininess: 35 })
    parts.push({ geomType: 'cylinder', args: [0.05, 0.05, safeH * 0.24, 4], pos: [0, safeH + 0.28 + safeH * 0.12, 0], color: accentColor, shininess: 90 })
  } else if (safeH > 3) {
    parts.push({ geomType: 'box', args: [w * 1.02, 0.22, d * 1.02], pos: [0, safeH + 0.11, 0], color: accentColor, shininess: 30 })
  }

  // ── Rooftop details ──
  if (safeH > 4) {
    // HVAC box
    parts.push({ geomType: 'box', args: [w * 0.28, 0.38, d * 0.22], pos: [-w * 0.21, safeH + 0.19, d * 0.1], color: '#787878', shininess: 12 })
    if (safeH > 7) {
      // Water tower
      parts.push({ geomType: 'cylinder', args: [0.22, 0.22, 0.58, 7], pos: [w * 0.22, safeH + 0.29, -d * 0.18], color: '#8B7355', shininess: 5 })
      parts.push({ geomType: 'cone',     args: [0.26, 0.30, 7],        pos: [w * 0.22, safeH + 0.58 + 0.15, -d * 0.18], color: '#6B5535', shininess: 5 })
    }
  }

  return parts
}

// ── District theme generators ─────────────────────────────────────────────────

function bondsParts(w, d, h, shade) {
  return makeBuilding(w, d, h, shade,
    ['#C8B89A', '#D4C5A9', '#BBA882'], '#C9A84C', '#E8D8A0',
    { stepped: h > 9, crown: h > 6 ? 'pointed' : 'flat', shininess: 18 })
}

function goldParts(w, d, h, shade) {
  return makeBuilding(w, d, h, shade,
    ['#92400E', '#7C3415', '#A56030'], '#FBBF24', '#FFE580',
    { stepped: h > 9, crown: h > 6 ? 'pointed' : 'flat', shininess: 8 })
}

function smiParts(w, d, h, shade) {
  return makeBuilding(w, d, h, shade,
    ['#DC2626', '#EA580C', '#B91C1C'], '#F8FAFC', '#ADD8E6',
    { crown: h > 6 ? 'pointed' : 'flat', shininess: 6 })
}

function equityParts(w, d, h, shade) {
  return makeBuilding(w, d, h, shade,
    ['#0D9488', '#0891B2', '#0F766E'], '#CBD5E1', '#87CEEB',
    { stepped: h > 9, crown: 'spire', shininess: 75, transparent: true, opacity: 0.90 })
}

function techParts(w, d, h, shade) {
  if (shade === 1 && h > 9) {
    // Cylinder variant
    const parts = []
    parts.push({ geomType: 'cylinder', args: [w*0.50, w*0.52, h, 10], pos: [0, h/2, 0], color: '#7C3AED', shininess: 50 })
    const ri = Math.max(2, h / Math.ceil(h / 2.5))
    for (let y = ri; y < h; y += ri)
      parts.push({ geomType: 'cylinder', args: [w*0.56, w*0.56, 0.12, 10], pos: [0, y, 0], color: '#06B6D4', shininess: 100 })
    parts.push({ geomType: 'cylinder', args: [0.05, 0.05, h*0.26, 4], pos: [0, h + h*0.13, 0], color: '#06B6D4', shininess: 100 })
    return parts
  }
  return makeBuilding(w, d, h, shade,
    ['#7C3AED', '#4C1D95', '#6D28D9'], '#06B6D4', '#7DD3FC',
    { stepped: h > 8, crown: 'spire', shininess: 48 })
}

function fxParts(w, d, h, shade) {
  if (shade === 2 && h > 9) {
    const parts = []
    parts.push({ geomType: 'cylinder', args: [w*0.50, w*0.55, h, 12], pos: [0, h/2, 0], color: '#0891B2', shininess: 65 })
    const ri = Math.max(2, h / Math.ceil(h / 2.5))
    for (let y = ri; y < h; y += ri)
      parts.push({ geomType: 'cylinder', args: [w*0.57, w*0.57, 0.14, 12], pos: [0, y, 0], color: '#F0F9FF', shininess: 35 })
    parts.push({ geomType: 'cylinder', args: [0.1, w*0.50, h*0.10, 12], pos: [0, h + h*0.05, 0], color: '#F0F9FF', shininess: 40 })
    return parts
  }
  return makeBuilding(w, d, h, shade,
    ['#0891B2', '#0369A1', '#0E7490'], '#F0F9FF', '#7DD3FC',
    { crown: 'flat', shininess: 58 })
}

function getBuildingParts(id, w, d, h, shade, isCrisis, isLocked, isMuted) {
  const safeH = Math.max(h, 0.8)
  if (isLocked) return [{ geomType: 'box', args: [w, safeH, d], pos: [0, safeH/2, 0], color: '#374151', shininess: 0 }]
  if (isMuted)  return [{ geomType: 'box', args: [w, safeH, d], pos: [0, safeH/2, 0], color: '#9CA3AF', shininess: 5 }]
  if (isCrisis) return [{ geomType: 'box', args: [w, safeH, d], pos: [0, safeH/2, 0], color: '#6B7280', shininess: 0 }]
  switch (id) {
    case 'bonds':         return bondsParts(w, d, h, shade)
    case 'gold':          return goldParts(w, d, h, shade)
    case 'smiStocks':     return smiParts(w, d, h, shade)
    case 'equityIndices': return equityParts(w, d, h, shade)
    case 'singleStocks':  return techParts(w, d, h, shade)
    case 'fx':            return fxParts(w, d, h, shade)
    default:              return [{ geomType: 'box', args: [w, safeH, d], pos: [0, safeH/2, 0], color: '#9CA3AF', shininess: 0 }]
  }
}

// ── District internal streets ─────────────────────────────────────────────────
function DistrictStreets({ gridN }) {
  if (gridN < 2) return null
  const gap = HOOD / gridN
  const sw  = gap * 0.30   // street width fills the gap between buildings
  const len = HOOD + 0.2   // span the full district
  const y   = 0.022
  const col = '#3D3D3D'

  const offsets = []
  for (let i = 0; i < gridN - 1; i++) {
    offsets.push((i + 0.5 - (gridN - 1) / 2) * gap)
  }

  return (
    <group>
      {offsets.map((o, i) => (
        <group key={i}>
          {/* E–W road */}
          <mesh position={[0, y, o]}>
            <boxGeometry args={[len, 0.04, sw]} />
            <meshLambertMaterial color={col} />
          </mesh>
          {/* N–S road */}
          <mesh position={[o, y, 0]}>
            <boxGeometry args={[sw, 0.04, len]} />
            <meshLambertMaterial color={col} />
          </mesh>
        </group>
      ))}

      {/* Rounded intersection discs */}
      {offsets.flatMap((ox, i) => offsets.map((oz, j) => (
        <mesh key={`r${i}-${j}`} position={[ox, y + 0.005, oz]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[sw * 0.62, 14]} />
          <meshLambertMaterial color={col} />
        </mesh>
      )))}

      {/* Rounded end caps (semicircles at road ends) */}
      {offsets.map((o, i) => {
        const half = len / 2
        return [
          <mesh key={`ex${i}a`} position={[-half, y + 0.005, o]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[sw * 0.50, 10]} />
            <meshLambertMaterial color={col} />
          </mesh>,
          <mesh key={`ex${i}b`} position={[half, y + 0.005, o]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[sw * 0.50, 10]} />
            <meshLambertMaterial color={col} />
          </mesh>,
          <mesh key={`ez${i}a`} position={[o, y + 0.005, -half]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[sw * 0.50, 10]} />
            <meshLambertMaterial color={col} />
          </mesh>,
          <mesh key={`ez${i}b`} position={[o, y + 0.005, half]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[sw * 0.50, 10]} />
            <meshLambertMaterial color={col} />
          </mesh>,
        ]
      })}
    </group>
  )
}

// ── Earthquake shake wrapper ──────────────────────────────────────────────────
function ShakeGroup({ active, children }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    if (active) {
      const t = clock.getElapsedTime()
      ref.current.position.x = Math.sin(t * 28) * 0.13 + Math.sin(t * 17) * 0.06
      ref.current.position.z = Math.cos(t * 23) * 0.08
    } else {
      ref.current.position.x = 0
      ref.current.position.z = 0
    }
  })
  return <group ref={ref}>{children}</group>
}

// ── ThemeBuilding ─────────────────────────────────────────────────────────────
function ThemeBuilding({ parts, onClick, onHover, onHoverEnd }) {
  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} position={p.pos} castShadow receiveShadow
          onClick={onClick} onPointerOver={onHover} onPointerOut={onHoverEnd}>
          {p.geomType === 'box'      && <boxGeometry      args={p.args} />}
          {p.geomType === 'cylinder' && <cylinderGeometry args={p.args} />}
          {p.geomType === 'cone'     && <coneGeometry     args={p.args} />}
          <meshPhongMaterial
            color={p.color}
            shininess={p.shininess || 0}
            transparent={!!p.transparent}
            opacity={p.opacity !== undefined ? p.opacity : 1}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── District temple (clickable market entrance) ───────────────────────────────
function DistrictTemple({ color, isLocked, onClick, onHover, onHoverEnd }) {
  const stone  = isLocked ? '#4B5563' : color
  const light  = isLocked ? '#6B7280' : shadeColor(color, 1.35)
  const dark   = shadeColor(stone, 0.60)
  const colCnt = 4

  return (
    <group
      onClick={onClick} onPointerOver={onHover} onPointerOut={onHoverEnd}
    >
      {/* Wide base / steps */}
      {[0, 0.30, 0.58].map((y, i) => (
        <mesh key={i} position={[0, y + 0.15, 0]} receiveShadow castShadow>
          <boxGeometry args={[6.2 - i * 0.5, 0.30, 4.8 - i * 0.4]} />
          <meshPhongMaterial color={shadeColor(stone, 0.80)} shininess={12} />
        </mesh>
      ))}

      {/* Main body */}
      <mesh position={[0, 2.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.4, 2.84, 3.6]} />
        <meshPhongMaterial color={stone} shininess={18} />
      </mesh>

      {/* Front columns */}
      {Array.from({ length: colCnt }, (_, i) => {
        const x = (i - (colCnt - 1) / 2) * (5.4 / (colCnt - 1)) * 0.82
        return (
          <mesh key={i} position={[x, 2.18, 1.85]} castShadow>
            <cylinderGeometry args={[0.28, 0.32, 3.4, 8]} />
            <meshPhongMaterial color={light} shininess={25} />
          </mesh>
        )
      })}

      {/* Entablature */}
      <mesh position={[0, 4.0, 1.85]} castShadow>
        <boxGeometry args={[5.8, 0.30, 0.40]} />
        <meshPhongMaterial color={dark} shininess={10} />
      </mesh>

      {/* Pediment base */}
      <mesh position={[0, 4.30, 1.80]} castShadow>
        <boxGeometry args={[5.8, 0.18, 0.30]} />
        <meshPhongMaterial color={dark} shininess={8} />
      </mesh>
      {/* Pediment left slope */}
      <mesh position={[-1.8, 4.88, 1.78]} rotation={[0, 0, 0.50]} castShadow>
        <boxGeometry args={[2.5, 0.18, 0.28]} />
        <meshPhongMaterial color={dark} shininess={8} />
      </mesh>
      {/* Pediment right slope */}
      <mesh position={[1.8, 4.88, 1.78]} rotation={[0, 0, -0.50]} castShadow>
        <boxGeometry args={[2.5, 0.18, 0.28]} />
        <meshPhongMaterial color={dark} shininess={8} />
      </mesh>

      {/* Door */}
      <mesh position={[0, 1.25, 1.83]}>
        <boxGeometry args={[1.0, 1.8, 0.08]} />
        <meshLambertMaterial color={isLocked ? '#374151' : '#3B1F0A'} />
      </mesh>

      {/* Lock icon for locked districts */}
      {isLocked && (
        <mesh position={[0, 3.2, 1.95]}>
          <boxGeometry args={[0.9, 0.9, 0.08]} />
          <meshPhongMaterial color="#F59E0B" shininess={60} />
        </mesh>
      )}
    </group>
  )
}

// ── Return % → building height ────────────────────────────────────────────────
// 0% return → height 9, +100% → height 37, -50% → height 1.5
function returnToHeight(currentPrice, avgPurchasePrice) {
  if (!avgPurchasePrice || avgPurchasePrice <= 0) return 9
  const returnPct = (currentPrice / avgPurchasePrice - 1) * 100
  return Math.max(1.5, Math.min(48, 9 + returnPct * 0.28))
}

// ── CHF invested → property footprint scale ───────────────────────────────────
// ~50 CHF → 0.60×  |  ~500 CHF → 0.95×  |  ~2 000 CHF → 1.15×  |  ~10 000+ CHF → 1.40×
// Max capped at 1.40 so footprint (4.0 * 1.4 = 5.6 units) fits in 7-unit offset slots
function valueToScale(chf) {
  return Math.max(0.60, Math.min(1.40, 0.45 + Math.log10(Math.max(10, chf)) * 0.29))
}

// ── Fire (animated flame on crisis buildings) ─────────────────────────────────
function Fire({ position }) {
  const outerRef = useRef()
  const innerRef = useRef()
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (outerRef.current) {
      outerRef.current.scale.y = 0.82 + Math.sin(t * 9) * 0.18
      outerRef.current.scale.x = 0.88 + Math.cos(t * 7) * 0.12
    }
    if (innerRef.current) {
      innerRef.current.scale.y = 0.78 + Math.sin(t * 11 + 1) * 0.22
    }
  })
  return (
    <group position={position}>
      <mesh ref={outerRef} position={[0, 0.7, 0]}>
        <coneGeometry args={[0.45, 1.4, 6]} />
        <meshPhongMaterial color="#FF4500" emissive="#FF2200" emissiveIntensity={0.5} transparent opacity={0.85} />
      </mesh>
      <mesh ref={innerRef} position={[0, 0.4, 0]}>
        <coneGeometry args={[0.28, 0.9, 6]} />
        <meshPhongMaterial color="#FFA500" emissive="#FF8C00" emissiveIntensity={0.6} transparent opacity={0.9} />
      </mesh>
      <pointLight position={[0, 0.8, 0]} color="#FF6600" intensity={1.2} distance={6} />
    </group>
  )
}

// ── Firefighter ───────────────────────────────────────────────────────────────
function Firefighter({ position, facingAngle = 0 }) {
  const s = 2.8  // scale factor — makes them visible from the high camera
  return (
    <group position={position} rotation={[0, facingAngle, 0]} scale={[s, s, s]}>
      {/* Legs */}
      <mesh position={[-0.07, 0.18, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.36, 5]} />
        <meshLambertMaterial color="#1E3A5F" />
      </mesh>
      <mesh position={[0.07, 0.18, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.36, 5]} />
        <meshLambertMaterial color="#1E3A5F" />
      </mesh>
      {/* Body */}
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.13, 0.11, 0.42, 6]} />
        <meshLambertMaterial color="#1D4ED8" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.80, 0]}>
        <sphereGeometry args={[0.12, 7, 6]} />
        <meshLambertMaterial color="#FBBF24" />
      </mesh>
      {/* Helmet */}
      <mesh position={[0, 0.90, 0]}>
        <cylinderGeometry args={[0.17, 0.14, 0.10, 8]} />
        <meshLambertMaterial color="#DC2626" />
      </mesh>
      {/* Hose arm */}
      <mesh position={[0.22, 0.52, 0.05]} rotation={[0.3, 0, -0.6]}>
        <cylinderGeometry args={[0.035, 0.035, 0.34, 5]} />
        <meshLambertMaterial color="#374151" />
      </mesh>
      {/* Water spray (cyan cone from hose tip) */}
      <mesh position={[0.42, 0.48, 0.12]} rotation={[0.3, 0, -1.1]}>
        <coneGeometry args={[0.06, 0.28, 5]} />
        <meshPhongMaterial color="#7DD3FC" transparent opacity={0.75} />
      </mesh>
    </group>
  )
}

// ── Rubble pile (shown after building burns down) ─────────────────────────────
function Rubble({ size = 1 }) {
  const s = size * 0.7
  return (
    <group>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[s * 2.8, 0.24, s * 2.8]} />
        <meshLambertMaterial color="#4B4B4B" />
      </mesh>
      {[[-0.4 * s, 0.30, 0.2 * s], [0.5 * s, 0.28, -0.3 * s], [0.1 * s, 0.36, 0.5 * s],
        [-0.6 * s, 0.26, -0.1 * s], [0.3 * s, 0.32, 0.4 * s]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[Math.random(), Math.random(), Math.random()]}>
          <boxGeometry args={[0.3 + (i % 3) * 0.2, 0.20, 0.25 + (i % 2) * 0.15].map(v => v * s)} />
          <meshLambertMaterial color={['#5D4037', '#616161', '#78909C'][i % 3]} />
        </mesh>
      ))}
    </group>
  )
}

// ── Animated portfolio building (lerps scale.y toward target each frame) ──────
const PARTS_H = 5  // fixed height used for part generation; scale handles display height

function AnimatedBuilding({ districtId, targetH, shade, isCrisis, isBurning, isCollapsed, returnPct, holdingValue, instId, showLabels, onClick, onHover, onHoverEnd }) {
  const groupRef     = useRef()
  const currentScale = useRef(Math.max(0.01, targetH / PARTS_H))

  useFrame(() => {
    if (!groupRef.current) return
    // Collapse toward 0 when burning/collapsed, otherwise animate to target
    const target = isCollapsed ? 0 : isBurning ? Math.max(0.01, targetH / PARTS_H) * 0.3 : Math.max(0.01, targetH / PARTS_H)
    const speed  = isCollapsed ? 0.035 : isBurning ? 0.018 : 0.04
    currentScale.current += (target - currentScale.current) * speed
    groupRef.current.scale.y = Math.max(0, currentScale.current)
  })

  const fp = valueToScale(holdingValue) * 4.0
  const parts = useMemo(
    () => getBuildingParts(districtId, fp, fp, PARTS_H, shade, isCrisis || isBurning, false, false),
    [districtId, fp, shade, isCrisis, isBurning]
  )
  const labelColor = returnPct >= 0 ? '#4ade80' : '#f87171'

  if (isCollapsed) return <Rubble size={valueToScale(holdingValue)} />

  return (
    <group ref={groupRef}>
      <ShakeGroup active={isCrisis || isBurning}>
        <ThemeBuilding parts={parts} onClick={onClick} onHover={onHover} onHoverEnd={onHoverEnd} />
      </ShakeGroup>

      {/* Company name — vertical text beside the skyscraper */}
      {showLabels && !isBurning && instId && INSTRUMENTS[instId] && (
        <Html position={[fp / 2 + 0.6, PARTS_H * 0.5, 0]} center distanceFactor={55}>
          <div style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            color: 'white',
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            textShadow: '0 1px 6px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.9)',
            fontFamily: 'Arial Black, Impact, sans-serif',
            textTransform: 'uppercase',
            opacity: 0.92,
          }}>
            {INSTRUMENTS[instId].name.split(' ')[0]}
          </div>
        </Html>
      )}

      {showLabels && !isBurning && returnPct !== null && (
        <Html position={[0, PARTS_H + 0.6, 0]} center distanceFactor={22}>
          <div style={{
            background: '#0f172AEE', color: labelColor,
            padding: '4px 10px', borderRadius: 8, fontSize: 22,
            fontWeight: 800, whiteSpace: 'nowrap', pointerEvents: 'none',
            border: `1.5px solid ${labelColor}77`,
            textShadow: `0 0 8px ${labelColor}99`,
          }}>
            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
          </div>
        </Html>
      )}
    </group>
  )
}

// Positions for up to 8 portfolio buildings arranged around the exchange center
// Spacing of 7–7.5 units keeps max-scaled buildings (5.6 wide) from overlapping
const HOLDING_OFFSETS = [
  [-7, -7], [0, -8], [7, -7],
  [-8,  0],          [8,  0],
  [-7,  7], [0,  8], [7,  7],
]

// ETF index instruments — rendered as mini-house clusters instead of skyscrapers
const ETF_INSTRUMENTS = new Set(['IDX_SMI', 'IDX_DJIA', 'IDX_DAX', 'IDX_STOXX'])

// Simple Icons slugs — cdn.simpleicons.org/{slug}/ffffff serves CORS-safe white SVG logos
const LOGO_ICONS = {
  UBSG: 'ubs',
  NESN: 'nestle',
  ROG:  'roche',
  ABBN: 'abb',
  NOVN: 'novartis',
  GS:   'goldmansachs',
  MSFT: 'microsoft',
  MCD:  'mcdonalds',
  AAPL: 'apple',
  AMZN: 'amazon',
  NVDA: 'nvidia',
  KO:   'cocacola',
  NKE:  'nike',
}

// Filler building slots [x, z, width, height] — decorative low-rise structures
// placed at in-between positions that holding buildings never occupy
const FILLER_OFFSETS = [
  [-3.5, -3.5, 1.6, 1.8], [ 3.5, -3.5, 1.4, 1.4],
  [-3.5,  3.5, 1.5, 1.6], [ 3.5,  3.5, 1.6, 1.9],
  [-2.5,  0.0, 1.3, 1.2], [ 2.5,  0.0, 1.4, 1.5],
  [ 0.0, -3.0, 1.2, 1.3], [ 0.0,  3.0, 1.5, 1.4],
  [-5.5, -3.0, 1.2, 1.0], [ 5.5, -3.0, 1.1, 1.2],
  [-5.5,  3.0, 1.3, 1.1], [ 5.5,  3.0, 1.2, 1.3],
  [-3.0, -7.0, 1.4, 1.2], [ 3.0, -7.0, 1.3, 1.0],
  [-3.0,  7.0, 1.2, 1.1], [ 3.0,  7.0, 1.4, 1.3],
]

// ── House building (for small investments < 750 CHF) ─────────────────────────
function HouseBuilding({ color, holdingValue, returnPct, showLabels, onClick, onHover, onHoverEnd }) {
  const s = valueToScale(holdingValue)   // footprint scale driven by CHF invested
  const roofColor = shadeColor(color, 0.60)
  const labelColor = returnPct >= 0 ? '#4ade80' : '#f87171'
  const w = 3.4 * s, d = 3.4 * s, wallH = 2.6 * s

  return (
    <group>
      {/* Walls */}
      <mesh position={[0, wallH / 2, 0]} castShadow receiveShadow onClick={onClick} onPointerOver={onHover} onPointerOut={onHoverEnd}>
        <boxGeometry args={[w, wallH, d]} />
        <meshPhongMaterial color={color} shininess={10} />
      </mesh>
      {/* Roof left slope */}
      <mesh position={[-w * 0.265, wallH + 0.38 * s, 0]} rotation={[0, 0, 0.52]} castShadow>
        <boxGeometry args={[w * 0.65, 0.20 * s, d + 0.4 * s]} />
        <meshPhongMaterial color={roofColor} shininess={4} />
      </mesh>
      {/* Roof right slope */}
      <mesh position={[w * 0.265, wallH + 0.38 * s, 0]} rotation={[0, 0, -0.52]} castShadow>
        <boxGeometry args={[w * 0.65, 0.20 * s, d + 0.4 * s]} />
        <meshPhongMaterial color={roofColor} shininess={4} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.60 * s, d / 2 + 0.05]}>
        <boxGeometry args={[0.80 * s, 1.20 * s, 0.08]} />
        <meshLambertMaterial color="#5D4037" />
      </mesh>
      {/* Front window left */}
      <mesh position={[-w * 0.31, wallH * 0.55, d / 2 + 0.05]}>
        <boxGeometry args={[0.70 * s, 0.70 * s, 0.08]} />
        <meshPhongMaterial color="#87CEEB" shininess={90} transparent opacity={0.82} />
      </mesh>
      {/* Front window right */}
      <mesh position={[w * 0.31, wallH * 0.55, d / 2 + 0.05]}>
        <boxGeometry args={[0.70 * s, 0.70 * s, 0.08]} />
        <meshPhongMaterial color="#87CEEB" shininess={90} transparent opacity={0.82} />
      </mesh>

      {showLabels && returnPct !== null && (
        <Html position={[0, wallH + 2.2 * s, 0]} center distanceFactor={22}>
          <div style={{
            background: '#0f172AEE', color: labelColor,
            padding: '4px 10px', borderRadius: 8, fontSize: 22,
            fontWeight: 800, whiteSpace: 'nowrap', pointerEvents: 'none',
            border: `1.5px solid ${labelColor}77`,
            textShadow: `0 0 8px ${labelColor}99`,
          }}>
            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
          </div>
        </Html>
      )}
    </group>
  )
}

// ── Mini house for ETF clusters ───────────────────────────────────────────────
function MiniHouse({ color, onClick, onHover, onHoverEnd }) {
  const roofColor = shadeColor(color, 0.58)
  return (
    <group>
      {/* Walls */}
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow onClick={onClick} onPointerOver={onHover} onPointerOut={onHoverEnd}>
        <boxGeometry args={[2.8, 2.2, 2.8]} />
        <meshPhongMaterial color={color} shininess={10} />
      </mesh>
      {/* Roof left slope */}
      <mesh position={[-0.74, 2.55, 0]} rotation={[0, 0, 0.52]} castShadow>
        <boxGeometry args={[1.8, 0.18, 3.2]} />
        <meshPhongMaterial color={roofColor} shininess={4} />
      </mesh>
      {/* Roof right slope */}
      <mesh position={[0.74, 2.55, 0]} rotation={[0, 0, -0.52]} castShadow>
        <boxGeometry args={[1.8, 0.18, 3.2]} />
        <meshPhongMaterial color={roofColor} shininess={4} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.55, 1.42]}>
        <boxGeometry args={[0.62, 1.0, 0.08]} />
        <meshLambertMaterial color="#5D4037" />
      </mesh>
      {/* Window */}
      <mesh position={[0.88, 1.2, 1.42]}>
        <boxGeometry args={[0.55, 0.55, 0.08]} />
        <meshPhongMaterial color="#87CEEB" shininess={90} transparent opacity={0.80} />
      </mesh>
    </group>
  )
}

// ── Manhattan thin-tower cluster — for ETF / index fund holdings ─────────────
function ThinSkyscraperCluster({ districtColor, baseH, returnPct, showLabels, onClick, onHover, onHoverEnd }) {
  const TW  = 1.0   // tower footprint width
  const GAP = 0.55  // street gap between towers

  // Grid config: [cols, rows] based on height (= return)
  const [cols, rows] = baseH >= 28 ? [3, 3] : baseH >= 16 ? [3, 2] : baseH >= 8 ? [2, 2] : [2, 1]
  const step = TW + GAP
  const labelColor = returnPct >= 0 ? '#4ade80' : '#f87171'

  // Build towers with deterministic height variation — tallest near center
  const towers = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const cx = Math.abs(c - (cols - 1) / 2) / Math.max(1, (cols - 1) / 2)
      const cz = Math.abs(r - (rows - 1) / 2) / Math.max(1, (rows - 1) / 2)
      const centrality = 1 - (cx + cz) / 2
      const rnd = ((idx * 11 + 7) % 9) / 22   // 0–0.4 pseudo-random
      const h = Math.max(2, baseH * (0.55 + centrality * 0.35 + rnd))
      towers.push({
        x: (c - (cols - 1) / 2) * step,
        z: (r - (rows - 1) / 2) * step,
        h,
        shade: idx % 3,
      })
    }
  }
  const maxH = Math.max(...towers.map(t => t.h))

  return (
    <group>
      {towers.map((t, i) => {
        const body = shadeColor(districtColor, 0.50 + t.shade * 0.14)
        return (
          <group key={i} position={[t.x, 0, t.z]}>
            {/* Slim tower body */}
            <mesh position={[0, t.h / 2, 0]} castShadow receiveShadow
              onClick={onClick} onPointerOver={onHover} onPointerOut={onHoverEnd}>
              <boxGeometry args={[TW, t.h, TW]} />
              <meshPhongMaterial color={body} shininess={60} />
            </mesh>
            {/* Glass curtain front face */}
            <mesh position={[0, t.h / 2, TW / 2 + 0.03]}>
              <boxGeometry args={[TW * 0.72, t.h * 0.94, 0.04]} />
              <meshPhongMaterial color="#93C5FD" shininess={130} transparent opacity={0.48} />
            </mesh>
            {/* Floor bands every ~2.5 units */}
            {Array.from({ length: Math.floor(t.h / 2.5) }, (_, bi) => (
              <mesh key={bi} position={[0, (bi + 1) * 2.5, 0]}>
                <boxGeometry args={[TW + 0.05, 0.07, TW + 0.05]} />
                <meshPhongMaterial color={districtColor} shininess={70} />
              </mesh>
            ))}
            {/* Rooftop cap */}
            <mesh position={[0, t.h + 0.07, 0]}>
              <boxGeometry args={[TW + 0.08, 0.14, TW + 0.08]} />
              <meshPhongMaterial color={districtColor} shininess={90} />
            </mesh>
          </group>
        )
      })}
      {showLabels && returnPct !== null && (
        <Html position={[0, maxH + 1.2, 0]} center distanceFactor={22}>
          <div style={{
            background: '#0f172AEE', color: labelColor,
            padding: '4px 10px', borderRadius: 8, fontSize: 22,
            fontWeight: 800, whiteSpace: 'nowrap', pointerEvents: 'none',
            border: `1.5px solid ${labelColor}77`,
            textShadow: `0 0 8px ${labelColor}99`,
          }}>
            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
          </div>
        </Html>
      )}
    </group>
  )
}

// Firefighter positions fanning around a crisis building (per-building)
const FF_OFFSETS = [
  [2.2, 0, Math.PI],
  [-2.2, 0, 0],
  [0, 2.2, -Math.PI / 2],
  [0, -2.2, Math.PI / 2],
]

// District-level firefighter patrol positions (spread around the whole neighbourhood)
const DISTRICT_FF_OFFSETS = [
  // Around the perimeter
  [-9,  0,  Math.PI * 0.75],
  [ 9,  0,  Math.PI * 0.25],
  [ 0, -9,  Math.PI * 0.5 ],
  [ 0,  9,  Math.PI * 1.5 ],
  [-6, -6,  Math.PI * 0.6 ],
  [ 6, -6,  Math.PI * 0.4 ],
  [-6,  6,  Math.PI * 1.1 ],
  [ 6,  6,  Math.PI * 1.4 ],
  // Inner ring
  [-4,  0,  Math.PI * 0.9 ],
  [ 4,  0,  Math.PI * 0.1 ],
  [ 0, -4,  Math.PI * 0.5 ],
  [ 0,  4,  Math.PI * 1.5 ],
]

// ── Neighbourhood ─────────────────────────────────────────────────────────────
function Neighbourhood({ id, portfolio, currentYear, unlockedAreas, onClick, onHover, isHovered, showLabels, showDistrictLabels, diversification, fireDrillBurning, fireDrillPhase, onStockSelect, isFinished }) {
  const cfg      = DISTRICT_CFG[id]
  const unlocked = unlockedAreas.includes(id)
  const position = DISTRICT_POSITIONS[id]

  // Holdings in this district
  const instruments = DISTRICT_INSTRUMENTS[id] || []
  const holdings    = instruments
    .map(instId => {
      const h = portfolio[instId]
      if (!h || h.shares <= 0) return null
      const price = getPrice(instId, currentYear)
      const prevPrice = getPrice(instId, currentYear - 1)
      const value = h.shares * price
      const prevValue = h.shares * prevPrice
      const isCrisis = !isFinished && prevValue > 0 && value < prevValue * 0.85
      const returnPct = h.avgPurchasePrice > 0 ? (price / h.avgPurchasePrice - 1) * 100 : 0
      const isETF  = ETF_INSTRUMENTS.has(instId)
      const isHouse = !isETF && value < 750
      return { instId, value, isCrisis, currentPrice: price, avgPurchasePrice: h.avgPurchasePrice, returnPct, isETF, isHouse }
    })
    .filter(Boolean)

  // How many firefighters show up — 0 (no diversification) to 4 (fully spread)
  const numFirefighters = Math.round(diversification * 4)

  // Exchange building: small fixed size — this is just where you trade, not a portfolio indicator
  const exchangeH = unlocked ? 3 : 2.5

  const patchColor = unlocked ? cfg.color : '#6B7280'

  return (
    <group position={position}>
      {/* Ground patch */}
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <boxGeometry args={[HOOD + 0.5, 0.04, HOOD + 0.5]} />
        <meshLambertMaterial color={patchColor} transparent opacity={unlocked ? 0.16 : 0.08} />
      </mesh>

      {/* Central exchange temple — click to open market */}
      <DistrictTemple
        color={cfg.color}
        isLocked={!unlocked}
        onClick={(e) => { e.stopPropagation(); onClick(id) }}
        onHover={(e) => { e.stopPropagation(); onHover(id) }}
        onHoverEnd={(e) => { e.stopPropagation(); onHover(null) }}
      />

      {/* Ambient filler buildings — low-rise decorative structures so district always looks populated */}
      {unlocked && FILLER_OFFSETS.map(([fx, fz, fw, fh], fi) => {
        // Skip slots that are occupied by a holding building
        const occupied = HOLDING_OFFSETS.some(([hx, hz], hi) =>
          hi < holdings.length && Math.abs(hx - fx) < 5 && Math.abs(hz - fz) < 5
        )
        if (occupied) return null
        return (
          <mesh key={`fill${fi}`} position={[fx, fh / 2, fz]} castShadow receiveShadow>
            <boxGeometry args={[fw, fh, fw]} />
            <meshPhongMaterial color={shadeColor(cfg.color, 0.45 + (fi % 3) * 0.12)} shininess={5} transparent opacity={0.70} />
          </mesh>
        )
      })}

      {/* District-level firefighters — spread around the whole neighbourhood during fire drill */}
      {fireDrillBurning && holdings.some(h => fireDrillBurning.has(h.instId)) && (
        DISTRICT_FF_OFFSETS.slice(0, Math.max(2, numFirefighters * 3)).map(([fx, fz, angle], fi) => (
          <Firefighter key={`dff${fi}`} position={[fx, 0, fz]} facingAngle={angle} />
        ))
      )}

      {/* Per-holding portfolio buildings */}
      {holdings.map(({ instId, value, isCrisis, currentPrice, avgPurchasePrice, returnPct, isETF, isHouse }, i) => {
        if (i >= HOLDING_OFFSETS.length) return null
        const [ox, oz] = HOLDING_OFFSETS[i]
        const isBurning   = !!fireDrillBurning?.has(instId)
        const isCollapsed = isBurning && fireDrillPhase === 'result'
        const clickHandler    = (e) => { e.stopPropagation(); onStockSelect?.({ instId, name: INSTRUMENTS[instId]?.name || instId }) }
        const hoverHandler    = (e) => { e.stopPropagation(); onHover(id) }
        const hoverEndHandler = (e) => { e.stopPropagation(); onHover(null) }
        const distColor = cfg.color
        const bldgH = returnToHeight(currentPrice, avgPurchasePrice)
        return (
          <group key={instId} position={[ox, 0, oz]}>
            {isCollapsed ? (
              /* Rubble after burn */
              <Rubble size={valueToScale(value)} />
            ) : isETF ? (
              <ThinSkyscraperCluster
                districtColor={distColor}
                baseH={bldgH}
                returnPct={returnPct}
                showLabels={showLabels && !isBurning}
                onClick={clickHandler}
                onHover={hoverHandler}
                onHoverEnd={hoverEndHandler}
              />
            ) : isHouse ? (
              <HouseBuilding
                color={distColor}
                holdingValue={value}
                returnPct={returnPct}
                showLabels={showLabels && !isBurning}
                onClick={clickHandler}
                onHover={hoverHandler}
                onHoverEnd={hoverEndHandler}
              />
            ) : (
              <AnimatedBuilding
                districtId={id}
                targetH={bldgH}
                shade={i % 3}
                isCrisis={isCrisis}
                isBurning={isBurning}
                isCollapsed={false}
                returnPct={returnPct}
                holdingValue={value}
                instId={instId}
                showLabels={showLabels && !isBurning}
                onClick={clickHandler}
                onHover={hoverHandler}
                onHoverEnd={hoverEndHandler}
              />
            )}

            {/* Fire on burning buildings (running phase) + per-building firefighters */}
            {(isCrisis || (isBurning && !isCollapsed)) && (
              <>
                <Fire position={[0, isETF ? 8 : isHouse ? 3.8 : bldgH * 0.75, 0]} />
                {/* Extra flames at base for drama */}
                <Fire position={[-1.0, 0.4, 0.8]} />
                <Fire position={[ 0.8, 0.4, -0.6]} />
                {FF_OFFSETS.slice(0, Math.max(1, numFirefighters)).map(([fx, fz, angle], fi) => (
                  <Firefighter key={fi} position={[fx, 0, fz]} facingAngle={angle} />
                ))}
              </>
            )}

            {/* Smoke cloud after collapse */}
            {isCollapsed && (
              <mesh position={[0, 0.8, 0]}>
                <sphereGeometry args={[1.4, 6, 5]} />
                <meshPhongMaterial color="#555555" transparent opacity={0.25} />
              </mesh>
            )}
          </group>
        )
      })}

      {/* Small label — always show when showLabels is on and large label isn't active */}
      {showLabels && !showDistrictLabels && (
        <Html position={[0, exchangeH + 2.0, 0]} center distanceFactor={38} occlude={false}>
          <div style={{
            background: unlocked ? `${cfg.color}CC` : '#374151CC',
            color: 'white', padding: '3px 9px', borderRadius: 7,
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: `1px solid ${unlocked ? cfg.color : '#6B7280'}88`,
          }}>
            {cfg.icon} {cfg.label}
            {!unlocked && ' 🔒'}
            {holdings.length > 0 && ` · ${holdings.length}`}
          </div>
        </Html>
      )}

      {/* Large district label toggle */}
      {showDistrictLabels && (
        <Html position={[0, 17, 0]} center distanceFactor={75} occlude={false}>
          <div style={{
            background: unlocked ? `${cfg.color}F2` : '#374151F2',
            color: 'white',
            padding: '12px 28px',
            borderRadius: 14,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: `2px solid ${unlocked ? cfg.color : '#6B7280'}`,
            boxShadow: `0 6px 28px rgba(0,0,0,0.55), 0 0 18px ${cfg.color}44`,
            textAlign: 'center',
            minWidth: 180,
          }}>
            <div style={{ fontSize: 26, lineHeight: 1.2 }}>{cfg.icon} {cfg.label}</div>
            {!unlocked && <div style={{ fontSize: 11, color: '#FBBF24', marginTop: 4 }}>🔒 Locked</div>}
          </div>
        </Html>
      )}
    </group>
  )
}

// ── City road grid ────────────────────────────────────────────────────────────
// ── Organic paths — hand-crafted winding routes between districts ─────────────
// Each path is an array of [x, z] waypoints; segments rendered between pairs.
// ── Rounded island platform ───────────────────────────────────────────────────
function makeRoundedRect(hw, hd, r, steps = 12) {
  const shape = new THREE.Shape()
  shape.moveTo(-hw + r, -hd)
  shape.lineTo( hw - r, -hd)
  shape.quadraticCurveTo( hw, -hd,  hw, -hd + r)
  shape.lineTo( hw,  hd - r)
  shape.quadraticCurveTo( hw,  hd,  hw - r,  hd)
  shape.lineTo(-hw + r,  hd)
  shape.quadraticCurveTo(-hw,  hd, -hw,  hd - r)
  shape.lineTo(-hw, -hd + r)
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd)
  return shape
}

function RoundedPlatform() {
  const greenGeo = useMemo(() => {
    const shape = makeRoundedRect(46, 46, 14)
    return new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false })
  }, [])

  const darkGeo = useMemo(() => {
    const shape = makeRoundedRect(47.5, 47.5, 15)
    return new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false })
  }, [])

  return (
    <group>
      {/* Green surface — shifted down so top face lands at world y=0 */}
      <mesh geometry={greenGeo} position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshLambertMaterial color="#4E7E3E" />
      </mesh>
      {/* Dark base edge — sits just below the green layer */}
      <mesh geometry={darkGeo} position={[0, -0.73, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshLambertMaterial color="#2C4A1E" />
      </mesh>
    </group>
  )
}

// ── Mountain range ────────────────────────────────────────────────────────────
// Two layers: a taller back row and a shorter front row to create depth
const MOUNTAINS = [
  // back layer — taller, further away
  { x: -100, z: -88, h: 38, r: 30, s: 0.40 },
  { x:  -72, z: -92, h: 52, r: 36, s: 0.44 },
  { x:  -44, z: -88, h: 40, r: 28, s: 0.38 },
  { x:  -16, z: -94, h: 60, r: 40, s: 0.46 },
  { x:    8, z: -92, h: 64, r: 42, s: 0.48 },
  { x:   34, z: -90, h: 54, r: 38, s: 0.44 },
  { x:   60, z: -88, h: 42, r: 30, s: 0.40 },
  { x:   84, z: -92, h: 48, r: 34, s: 0.42 },
  { x:  106, z: -87, h: 34, r: 26, s: 0.36 },
  // front layer — shorter, slightly closer, fills gaps
  { x:  -86, z: -76, h: 24, r: 20, s: 0.30 },
  { x:  -60, z: -74, h: 30, r: 22, s: 0.32 },
  { x:  -32, z: -78, h: 22, r: 18, s: 0.28 },
  { x:   -6, z: -76, h: 28, r: 20, s: 0.30 },
  { x:   20, z: -74, h: 26, r: 19, s: 0.29 },
  { x:   48, z: -78, h: 24, r: 18, s: 0.28 },
  { x:   72, z: -75, h: 30, r: 22, s: 0.31 },
  { x:   96, z: -77, h: 22, r: 18, s: 0.27 },
]

function MountainRange() {
  return (
    <group>
      {MOUNTAINS.map(({ x, z, h, r, s }, i) => {
        const snowH = h * s
        const snowR = r * s * 0.85
        return (
          <group key={i}>
            {/* Rock body */}
            <mesh position={[x, h / 2 - 1, z]}>
              <coneGeometry args={[r, h, 8]} />
              <meshLambertMaterial color="#5a6b7a" />
            </mesh>
            {/* Mid-rock lighter face */}
            <mesh position={[x, h * 0.55, z - 0.5]}>
              <coneGeometry args={[r * 0.7, h * 0.7, 8]} />
              <meshLambertMaterial color="#6e7f90" />
            </mesh>
            {/* Snow cap */}
            <mesh position={[x, h - snowH / 2 - 1, z]}>
              <coneGeometry args={[snowR, snowH, 8]} />
              <meshLambertMaterial color="#ddeaf5" />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// All roads are axis-aligned [x1,z1] → [x2,z2].
// Grouped by tier so more roads appear as more districts unlock.
const ROADS_MAIN = [
  // 3 main horizontal roads at district rows
  [[-46,-30],[46,-30]],  // top row  (bonds / equityIndices / gold)
  [[-46,  6],[46,  6]],  // mid row  (smiStocks / singleStocks)
  [[-46, 30],[46, 30]],  // harbour  (fx)
  // 3 main vertical roads at district columns
  [[-34,-40],[-34, 12]], // left column
  [[  0,-40],[  0, 36]], // centre spine
  [[ 34,-40],[ 34, 12]], // right column
]

const ROADS_SECONDARY = [
  // horizontal cross-streets between the main rows
  [[-34,-18],[34,-18]],  // between top and mid rows
  [[-34, 18],[34, 18]],  // between mid and harbour rows
  // verticals between the three main columns
  [[-17,-30],[-17,  6]], // left of centre
  [[ 17,-30],[ 17,  6]], // right of centre
]

const ROADS_TERTIARY = [
  // short HQ / library connector
  [[ -8, -2],[ 17, -2]],
  // lower-left and lower-right arms (museum / assetManager)
  [[-22,  6],[-22, 30]],
  [[ 22,  6],[ 22, 30]],
  // lower cross-street
  [[-34, 22],[ 34, 22]],
]

function RoadSegment({ x1, z1, x2, z2, y, rw, dashLen, gapLen }) {
  const period = dashLen + gapLen
  const mx  = (x1 + x2) / 2
  const mz  = (z1 + z2) / 2
  const dx  = x2 - x1
  const dz  = z2 - z1
  const len = Math.sqrt(dx * dx + dz * dz)
  const ang = Math.atan2(dx, dz)

  const count  = Math.floor(len / period)
  const offset = -(count * period) / 2 + dashLen / 2
  const dashes = Array.from({ length: count }, (_, d) => offset + d * period)

  return (
    <group>
      <mesh position={[mx, y, mz]} rotation={[0, ang, 0]}>
        <boxGeometry args={[rw, 0.03, len + 0.1]} />
        <meshLambertMaterial color="#1a1a1a" />
      </mesh>
      <group position={[mx, y + 0.01, mz]} rotation={[0, ang, 0]}>
        {dashes.map((off, di) => (
          <mesh key={di} position={[0, 0, off]}>
            <boxGeometry args={[0.1, 0.008, dashLen]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function OrganicPaths({ unlockedCount = 0 }) {
  const y       = 0.018
  const rw      = 1.7
  const dashLen = 1.1
  const gapLen  = 1.0

  const roads = [
    ...ROADS_MAIN,
    ...(unlockedCount >= 2 ? ROADS_SECONDARY : []),
    ...(unlockedCount >= 4 ? ROADS_TERTIARY  : []),
  ]

  return (
    <group>
      {roads.map(([[x1, z1], [x2, z2]], i) => (
        <RoadSegment key={i} x1={x1} z1={z1} x2={x2} z2={z2} y={y} rw={rw} dashLen={dashLen} gapLen={gapLen} />
      ))}
    </group>
  )
}

// ── Library ───────────────────────────────────────────────────────────────────
function QuizAcademy({ onClick, onHover, isHovered, showLabels }) {
  const brick  = isHovered ? '#C8783A' : '#A0522D'
  const roof   = '#5C3317'
  const stone  = '#D4B896'
  const window = '#87CEEB'

  return (
    <group position={[12, 0, -2]}>
      {/* Stone base */}
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <boxGeometry args={[7.4, 0.4, 5.4]} />
        <meshLambertMaterial color={stone} />
      </mesh>

      {/* Main body */}
      <mesh position={[0, 3.6, 0]} castShadow receiveShadow
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onPointerOver={(e) => { e.stopPropagation(); onHover('academy') }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}>
        <boxGeometry args={[7, 6.8, 5]} />
        <meshPhongMaterial color={brick} shininess={8} />
      </mesh>

      {/* Arched entrance */}
      <mesh position={[0, 1.8, 2.52]}
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onPointerOver={(e) => { e.stopPropagation(); onHover('academy') }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}>
        <boxGeometry args={[1.8, 3.0, 0.12]} />
        <meshLambertMaterial color="#3B1F0A" />
      </mesh>
      {/* Arch top (half cylinder) */}
      <mesh position={[0, 3.4, 2.52]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.12, 8, 1, false, 0, Math.PI]} />
        <meshLambertMaterial color="#3B1F0A" />
      </mesh>

      {/* Windows — front row */}
      {[-2.2, 2.2].map((x, i) => (
        <group key={i} position={[x, 4.0, 2.52]}>
          <mesh>
            <boxGeometry args={[1.2, 1.6, 0.08]} />
            <meshPhongMaterial color={window} shininess={80} transparent opacity={0.7} />
          </mesh>
          {/* Window cross */}
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[0.08, 1.6, 0.04]} />
            <meshLambertMaterial color="#5C3317" />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[1.2, 0.08, 0.04]} />
            <meshLambertMaterial color="#5C3317" />
          </mesh>
        </group>
      ))}

      {/* Side windows */}
      {[-1.5, 1.5].map((z, i) => (
        <mesh key={i} position={[3.52, 3.8, z]}>
          <boxGeometry args={[0.08, 1.4, 1.0]} />
          <meshPhongMaterial color={window} shininess={80} transparent opacity={0.6} />
        </mesh>
      ))}

      {/* Pitched roof */}
      <mesh position={[0, 7.8, 0]} rotation={[0, 0, 0]} castShadow>
        <boxGeometry args={[7.4, 0.2, 5.4]} />
        <meshLambertMaterial color={roof} />
      </mesh>
      {/* Roof ridge — left slope */}
      <mesh position={[-2.1, 9.0, 0]} rotation={[0, 0, 0.52]} castShadow>
        <boxGeometry args={[4.8, 0.22, 5.4]} />
        <meshLambertMaterial color={roof} />
      </mesh>
      {/* Roof ridge — right slope */}
      <mesh position={[2.1, 9.0, 0]} rotation={[0, 0, -0.52]} castShadow>
        <boxGeometry args={[4.8, 0.22, 5.4]} />
        <meshLambertMaterial color={roof} />
      </mesh>

      {/* Bell tower */}
      <mesh position={[0, 8.5, 0]} castShadow>
        <boxGeometry args={[1.6, 2.2, 1.6]} />
        <meshPhongMaterial color={brick} shininess={8} />
      </mesh>
      {/* Bell tower roof */}
      <mesh position={[0, 10.2, 0]} castShadow>
        <coneGeometry args={[1.1, 2.0, 4]} />
        <meshPhongMaterial color={roof} shininess={15} />
      </mesh>
      {/* Bell */}
      <mesh position={[0, 9.0, 0]}>
        <sphereGeometry args={[0.28, 8, 6]} />
        <meshPhongMaterial color="#C9A84C" shininess={90} />
      </mesh>

      {/* 📚 sign above entrance */}
      <mesh position={[0, 5.6, 2.54]}>
        <boxGeometry args={[2.8, 0.7, 0.06]} />
        <meshPhongMaterial color="#C9A84C" shininess={40} transparent opacity={0.9} />
      </mesh>

      {/* Label */}
      {showLabels && (
        <Html position={[0, 13, 0]} center distanceFactor={85}>
          <div style={{
            background: isHovered ? '#A0522DEE' : '#5C3317EE',
            color: 'white', padding: '4px 11px', borderRadius: 8,
            fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
            pointerEvents: 'none', border: '1px solid #C9A84C88',
            boxShadow: isHovered ? '0 0 10px #C9A84C88' : 'none',
          }}>
            Library
          </div>
        </Html>
      )}
    </group>
  )
}

// ── PostFinance HQ (yellow Swiss PostFinance building) ────────────────────────
function PostFinanceHQ({ onClick, onHover, isHovered, showLabels }) {
  const yellow  = '#FFD000'          // PostFinance brand yellow
  const yDark   = '#C9A000'          // darker yellow for depth
  const yLight  = '#FFE84D'          // highlight yellow
  const grey    = '#2A2A2A'          // dark facade base
  const mainH   = 16
  const clickProps = {
    onClick:       (e) => { e.stopPropagation(); onClick() },
    onPointerOver: (e) => { e.stopPropagation(); onHover('library') },
    onPointerOut:  (e) => { e.stopPropagation(); onHover(null) },
  }

  return (
    <group position={[0, 0, -1]}>
      {/* Plaza — yellow pavement circle */}
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <cylinderGeometry args={[7.5, 7.5, 0.06, 32]} />
        <meshPhongMaterial color={yellow} shininess={20} transparent opacity={0.30} />
      </mesh>

      {/* Wide podium base */}
      <mesh position={[0, 0.50, 0]} castShadow receiveShadow {...clickProps}>
        <boxGeometry args={[10.0, 1.0, 6.5]} />
        <meshPhongMaterial color={yDark} shininess={25} />
      </mesh>

      {/* Left wing — yellow panel block */}
      <mesh position={[-3.5, mainH * 0.30, 0]} castShadow receiveShadow {...clickProps}>
        <boxGeometry args={[3.2, mainH * 0.60, 5.0]} />
        <meshPhongMaterial color={yellow} shininess={40} />
      </mesh>
      {/* Left wing glass face */}
      <mesh position={[-3.5, mainH * 0.30, 2.52]}>
        <boxGeometry args={[3.0, mainH * 0.56, 0.06]} />
        <meshPhongMaterial color="#87CEEB" shininess={100} transparent opacity={0.35} />
      </mesh>

      {/* Right wing — yellow panel block */}
      <mesh position={[3.5, mainH * 0.30, 0]} castShadow receiveShadow {...clickProps}>
        <boxGeometry args={[3.2, mainH * 0.60, 5.0]} />
        <meshPhongMaterial color={yellow} shininess={40} />
      </mesh>
      {/* Right wing glass face */}
      <mesh position={[3.5, mainH * 0.30, 2.52]}>
        <boxGeometry args={[3.0, mainH * 0.56, 0.06]} />
        <meshPhongMaterial color="#87CEEB" shininess={100} transparent opacity={0.35} />
      </mesh>

      {/* Central dark tower */}
      <mesh position={[0, mainH * 0.50, 0]} castShadow receiveShadow {...clickProps}>
        <boxGeometry args={[4.0, mainH, 5.0]} />
        <meshPhongMaterial color={grey} shininess={50} />
      </mesh>
      {/* Central tower glass curtain wall */}
      <mesh position={[0, mainH * 0.50, 2.52]}>
        <boxGeometry args={[3.6, mainH * 0.96, 0.06]} />
        <meshPhongMaterial color="#93C5FD" shininess={120} transparent opacity={0.50} />
      </mesh>

      {/* Horizontal yellow floor bands across full width */}
      {[3.5, 6.5, 9.5, 12.5, mainH].map(y => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <boxGeometry args={[10.2, 0.22, 5.2]} />
          <meshPhongMaterial color={yLight} shininess={60} />
        </mesh>
      ))}

      {/* Rooftop yellow cap */}
      <mesh position={[0, mainH + 0.40, 0]} castShadow>
        <boxGeometry args={[10.4, 0.80, 5.4]} />
        <meshPhongMaterial color={yellow} shininess={55} />
      </mesh>

      {/* Antenna mast */}
      <mesh position={[0, mainH + 3.4, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 5.0, 6]} />
        <meshPhongMaterial color={yDark} shininess={80} />
      </mesh>

      {/* "PostFinance" sign on front face — only when labels are visible */}
      {showLabels && (
        <Html position={[0, mainH * 0.52, 2.60]} center distanceFactor={75}>
          <div style={{
            color: yellow,
            fontWeight: 900,
            fontSize: 18,
            letterSpacing: '0.12em',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            textShadow: `0 0 8px ${yellow}CC, 0 2px 4px #000`,
            fontFamily: 'Arial Black, sans-serif',
            textTransform: 'uppercase',
          }}>
            PostFinance HQ
          </div>
        </Html>
      )}
    </group>
  )
}

// ── Eiffel Tower ──────────────────────────────────────────────────────────────
function EiffelTower({ unlocked }) {
  const col   = unlocked ? '#C9A84C' : '#6B7280'
  const shine = unlocked ? 55 : 0

  const mat = <meshPhongMaterial color={col} shininess={shine} />

  // Leg positions (4 corners angled inward)
  const legs = [[-1.1, 0, -1.1], [1.1, 0, -1.1], [-1.1, 0, 1.1], [1.1, 0, 1.1]]

  return (
    <group>
      {/* Ground patch */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.5, 24]} />
        <meshLambertMaterial color={unlocked ? '#C8B880' : '#5C6B6B'} transparent opacity={0.35} />
      </mesh>

      {/* 4 angled legs */}
      {legs.map(([lx, , lz], i) => {
        const rx = lz > 0 ? 0.32 : -0.32
        const rz = lx > 0 ? -0.32 : 0.32
        return (
          <mesh key={i} position={[lx * 0.55, 1.6, lz * 0.55]} rotation={[rx, 0, rz]} castShadow>
            <boxGeometry args={[0.24, 3.4, 0.24]} />
            {mat}
          </mesh>
        )
      })}

      {/* Lower arch cross-beams */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[2.4, 0.22, 0.22]} />
        {mat}
      </mesh>
      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[0.22, 0.22, 2.4]} />
        {mat}
      </mesh>

      {/* Lower body (tapered) */}
      <mesh position={[0, 4.0, 0]} castShadow>
        <cylinderGeometry args={[0.55, 1.0, 2.8, 8]} />
        {mat}
      </mesh>

      {/* Observation deck ring */}
      <mesh position={[0, 5.6, 0]}>
        <cylinderGeometry args={[0.75, 0.75, 0.20, 16]} />
        {mat}
      </mesh>

      {/* Upper body */}
      <mesh position={[0, 7.2, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.55, 3.0, 8]} />
        {mat}
      </mesh>

      {/* Top beacon */}
      <mesh position={[0, 9.0, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.30, 12]} />
        {mat}
      </mesh>

      {/* Antenna */}
      <mesh position={[0, 10.8, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 3.6, 8]} />
        {mat}
      </mesh>
    </group>
  )
}

// ── Big Ben ───────────────────────────────────────────────────────────────────
function BigBen({ position = [0, 0, 0] }) {
  const stone  = '#C8B896'
  const dark   = '#8B7355'
  const clockBg = '#1E3A2F'
  const gold   = '#C9A84C'
  const mat    = (color, shine = 10) => <meshPhongMaterial color={color} shininess={shine} />

  return (
    <group position={position}>
      {/* Ground circle */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.0, 20]} />
        <meshLambertMaterial color="#C8B880" transparent opacity={0.35} />
      </mesh>

      {/* Stone base podium */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.0, 0.70, 4.0]} />
        {mat(dark, 8)}
      </mesh>

      {/* Lower tower */}
      <mesh position={[0, 4.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.9, 7.8, 2.9]} />
        {mat(stone)}
      </mesh>

      {/* Floor bands on lower tower */}
      {[2.5, 5.0, 7.0].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} castShadow>
          <boxGeometry args={[3.1, 0.18, 3.1]} />
          {mat(dark, 5)}
        </mesh>
      ))}

      {/* Clock section (slightly wider) */}
      <mesh position={[0, 9.7, 0]} castShadow>
        <boxGeometry args={[3.4, 2.6, 3.4]} />
        {mat(stone)}
      </mesh>

      {/* Clock faces — 4 sides */}
      {[[0, 9.7, 1.72], [0, 9.7, -1.72], [1.72, 9.7, 0], [-1.72, 9.7, 0]].map(([cx, cy, cz], i) => (
        <group key={i} position={[cx, cy, cz]}>
          <mesh rotation={[Math.PI / 2, i < 2 ? 0 : Math.PI / 2, 0]}>
            <cylinderGeometry args={[0.95, 0.95, 0.10, 16]} />
            <meshPhongMaterial color={clockBg} shininess={20} />
          </mesh>
          {/* Gold clock ring */}
          <mesh rotation={[Math.PI / 2, i < 2 ? 0 : Math.PI / 2, 0]}>
            <torusGeometry args={[0.95, 0.09, 6, 20]} />
            <meshPhongMaterial color={gold} shininess={60} />
          </mesh>
        </group>
      ))}

      {/* Belfry section */}
      <mesh position={[0, 11.4, 0]} castShadow>
        <boxGeometry args={[2.6, 1.5, 2.6]} />
        {mat(stone)}
      </mesh>

      {/* Belfry corner columns */}
      {[[-1.1, 11.4, -1.1], [1.1, 11.4, -1.1], [-1.1, 11.4, 1.1], [1.1, 11.4, 1.1]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <cylinderGeometry args={[0.18, 0.20, 1.5, 6]} />
          {mat(dark)}
        </mesh>
      ))}

      {/* Spire base octagon */}
      <mesh position={[0, 12.5, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1.5, 0.8, 8]} />
        {mat(stone)}
      </mesh>

      {/* Spire */}
      <mesh position={[0, 14.7, 0]} castShadow>
        <coneGeometry args={[1.1, 4.0, 8]} />
        {mat(stone, 15)}
      </mesh>

      {/* Antenna tip */}
      <mesh position={[0, 17.0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.2, 6]} />
        {mat(gold, 80)}
      </mesh>
    </group>
  )
}

// ── Yacht monument ────────────────────────────────────────────────────────────
function Yacht({ position = [0, 0, 0] }) {
  const hullRef = useRef()
  useFrame(({ clock }) => {
    if (hullRef.current) {
      const t = clock.getElapsedTime()
      hullRef.current.rotation.z = Math.sin(t * 0.8) * 0.03
      hullRef.current.position.y = Math.sin(t * 1.1) * 0.18
    }
  })
  return (
    <group position={position}>
      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.5, 24]} />
        <meshPhongMaterial color="#1B6FA8" shininess={60} transparent opacity={0.7} />
      </mesh>
      <group ref={hullRef}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <boxGeometry args={[7.0, 0.56, 2.2]} />
          <meshPhongMaterial color="#F0F0F0" shininess={40} />
        </mesh>
        <mesh position={[0, -0.08, 0]} castShadow>
          <boxGeometry args={[7.0, 0.22, 2.2]} />
          <meshPhongMaterial color="#1C3B5A" shininess={20} />
        </mesh>
        <mesh position={[3.2, 0.22, 0]} rotation={[0, 0.44, 0]} castShadow>
          <boxGeometry args={[1.2, 0.50, 2.0]} />
          <meshPhongMaterial color="#F0F0F0" shininess={40} />
        </mesh>
        <mesh position={[0, 0.58, 0]} castShadow>
          <boxGeometry args={[6.6, 0.12, 2.0]} />
          <meshPhongMaterial color="#D4AA70" shininess={15} />
        </mesh>
        <mesh position={[-1.0, 1.10, 0]} castShadow>
          <boxGeometry args={[2.8, 0.96, 1.8]} />
          <meshPhongMaterial color="#F5F5F5" shininess={30} />
        </mesh>
        <mesh position={[-1.0, 1.62, 0]} castShadow>
          <boxGeometry args={[2.9, 0.16, 1.9]} />
          <meshPhongMaterial color="#1C3B5A" shininess={20} />
        </mesh>
        {[-0.4, 0.6].map((x, i) => (
          <mesh key={i} position={[x, 1.10, 0.92]}>
            <boxGeometry args={[0.65, 0.42, 0.06]} />
            <meshPhongMaterial color="#87CEEB" shininess={100} transparent opacity={0.8} />
          </mesh>
        ))}
        {/* Mast */}
        <mesh position={[1.4, 4.5, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.10, 8.0, 7]} />
          <meshPhongMaterial color="#C0C0C0" shininess={60} />
        </mesh>
        {/* Main sail */}
        <mesh position={[0.2, 4.6, 0]} castShadow>
          <boxGeometry args={[2.6, 6.8, 0.04]} />
          <meshPhongMaterial color="white" shininess={10} transparent opacity={0.92} />
        </mesh>
        {/* Boom */}
        <mesh position={[0.4, 1.3, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.055, 0.055, 3.0, 6]} />
          <meshPhongMaterial color="#C0C0C0" shininess={40} />
        </mesh>
        {/* Red stripe */}
        <mesh position={[0, 0.12, 1.12]}>
          <boxGeometry args={[6.8, 0.14, 0.04]} />
          <meshPhongMaterial color="#DC2626" shininess={30} />
        </mesh>
        {/* Yellow flag */}
        <mesh position={[1.8, 8.7, 0]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.7, 0.4, 0.04]} />
          <meshPhongMaterial color="#FFD000" shininess={20} />
        </mesh>
      </group>
    </group>
  )
}

// ── Monument placement spot (animated golden ring) ────────────────────────────
function PlacementSpot({ position, onPlace }) {
  const ringRef = useRef()
  const glowRef = useRef()

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ringRef.current)  ringRef.current.position.y = Math.sin(t * 2.2) * 0.22 + 0.4
    if (glowRef.current)  glowRef.current.rotation.y = t * 0.8
  })

  return (
    <group position={position}>
      {/* Large invisible hit area — easy to click */}
      <mesh
        position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onPlace(position) }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
        onPointerOut={(e)  => { e.stopPropagation(); document.body.style.cursor = 'default' }}
      >
        <circleGeometry args={[7, 20]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <group ref={ringRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.6, 0.35, 8, 28]} />
          <meshPhongMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.55} transparent opacity={0.88} />
        </mesh>
      </group>
      <mesh ref={glowRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.2, 20]} />
        <meshPhongMaterial color="#FFD700" transparent opacity={0.13} />
      </mesh>
      <pointLight position={[0, 1.2, 0]} color="#FFD700" intensity={1.0} distance={9} />
      <Html position={[0, 4.5, 0]} center distanceFactor={55}>
        <div style={{
          background: '#0f172aEE', color: '#FFD700', padding: '5px 14px',
          borderRadius: 8, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          pointerEvents: 'none', border: '1px solid #FFD70066',
        }}>
          Click to place here
        </div>
      </Html>
    </group>
  )
}

// Monument spot positions (edges of platform, away from all buildings)
const MONUMENT_SPOTS = [
  { id: 0, pos: [-38, 0, -43] },
  { id: 1, pos: [  0, 0, -43] },
  { id: 2, pos: [ 38, 0, -43] },
  { id: 3, pos: [-38, 0,  43] },
  { id: 4, pos: [  0, 0,  43] },
  { id: 5, pos: [ 38, 0,  43] },
]

// Yacht-specific spots — in the harbour water (z > PH=46, y at water surface)
const YACHT_SPOTS = [
  { id: 10, pos: [-20, -0.5, 56] },
  { id: 11, pos: [  0, -0.5, 56] },
  { id: 12, pos: [ 20, -0.5, 56] },
]

// ── Museum ────────────────────────────────────────────────────────────────────
function MuseumBuilding({ onClick, onHover, isHovered, showLabels }) {
  const stone  = '#E8DCC8'
  const dark   = '#C8B89A'
  const accent = '#C9A84C'
  return (
    <group position={[-22, 0, 22]}>
      {/* Plaza */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.5, 24]} />
        <meshLambertMaterial color="#C8B880" transparent opacity={0.35} />
      </mesh>

      {/* Steps — three layers */}
      {[0, 0.28, 0.56].map((y, i) => (
        <mesh key={i} position={[0, y + 0.14, 0]} receiveShadow>
          <boxGeometry args={[7 - i * 0.6, 0.28, 5 - i * 0.4]} />
          <meshLambertMaterial color={stone} />
        </mesh>
      ))}

      {/* Main body */}
      <mesh position={[0, 3.0, 0]} castShadow receiveShadow
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onPointerOver={(e) => { e.stopPropagation(); onHover('museum') }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}>
        <boxGeometry args={[6.2, 4.2, 4.0]} />
        <meshPhongMaterial color={stone} shininess={10} />
      </mesh>

      {/* Front columns */}
      {[-2.2, -0.7, 0.7, 2.2].map((x, i) => (
        <mesh key={i} position={[x, 3.0, 2.1]} castShadow>
          <cylinderGeometry args={[0.24, 0.28, 4.2, 8]} />
          <meshPhongMaterial color="#EDE4D0" shininess={12} />
        </mesh>
      ))}

      {/* Entablature (beam above columns) */}
      <mesh position={[0, 5.3, 2.1]} castShadow>
        <boxGeometry args={[6.4, 0.28, 0.36]} />
        <meshLambertMaterial color={dark} />
      </mesh>

      {/* Pediment */}
      <mesh position={[0, 6.0, 2.0]} castShadow>
        <boxGeometry args={[6.4, 0.22, 0.22]} />
        <meshLambertMaterial color={dark} />
      </mesh>
      {/* Pediment triangle sides */}
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[s * 2.6, 6.5, 2.0]} rotation={[0, 0, s * 0.46]} castShadow>
          <boxGeometry args={[1.8, 0.22, 0.22]} />
          <meshLambertMaterial color={dark} />
        </mesh>
      ))}

      {/* Gold trophy on roof */}
      <mesh position={[0, 5.6, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.20, 0.60, 8]} />
        <meshPhongMaterial color={accent} shininess={80} />
      </mesh>
      <mesh position={[0, 6.1, 0]} castShadow>
        <sphereGeometry args={[0.38, 8, 6]} />
        <meshPhongMaterial color={accent} shininess={100} />
      </mesh>

      {/* Label */}
      {showLabels && (
        <Html position={[0, 8.5, 0]} center distanceFactor={85}>
          <div style={{
            background: isHovered ? '#C9A84CEE' : '#92400EEE',
            color: 'white', padding: '4px 11px', borderRadius: 8,
            fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
            pointerEvents: 'none', border: '1px solid #C9A84C88',
            boxShadow: isHovered ? '0 0 10px #C9A84C99' : 'none',
          }}>
            🏛️ Museum
          </div>
        </Html>
      )}
    </group>
  )
}

// ── Asset Manager Zone ────────────────────────────────────────────────────────
// Sits at one of the two empty corners near the harbour
function AssetManagerZone({ unlocked, showLabels, onClick }) {
  // Position: right of FX harbour (empty corner at +X side)
  return (
    <group position={[22, 0, 22]} onClick={(e) => { e.stopPropagation(); if (unlocked) onClick?.() }}>
      <EiffelTower unlocked={unlocked} />
      {showLabels && (
        <Html position={[0, 13, 0]} center distanceFactor={85}>
          <div style={{
            background: unlocked ? '#C9A84CEE' : '#374151EE',
            color: 'white', padding: '4px 11px', borderRadius: 8,
            fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: `1px solid ${unlocked ? '#F59E0B' : '#6B7280'}88`,
          }}>
            {unlocked ? '🏆 Asset Manager' : '🔒 5-day streak to unlock'}
          </div>
        </Html>
      )}
    </group>
  )
}

// ── Tree ──────────────────────────────────────────────────────────────────────
function Tree({ position, scale = 1 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.5 * scale, 0]} castShadow>
        <cylinderGeometry args={[0.10 * scale, 0.14 * scale, 0.95 * scale, 5]} />
        <meshLambertMaterial color="#5D4037" />
      </mesh>
      <mesh position={[0, 1.45 * scale, 0]} castShadow>
        <sphereGeometry args={[0.70 * scale, 7, 5]} />
        <meshLambertMaterial color="#2E7D32" />
      </mesh>
      <mesh position={[0, 2.05 * scale, 0]} castShadow>
        <sphereGeometry args={[0.48 * scale, 7, 5]} />
        <meshLambertMaterial color="#388E3C" />
      </mesh>
    </group>
  )
}

// ── Harbour ───────────────────────────────────────────────────────────────────
function Harbour() {
  const PH = PLATFORM_HALF
  return (
    <group>
      {/* Water — single large square surrounding the whole island */}
      <mesh position={[0, -0.56, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshPhongMaterial color="#1B6FA8" shininess={55} />
      </mesh>
      {/* Pier */}
      <mesh position={[0, -0.02, PH + 2]}>
        <boxGeometry args={[3.2, 0.14, 4.5]} />
        <meshLambertMaterial color="#B8936A" />
      </mesh>
      {[0.6, 1.6, 2.6, 3.6].map(dz => (
        <mesh key={dz} position={[0, 0.08, PH + dz]}>
          <boxGeometry args={[3.2, 0.04, 0.75]} />
          <meshLambertMaterial color="#8B6914" />
        </mesh>
      ))}
      {[[-1.3, PH + 0.6], [1.3, PH + 0.6], [-1.3, PH + 4.2], [1.3, PH + 4.2]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.28, pz]} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 0.52, 6]} />
          <meshLambertMaterial color="#5D4037" />
        </mesh>
      ))}
      {/* Boats */}
      <mesh position={[-7.5, -0.28, PH + 6]} castShadow>
        <boxGeometry args={[2.8, 0.40, 1.1]} />
        <meshPhongMaterial color="#F8F8F8" shininess={50} />
      </mesh>
      <mesh position={[6.5, -0.28, PH + 8]} castShadow>
        <boxGeometry args={[2.2, 0.36, 1.0]} />
        <meshPhongMaterial color="#DC2626" shininess={40} />
      </mesh>
      <mesh position={[-1, -0.28, PH + 11]} castShadow>
        <boxGeometry args={[2.5, 0.34, 1.1]} />
        <meshPhongMaterial color="#1D4ED8" shininess={40} />
      </mesh>
    </group>
  )
}

// ── Tree positions ────────────────────────────────────────────────────────────
const TREE_POS = [
  // Outer ring corners (scaled to new PLATFORM_HALF=46)
  [-43, 0, -43], [-43, 0, 0], [-43, 0, 43],
  [ 43, 0, -43], [ 43, 0, 0], [ 43, 0, 43],
  [-22, 0, -43], [  0, 0, -43], [ 22, 0, -43],
  [-22, 0,  43], [  0, 0,  43], [ 22, 0,  43],
  // Between districts (gaps between the 3 columns)
  [-17, 0, -30], [17, 0, -30], [-17, 0, 6], [17, 0, 6],
  [-17, 0, 30],  [17, 0, 30],
  [0, 0, -12], [0, 0, 18],
  // Sides mid-row
  [-43, 0, -16], [43, 0, -16], [-43, 0, 16], [43, 0, 16],
  [-24, 0, -16], [24, 0, -16], [-24, 0, 16], [24, 0, 16],
]

// ── Ad Mode ───────────────────────────────────────────────────────────────────

// Roads with individual appear-times so they build up progressively
const AD_ROADS = [
  { s: ROADS_MAIN[0],      at: 0.25 }, // top horizontal row
  { s: ROADS_MAIN[3],      at: 0.40 }, // left column
  { s: ROADS_MAIN[4],      at: 0.55 }, // centre spine
  { s: ROADS_MAIN[5],      at: 0.70 }, // right column
  { s: ROADS_MAIN[1],      at: 0.90 }, // mid horizontal row
  { s: ROADS_MAIN[2],      at: 1.15 }, // harbour row
  { s: ROADS_SECONDARY[2], at: 1.8  },
  { s: ROADS_SECONDARY[3], at: 2.2  },
  { s: ROADS_SECONDARY[0], at: 2.6  },
  { s: ROADS_SECONDARY[1], at: 3.0  },
  { s: ROADS_TERTIARY[0],  at: 3.4  },
  { s: ROADS_TERTIARY[2],  at: 3.7  },
  { s: ROADS_TERTIARY[3],  at: 3.9  },
  { s: ROADS_TERTIARY[1],  at: 4.1  },
]

// Road segment that grows outward from its centre (scale.z 0→1)
function AdRoadSegment({ x1, z1, x2, z2, at, adTimeRef }) {
  const groupRef = useRef()
  const y = 0.018, rw = 1.7, dashLen = 1.1, gapLen = 1.0
  const mx  = (x1 + x2) / 2, mz = (z1 + z2) / 2
  const dx  = x2 - x1, dz = z2 - z1
  const len = Math.sqrt(dx * dx + dz * dz)
  const ang = Math.atan2(dx, dz)
  const period = dashLen + gapLen
  const count  = Math.floor(len / period)
  const offset = -(count * period) / 2 + dashLen / 2
  const dashes = Array.from({ length: count }, (_, d) => offset + d * period)

  useFrame(() => {
    if (!groupRef.current) return
    const p = Math.min(1, Math.max(0, (adTimeRef.current - at) / 0.7))
    groupRef.current.visible = p > 0
    groupRef.current.scale.z = p   // stretches along road direction
  })

  return (
    <group ref={groupRef} position={[mx, y, mz]} rotation={[0, ang, 0]}>
      <mesh>
        <boxGeometry args={[rw, 0.03, len + 0.1]} />
        <meshLambertMaterial color="#1a1a1a" />
      </mesh>
      <group position={[0, 0.01, 0]}>
        {dashes.map((off, di) => (
          <mesh key={di} position={[0, 0, off]}>
            <boxGeometry args={[0.1, 0.008, dashLen]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function AdOrganicPaths({ adTimeRef }) {
  return (
    <>
      {AD_ROADS.map(({ s: [[x1, z1], [x2, z2]], at }, i) => (
        <AdRoadSegment key={i} x1={x1} z1={z1} x2={x2} z2={z2} at={at} adTimeRef={adTimeRef} />
      ))}
    </>
  )
}

// District reveal order and timing: district i appears at t = 2 + i * 0.5 seconds
const AD_DISTRICT_ORDER = ['bonds', 'equityIndices', 'gold', 'smiStocks', 'singleStocks', 'fx']

// When each district's buildings start shooting up (staggered for drama)
const DISTRICT_GROW_START = {
  bonds:         4.8,
  gold:          5.2,
  equityIndices: 5.6,
  smiStocks:     6.0,
  singleStocks:  6.4,
  fx:            6.8,
}

// Per-building layout: [localX, localZ, shade, houseH, skyscraperH]
const AD_BUILDING_PRESETS = [
  [-7, -7, 0, 2.0, 30],
  [ 0, -8, 1, 2.5, 43],
  [ 7, -7, 2, 1.8, 36],
  [-8,  0, 0, 2.2, 24],
  [ 8,  0, 2, 2.0, 38],
  [-7,  7, 1, 1.5, 28],
  [ 0,  8, 0, 2.3, 46],
  [ 7,  7, 2, 1.8, 32],
]

// Ticks the shared ad time ref every frame (no React state → no re-renders)
function AdClock({ adTimeRef, adStartRef }) {
  useFrame(({ clock }) => {
    if (adStartRef.current === null) adStartRef.current = clock.getElapsedTime()
    adTimeRef.current = Math.min(15, clock.getElapsedTime() - adStartRef.current)
  })
  return null
}

// Cinematic camera: slow orbit + descend, then dramatic zoom-out at the end
function CameraRig({ adTimeRef }) {
  const { camera } = useThree()
  useFrame(() => {
    const t     = adTimeRef.current
    const angle = t * 0.055   // gentle ~50° arc over 15 s

    let r, elevation
    if (t < 10) {
      r         = 74
      elevation = Math.max(42, 62 - t * 1.6)   // descend 62 → ~46
    } else {
      // Zoom out over 2 s so the full skyline + monuments fit in frame
      const p   = Math.min(1, (t - 10) / 2.5)
      r         = 74  + (128 - 74)  * p
      elevation = 46  + (88  - 46)  * p
    }

    camera.position.set(Math.sin(angle) * r, elevation, Math.cos(angle) * r)
    camera.lookAt(0, 5, 0)
  })
  return null
}

// A single scripted building: shows a real house pre-growth, skyscraper after
function AdAnimatedBuilding({ districtId, shade, adTimeRef, appearAt, growAt, houseH, skyscraperH, buildingIdx }) {
  const houseRef     = useRef()
  const skyRef       = useRef()
  const currentScale = useRef(0)
  const pctLabelRef  = useRef(null)

  const fp    = 4.0
  const parts = useMemo(
    () => getBuildingParts(districtId, fp, fp, PARTS_H, shade, false, false, false),
    [districtId, shade]
  )

  const color     = DISTRICT_CFG[districtId]?.color || '#888'
  const roofColor = shadeColor(color, 0.55)

  // Unique oscillation per building so they move independently
  const oscFreq  = 0.50 + buildingIdx * 0.13 + shade * 0.21
  const oscPhase = buildingIdx * 1.37 + shade * 0.94
  const oscAmp   = skyscraperH * 0.18   // ±18 % swing

  useFrame(({ clock }) => {
    const t = adTimeRef.current
    const houseVisible = t >= appearAt && t < growAt
    const skyVisible   = t >= growAt

    if (houseRef.current) houseRef.current.visible = houseVisible
    if (!skyRef.current) return

    if (!skyVisible) {
      currentScale.current = 0
      skyRef.current.scale.y = 0
      skyRef.current.visible = false
      return
    }

    skyRef.current.visible = true
    const osc    = Math.sin(clock.getElapsedTime() * oscFreq + oscPhase) * oscAmp
    const targetH = skyscraperH + osc
    const grown   = currentScale.current >= skyscraperH / PARTS_H * 0.90
    const speed   = !grown ? 0.11 : 0.04
    currentScale.current += (Math.max(0.01, targetH / PARTS_H) - currentScale.current) * speed
    skyRef.current.scale.y = Math.max(0, currentScale.current)

    // Update % badge directly — no React re-render; hide in final overlay phase
    if (pctLabelRef.current) {
      const finalPhase = t >= 10.0
      if (grown && !finalPhase) {
        const pct = ((currentScale.current * PARTS_H - skyscraperH) / skyscraperH) * 100
        const col = pct >= 0 ? '#4ade80' : '#f87171'
        pctLabelRef.current.textContent       = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
        pctLabelRef.current.style.color       = col
        pctLabelRef.current.style.borderColor = col + '66'
        pctLabelRef.current.style.opacity     = '1'
      } else {
        pctLabelRef.current.style.opacity = '0'
      }
    }
  })

  // House size varies per building for variety (small → medium)
  const hs   = 0.58 + (buildingIdx % 4) * 0.11
  const hw   = 3.0 * hs, hd = 3.0 * hs, wallH = 2.2 * hs

  return (
    <>
      {/* ── House (visible before growAt) ── */}
      <group ref={houseRef} visible={false}>
        <mesh position={[0, wallH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[hw, wallH, hd]} />
          <meshPhongMaterial color={color} shininess={10} />
        </mesh>
        <mesh position={[-hw * 0.265, wallH + 0.32 * hs, 0]} rotation={[0, 0, 0.52]} castShadow>
          <boxGeometry args={[hw * 0.65, 0.17 * hs, hd + 0.3 * hs]} />
          <meshPhongMaterial color={roofColor} shininess={4} />
        </mesh>
        <mesh position={[hw * 0.265, wallH + 0.32 * hs, 0]} rotation={[0, 0, -0.52]} castShadow>
          <boxGeometry args={[hw * 0.65, 0.17 * hs, hd + 0.3 * hs]} />
          <meshPhongMaterial color={roofColor} shininess={4} />
        </mesh>
        <mesh position={[0, 0.5 * hs, hd / 2 + 0.04]}>
          <boxGeometry args={[0.65 * hs, 1.0 * hs, 0.07]} />
          <meshLambertMaterial color="#5D4037" />
        </mesh>
      </group>

      {/* ── Skyscraper (visible from growAt onwards, oscillates) ── */}
      <group ref={skyRef} visible={false}>
        <ThemeBuilding parts={parts} />
        <Html position={[0, PARTS_H + 0.8, 0]} center distanceFactor={22}>
          <div
            ref={pctLabelRef}
            style={{
              background: '#0f172AEE', color: '#4ade80',
              padding: '4px 10px', borderRadius: 8,
              fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap',
              pointerEvents: 'none', border: '1.5px solid #4ade8066',
              textShadow: '0 0 8px rgba(74,222,128,0.6)',
              opacity: 0, transition: 'opacity 0.4s',
            }}
          />
        </Html>
      </group>
    </>
  )
}

// ── Fireworks ─────────────────────────────────────────────────────────────────
const N_PARTICLES = 28

const FIREWORK_DATA = [
  { x: -24, z: -18, at: 10.3, color: '#FFD000', burstY: 46 },
  { x:  20, z: -12, at: 10.7, color: '#4ade80', burstY: 52 },
  { x:   2, z:  14, at: 11.0, color: '#60a5fa', burstY: 44 },
  { x: -12, z:  20, at: 11.4, color: '#f472b6', burstY: 50 },
  { x:  26, z:   4, at: 11.7, color: '#FFD000', burstY: 48 },
  { x:  -4, z: -26, at: 12.0, color: '#fb923c', burstY: 54 },
]

function AdFireworkBurst({ x, z, at, color, burstY, adTimeRef }) {
  const groupRef      = useRef()
  const rocketRef     = useRef()
  const particleRefs  = useRef([])

  // Deterministic spherical burst velocities
  const velocities = useMemo(() =>
    Array.from({ length: N_PARTICLES }, (_, i) => {
      const theta    = (i / N_PARTICLES) * Math.PI * 2
      const phi      = Math.acos(1 - 2 * (i + 0.5) / N_PARTICLES)
      const speed    = 0.16 + (i % 4) * 0.04
      return {
        vx: Math.sin(phi) * Math.cos(theta) * speed,
        vy: Math.abs(Math.cos(phi)) * speed + 0.06,   // bias upward
        vz: Math.sin(phi) * Math.sin(theta) * speed,
      }
    }), []
  )

  useFrame(() => {
    if (!groupRef.current) return
    const t       = adTimeRef.current
    const elapsed = t - at

    if (elapsed < 0) { groupRef.current.visible = false; return }
    groupRef.current.visible = true

    if (elapsed < 0.7) {
      // Rising rocket
      if (rocketRef.current) {
        rocketRef.current.visible = true
        rocketRef.current.position.set(0, (elapsed / 0.7) * burstY, 0)
      }
      particleRefs.current.forEach(r => { if (r) r.visible = false })
    } else {
      // Explosion
      if (rocketRef.current) rocketRef.current.visible = false
      const bt   = elapsed - 0.7
      const fade = Math.max(0, 1 - bt / 2.2)
      particleRefs.current.forEach((r, i) => {
        if (!r) return
        if (fade <= 0) { r.visible = false; return }
        r.visible = true
        r.scale.setScalar(fade * 0.6)
        r.position.set(
          velocities[i].vx * bt * 32,
          burstY + velocities[i].vy * bt * 32 - 4.9 * bt * bt,
          velocities[i].vz * bt * 32,
        )
      })
    }
  })

  return (
    <group ref={groupRef} position={[x, 0, z]} visible={false}>
      <mesh ref={rocketRef} visible={false}>
        <sphereGeometry args={[0.35, 5, 5]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {Array.from({ length: N_PARTICLES }, (_, i) => (
        <mesh key={i} ref={el => { particleRefs.current[i] = el }}>
          <sphereGeometry args={[0.55, 5, 5]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  )
}

function AdFireworks({ adTimeRef }) {
  return (
    <>
      {FIREWORK_DATA.map((fw, i) => (
        <AdFireworkBurst key={i} {...fw} adTimeRef={adTimeRef} />
      ))}
    </>
  )
}

// ── Floating return-% labels ───────────────────────────────────────────────────
const RETURN_LABELS = [
  { pos: [-28, 32, -10], text: '+21.9%', color: '#4ade80', at: 10.5 },
  { pos: [  22, 36, -8], text: '+38.5%', color: '#4ade80', at: 10.8 },
  { pos: [ -8, 28,  18], text: '+9.3%',  color: '#4ade80', at: 11.0 },
  { pos: [ 30, 40,   8], text: '+156%',  color: '#FFD000', at: 11.2 },
  { pos: [-18, 44, -22], text: '-12.4%', color: '#f87171', at: 11.4 },
  { pos: [  5, 30,  28], text: '+64.2%', color: '#4ade80', at: 11.6 },
  { pos: [-32, 38,  10], text: '+15.3%', color: '#4ade80', at: 11.8 },
  { pos: [ 15, 34, -28], text: '+203%',  color: '#FFD000', at: 12.0 },
]

function AdReturnLabel({ pos, text, color, at, adTimeRef }) {
  const groupRef  = useRef()
  const labelRef  = useRef()

  useFrame(() => {
    if (!groupRef.current) return
    const elapsed = adTimeRef.current - at
    const visible = elapsed > 0
    groupRef.current.visible = visible
    if (labelRef.current) labelRef.current.style.opacity = visible ? '1' : '0'
    if (visible) {
      groupRef.current.position.set(pos[0], pos[1] + elapsed * 2.5, pos[2])
    }
  })

  return (
    <group ref={groupRef} position={pos} visible={false}>
      <Html center distanceFactor={90}>
        <div ref={labelRef} style={{
          color, fontWeight: 900, fontSize: 26, opacity: 0,
          textShadow: `0 0 14px ${color}, 0 0 4px rgba(0,0,0,0.9)`,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          fontFamily: 'Arial Black, Impact, sans-serif',
          transition: 'opacity 0.3s',
        }}>
          {text}
        </div>
      </Html>
    </group>
  )
}

function AdReturnLabels({ adTimeRef }) {
  return (
    <>
      {RETURN_LABELS.map((l, i) => (
        <AdReturnLabel key={i} {...l} adTimeRef={adTimeRef} />
      ))}
    </>
  )
}

// Big Ben + Yacht appear during the final zoom-out
function AdMonuments({ adTimeRef }) {
  const groupRef = useRef()
  useFrame(() => {
    if (!groupRef.current) return
    groupRef.current.visible = adTimeRef.current >= 10.0
  })
  return (
    <group ref={groupRef} visible={false}>
      <group position={[-38, 0, -43]}><BigBen /></group>
      <group position={[0, -0.5, 56]}><Yacht /></group>
    </group>
  )
}

// One district in ad mode: temple + scripted buildings, shown/hidden by time
function AdDistrict({ id, adTimeRef }) {
  const cfg       = DISTRICT_CFG[id]
  const position  = DISTRICT_POSITIONS[id]
  const distIdx   = AD_DISTRICT_ORDER.indexOf(id)
  const appearAt  = 1.0 + distIdx * 0.35
  const groupRef  = useRef()
  const pillRef   = useRef()   // district name pill — hidden in final phase

  useFrame(() => {
    if (!groupRef.current) return
    const t = adTimeRef.current
    groupRef.current.visible = t >= appearAt
    // Hide the district name pill once the final overlay takes over
    if (pillRef.current) pillRef.current.style.display = t >= 10.0 ? 'none' : 'block'
  })

  return (
    <group ref={groupRef} position={position} visible={false}>
      {/* Coloured ground patch */}
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <boxGeometry args={[HOOD + 0.5, 0.04, HOOD + 0.5]} />
        <meshLambertMaterial color={cfg.color} transparent opacity={0.16} />
      </mesh>

      {/* Exchange temple */}
      <DistrictTemple color={cfg.color} isLocked={false} />

      {/* District label — hidden after t=12 */}
      <Html position={[0, 6, 0]} center distanceFactor={38} occlude={false}>
        <div ref={pillRef} style={{
          background: `${cfg.color}CC`, color: 'white',
          padding: '3px 9px', borderRadius: 7,
          fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          pointerEvents: 'none', border: `1px solid ${cfg.color}88`,
        }}>
          {cfg.icon} {cfg.label}
        </div>
      </Html>

      {/* Scripted portfolio buildings — each one staggers 0.25 s after the district's grow start */}
      {AD_BUILDING_PRESETS.map(([bx, bz, shade, houseH, skyscraperH], i) => (
        <group key={i} position={[bx, 0, bz]}>
          <AdAnimatedBuilding
            districtId={id}
            shade={shade}
            adTimeRef={adTimeRef}
            appearAt={appearAt + 0.15}
            growAt={DISTRICT_GROW_START[id] + i * 0.18}
            houseH={houseH}
            skyscraperH={skyscraperH}
            buildingIdx={i}
          />
        </group>
      ))}
    </group>
  )
}

// ── Main scene ────────────────────────────────────────────────────────────────
export default function CityScene({
  unlockedAreas, cash, portfolio = {}, currentYear = 2007,
  onAreaClick, onLibraryClick, onPortfolioClick, onMuseumClick,
  hovered, setHovered, showLabels = true, showDistrictLabels = false,
  assetManagerUnlocked = false, fireDrillBurning, fireDrillPhase, onStockSelect,
  placingMonument = null, placedMonuments = [], onMonumentPlaced,
  adMode = false,
}) {
  const PH = PLATFORM_HALF

  // Ad mode timing refs (updated each frame by AdClock, no React re-renders)
  const adTimeRef  = useRef(0)
  const adStartRef = useRef(null)
  useEffect(() => {
    if (adMode) { adStartRef.current = null; adTimeRef.current = 0 }
  }, [adMode])

  // Diversification score: fraction of districts that have at least one holding (0–1)
  const diversification = useMemo(() => {
    const districtsWithHoldings = Object.keys(DISTRICT_POSITIONS).filter(distId =>
      (DISTRICT_INSTRUMENTS[distId] || []).some(instId => (portfolio[instId]?.shares || 0) > 0)
    )
    return districtsWithHoldings.length / Object.keys(DISTRICT_POSITIONS).length
  }, [portfolio])

  return (
    <>
      <color attach="background" args={['#87CEEB']} />
      {/* Mountains behind city */}
      <MountainRange />

      {/* Lighting */}
      <ambientLight intensity={0.70} />
      <directionalLight
        position={[-22, 35, 18]} intensity={1.1} castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-far={180} shadow-camera-left={-58}
        shadow-camera-right={58} shadow-camera-top={58} shadow-camera-bottom={-58}
      />
      <hemisphereLight args={['#87CEEB', '#4E7E3E', 0.36]} />

      {/* Platform — rounded corners, no cliff edges */}
      <RoundedPlatform />

      {/* Harbour + water */}
      <Harbour />

      {/* ── Ad mode: scripted cinematic sequence ── */}
      {adMode ? (
        <>
          <AdClock adTimeRef={adTimeRef} adStartRef={adStartRef} />
          <CameraRig adTimeRef={adTimeRef} />
          <AdOrganicPaths adTimeRef={adTimeRef} />
          {TREE_POS.map((pos, i) => (
            <Tree key={i} position={pos} scale={0.9 + (i % 3) * 0.12} />
          ))}
          {AD_DISTRICT_ORDER.map(id => (
            <AdDistrict key={id} id={id} adTimeRef={adTimeRef} />
          ))}
          <AdMonuments adTimeRef={adTimeRef} />
          <AdFireworks adTimeRef={adTimeRef} />
          <AdReturnLabels adTimeRef={adTimeRef} />
          <PostFinanceHQ onClick={() => {}} onHover={() => {}} isHovered={false} showLabels={false} />
          <QuizAcademy   onClick={() => {}} onHover={() => {}} isHovered={false} showLabels={false} />
        </>
      ) : (
        <>
          {/* ── Normal game mode ── */}
          <OrganicPaths unlockedCount={unlockedAreas.length} />

          {TREE_POS.map((pos, i) => (
            <Tree key={i} position={pos} scale={0.9 + (i % 3) * 0.12} />
          ))}

          {ASSET_ORDER.map(id => (
            <Neighbourhood
              key={id}
              id={id}
              portfolio={portfolio}
              currentYear={currentYear}
              unlockedAreas={unlockedAreas}
              onClick={onAreaClick}
              onHover={setHovered}
              isHovered={hovered === id}
              showLabels={showLabels}
              showDistrictLabels={showDistrictLabels}
              diversification={diversification}
              fireDrillBurning={fireDrillBurning}
              fireDrillPhase={fireDrillPhase}
              onStockSelect={onStockSelect}
              isFinished={currentYear >= GAME_END_YEAR}
            />
          ))}

          <PostFinanceHQ
            onClick={onPortfolioClick}
            onHover={setHovered}
            isHovered={hovered === 'library'}
            showLabels={showLabels}
          />

          <QuizAcademy
            onClick={onLibraryClick}
            onHover={setHovered}
            isHovered={hovered === 'academy'}
            showLabels={showLabels}
          />

          <MuseumBuilding
            onClick={onMuseumClick}
            onHover={setHovered}
            isHovered={hovered === 'museum'}
            showLabels={showLabels}
          />

          <AssetManagerZone unlocked={assetManagerUnlocked} showLabels={showLabels} onClick={onLibraryClick} />

          {placedMonuments.map((m, i) => {
            if (!m) return null
            const [mx, my, mz] = m.pos
            return (
              <group key={i} position={[mx, my ?? 0, mz]} frustumCulled={false}>
                {m.type === 'eiffelTower' && <EiffelTower unlocked />}
                {m.type === 'bigBen' && <BigBen />}
                {m.type === 'yacht' && <Yacht />}
                {showLabels && (
                  <Html position={[0, 14, 0]} center distanceFactor={85}>
                    <div style={{
                      background: '#0f172aEE', color: '#FFD700',
                      padding: '3px 10px', borderRadius: 7, fontSize: 12,
                      fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none',
                      border: '1px solid #FFD70066',
                    }}>
                      {m.type === 'eiffelTower' ? '🗼 Eiffel Tower' : m.type === 'bigBen' ? '🕰️ Big Ben' : '⛵ Yacht'}
                    </div>
                  </Html>
                )}
              </group>
            )
          })}

          {placingMonument && (placingMonument === 'yacht' ? YACHT_SPOTS : MONUMENT_SPOTS).filter(s => !placedMonuments.some(m => m && JSON.stringify(m.pos) === JSON.stringify(s.pos))).map(spot => (
            <PlacementSpot
              key={spot.id}
              position={spot.pos}
              onPlace={(pos) => onMonumentPlaced?.(pos)}
            />
          ))}
        </>
      )}
    </>
  )
}
