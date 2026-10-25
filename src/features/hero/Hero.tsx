import { lazy, Suspense, useCallback, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'
import { LivingEarth } from './LivingEarth'
import { FallbackPlanet, Filaments, OrbitArcs, Particles } from './HeroSky'
import { useHeroParallax, useReducedMotion, useTabVisible } from './useHeroMotion'
import './hero.css'

// Three.js is only fetched after first paint; the static planet is already on screen while it loads.
const EarthScene = lazy(() => import('./EarthScene'))

type Props = {
  /** `hero`: waiting for the visitor. `transitioning`: the entrance is playing on its own clock. */
  phase: 'hero' | 'transitioning'
  /** Starts the entrance. `instant` skips the animation (used by the skip control). */
  onEnter: (options?: { instant?: boolean }) => void
}

const WORDMARK = 'WILDSIGNAL'.split('')

/**
 * The opening scene. It is a fixed, full-viewport overlay that exists only until the visitor activates the Enter
 * button. Activation starts a time-based entrance (CSS, ~2.4 s) in which the Earth recedes and the dashboard layers
 * emerge underneath; scrolling plays no part in it.
 */
export function Hero({ phase, onEnter }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const tabVisible = useTabVisible()
  useHeroParallax(stage, !reduced && phase === 'hero')
  // Renderer chain: Three.js Earth, then the procedural WebGL planet, then the static CSS/SVG planet.
  const [engine, setEngine] = useState<'three' | 'procedural' | 'static'>('three')
  const [live, setLive] = useState(false)
  const handleLive = useCallback(() => setLive(true), [])
  const handleThreeFail = useCallback(() => { setLive(false); setEngine('procedural') }, [])
  const handleProceduralFail = useCallback(() => { setLive(false); setEngine('static') }, [])
  const active = tabVisible

  const stageClass = ['ws-hero__stage', active ? '' : 'is-paused', live ? 'is-live' : ''].filter(Boolean).join(' ')

  return <section className={phase === 'transitioning' ? 'ws-hero is-entering' : 'ws-hero'} aria-label="WILDSIGNAL introduction" aria-busy={phase === 'transitioning'}>
    <div className={stageClass} ref={stage}>
      <div className="ws-hero__void" aria-hidden="true" />
      <Particles />
      <div className="ws-hero__planetbox" aria-hidden="true">
        <div className="ws-hero__enter">
          <div className="ws-hero__move">
            <div className="ws-hero__haze" />
            <OrbitArcs side="back" />
            <Filaments />
            <FallbackPlanet />
            {engine === 'three' && <Suspense fallback={null}><EarthScene active={active} reduced={reduced} onLive={handleLive} onFail={handleThreeFail} /></Suspense>}
            {engine === 'procedural' && <LivingEarth active={active} reduced={reduced} onLive={handleLive} onFail={handleProceduralFail} />}
            <OrbitArcs side="front" />
          </div>
        </div>
      </div>
      <div className="ws-hero__flare" aria-hidden="true" />
      <div className="ws-hero__grain" aria-hidden="true" />
      <div className="ws-hero__vignette" aria-hidden="true" />
      <div className="ws-hero__fade" aria-hidden="true" />

      <header className="ws-hero__top">
        <span className="ws-hero__kicker">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="12.5" stroke="#D8B6D5" strokeOpacity=".55" /><ellipse cx="16" cy="16" rx="14.5" ry="5.2" transform="rotate(-32 16 16)" stroke="#B7C65B" strokeWidth="1.3" /><circle cx="21.6" cy="10.6" r="2.3" fill="#E76B4A" /></svg>
          Satellite thermal intelligence
        </span>
        <span className="ws-hero__place">Manali–Ennore · North Chennai</span>
        <button type="button" className="ws-hero__skip" onClick={() => onEnter({ instant: true })} disabled={phase !== 'hero'}>Skip intro</button>
      </header>

      <div className="ws-hero__copy">
        <p className="ws-hero__wordmark" aria-label="WILDSIGNAL">
          {WORDMARK.map((letter, index) => <span key={index} className="ws-hero__letter" style={{ '--i': index } as CSSProperties} aria-hidden="true">{letter}</span>)}
        </p>
        <div className="ws-hero__row">
          <h2 className="ws-hero__headline" id="ws-hero-title">See the signal.<br />Understand the source.</h2>
          <div className="ws-hero__aside">
            <p className="ws-hero__support">WILDSIGNAL helps you investigate satellite thermal observations and the mapped facilities around them across the Manali–Ennore industrial belt. A detection shows where heat was seen, not what caused it.</p>
            <button type="button" className="ws-hero__cta" onClick={() => onEnter()} disabled={phase !== 'hero'}><span>Enter WILDSIGNAL</span><ArrowRight size={17} aria-hidden="true" /></button>
          </div>
        </div>
      </div>

    </div>
  </section>
}
