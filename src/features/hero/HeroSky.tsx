/* Decorative SVG layers for the hero. Everything is aria-hidden and purely atmospheric. */

type Orbit = { rx: number; ry: number; rot: number; tone: 'lilac' | 'lichen'; dash?: string }
const ORBITS: Orbit[] = [
  { rx: 97, ry: 26, rot: -22, tone: 'lilac' },
  { rx: 87, ry: 41, rot: 31, tone: 'lichen', dash: '1.2 5' },
  { rx: 99, ry: 58, rot: -64, tone: 'lilac', dash: '0.6 4' },
]
const upper = (o: Orbit) => `M ${-o.rx} 0 A ${o.rx} ${o.ry} 0 0 1 ${o.rx} 0`
const lower = (o: Orbit) => `M ${o.rx} 0 A ${o.rx} ${o.ry} 0 0 1 ${-o.rx} 0`

/** Orbital arcs around the planet. The back arcs sit behind the planet, the front arcs sweep across it. */
export function OrbitArcs({ side }: { side: 'back' | 'front' }) {
  return <svg className={`ws-hero__orbits ws-hero__orbits--${side}`} viewBox="-100 -100 200 200" fill="none" aria-hidden="true" focusable="false">
    {ORBITS.map((orbit) => <g key={`${orbit.rx}-${orbit.rot}`} transform={`rotate(${orbit.rot})`} className={`ws-orbit ws-orbit--${orbit.tone}`}>
      <path d={side === 'back' ? upper(orbit) : lower(orbit)} strokeDasharray={orbit.dash} vectorEffect="non-scaling-stroke" />
      {side === 'front' && <><circle cx={-orbit.rx} cy="0" r="1.15" className="ws-orbit__node" /><circle cx={orbit.rx} cy="0" r="0.8" className="ws-orbit__node ws-orbit__node--b" /></>}
    </g>)}
  </svg>
}

const FILAMENTS = [
  'M -62 -30 C -96 -52 -88 -88 -40 -97',
  'M 61 -38 C 99 -62 98 -22 80 8',
  'M -70 20 C -108 30 -104 70 -60 92',
  'M 40 66 C 88 72 106 22 93 -26',
  'M -22 -72 C 8 -118 72 -104 97 -60',
  'M 10 74 C 42 108 -20 112 -46 86',
]

/** Fine acid-lichen filaments leaving the planet's limb, with light travelling along them. */
export function Filaments() {
  return <svg className="ws-hero__filaments" viewBox="-100 -100 200 200" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="ws-fil" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#B7C65B" stopOpacity="0" />
        <stop offset="0.5" stopColor="#B7C65B" stopOpacity="0.85" />
        <stop offset="1" stopColor="#D8B6D5" stopOpacity="0" />
      </linearGradient>
    </defs>
    {FILAMENTS.map((d, i) => <g key={d}>
      <path d={d} className="ws-fil__trace" vectorEffect="non-scaling-stroke" />
      <path d={d} pathLength={100} className="ws-fil__flow" style={{ animationDelay: `${-i * 2.7}s` }} vectorEffect="non-scaling-stroke" />
    </g>)}
  </svg>
}

// Deterministic star field (no randomness at render time, so it never shifts between renders).
const STARS = (() => {
  let seed = 7
  const next = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  return Array.from({ length: 46 }, (_, i) => ({ x: next() * 1600, y: next() * 1000, r: 0.5 + next() * 1.15, o: 0.16 + next() * 0.5, tone: i % 7 === 0 ? 'lichen' : i % 5 === 0 ? 'lilac' : 'bone', twinkle: i % 6 === 0 }))
})()

export function Particles() {
  return <svg className="ws-hero__particles" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <g className="ws-particles__drift">
      {STARS.map((s, i) => <circle key={i} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={s.r.toFixed(2)} opacity={s.o.toFixed(2)} className={`ws-star ws-star--${s.tone}${s.twinkle ? ' ws-star--twinkle' : ''}`} style={s.twinkle ? { animationDelay: `${-(i % 9)}s` } : undefined} />)}
    </g>
  </svg>
}

/**
 * Static, still-dimensional planet used before WebGL is ready, when WebGL is unavailable, or if the shader fails.
 * Layered gradients give lighting and a silhouette; the SVG adds contour and filament linework.
 */
export function FallbackPlanet() {
  return <div className="ws-hero__fallback" aria-hidden="true">
    <svg viewBox="-100 -100 200 200" fill="none" focusable="false">
      <defs><clipPath id="ws-fb-clip"><circle r="100" /></clipPath></defs>
      <g clipPath="url(#ws-fb-clip)" strokeLinecap="round">
        <g stroke="#D8B6D5" strokeOpacity="0.2" strokeWidth="0.7">
          <path d="M -100 -52 C -60 -70 -20 -30 20 -48 S 80 -70 100 -40" />
          <path d="M -100 -26 C -54 -44 -16 -4 26 -22 S 84 -44 100 -16" />
          <path d="M -100 0 C -52 -18 -12 22 30 4 S 86 -18 100 10" />
          <path d="M -100 26 C -50 8 -10 48 34 30 S 90 8 100 36" />
          <path d="M -100 52 C -48 34 -8 74 38 56 S 92 34 100 62" />
        </g>
        <g stroke="#B7C65B" strokeOpacity="0.5" strokeWidth="0.9">
          <path d="M -80 -30 C -48 -50 -30 -10 -4 -30 S 40 -20 58 -52" />
          <path d="M -60 40 C -30 20 -4 56 26 36 S 66 30 84 8" />
          <path d="M -20 -78 C -4 -50 -26 -34 -14 -8" />
        </g>
        <g fill="#E76B4A"><circle cx="-34" cy="12" r="1.7" /><circle cx="28" cy="-36" r="1.4" /><circle cx="46" cy="30" r="1.5" /></g>
      </g>
    </svg>
  </div>
}
