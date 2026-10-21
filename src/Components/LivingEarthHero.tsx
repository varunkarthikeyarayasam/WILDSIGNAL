
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
import './LivingEarthHero.css'

type LivingEarthHeroProps = {
  onExplore: () => void
}

export function LivingEarthHero({ onExplore }: LivingEarthHeroProps) {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return (
    <section
      className={`living-hero ${reducedMotion ? 'motion-reduced' : ''}`}
      aria-labelledby="living-hero-title"
    >
      <div className="living-hero__grain" aria-hidden="true" />
      <div className="living-hero__vignette" aria-hidden="true" />

      <div className="living-hero__topbar">
        <a className="living-hero__brand" href="#wildsignal-home" aria-label="WILDSIGNAL home">
          <span className="living-hero__brand-mark">W</span>
          <span>WILDSIGNAL<span className="living-hero__brand-dot">.</span></span>
        </a>
        <span className="living-hero__edition">
          <span className="living-hero__status-dot" />
          EARTH INTELLIGENCE / 001
        </span>
      </div>

      <div className="living-hero__world" aria-hidden="true">
        <div className="living-hero__orbit living-hero__orbit--one" />
        <div className="living-hero__orbit living-hero__orbit--two" />
        <div className="living-hero__orbit living-hero__orbit--three" />

        <div className="living-hero__planet">
          <div className="living-hero__planet-core" />
          <div className="living-hero__terrain living-hero__terrain--one" />
          <div className="living-hero__terrain living-hero__terrain--two" />
          <div className="living-hero__terrain living-hero__terrain--three" />
          <div className="living-hero__planet-shade" />
          <div className="living-hero__atmosphere" />

          <svg className="living-hero__filaments" viewBox="0 0 600 600" fill="none">
            <path d="M-40 330 C90 110 180 470 310 250 S500 80 650 190" />
            <path d="M-30 390 C100 200 210 520 340 300 S500 180 630 260" />
            <path d="M30 150 C150 310 240 40 360 200 S480 440 610 390" />
            <path d="M0 460 C150 320 240 580 390 410 S520 310 630 450" />
          </svg>

          <span className="living-hero__signal living-hero__signal--one" />
          <span className="living-hero__signal living-hero__signal--two" />
          <span className="living-hero__signal living-hero__signal--three" />
          <span className="living-hero__signal living-hero__signal--four" />
        </div>

        <div className="living-hero__particle living-hero__particle--one" />
        <div className="living-hero__particle living-hero__particle--two" />
        <div className="living-hero__particle living-hero__particle--three" />
        <div className="living-hero__particle living-hero__particle--four" />
        <div className="living-hero__particle living-hero__particle--five" />

        <div className="living-hero__coordinate living-hero__coordinate--left">
          <span>PLANETARY SYSTEM</span>
          <strong>01 / ATMOSPHERE</strong>
        </div>
        <div className="living-hero__coordinate living-hero__coordinate--right">
          <span>OBSERVATION MODE</span>
          <strong>THERMAL / GEO</strong>
        </div>
      </div>

      <div className="living-hero__content">
        <p className="living-hero__eyebrow">
          <span /> A DIFFERENT WAY TO SEE OUR PLANET
        </p>

        <h1 id="living-hero-title" className="living-hero__title">
          See the signal.
          <br />
          <span>Understand the source.</span>
        </h1>

        <p className="living-hero__description">
          Satellite observations. Geospatial context. A clearer picture of
          Earth's thermal activity — without pretending uncertainty is certainty.
        </p>

        <button
          className="living-hero__explore"
          onClick={onExplore}
          type="button"
        >
          <span>Enter the investigation</span>
          <ArrowUpRight size={18} strokeWidth={1.7} />
        </button>

        <div className="living-hero__footnote">
          <span>OBSERVE</span>
          <i />
          <span>CONTEXTUALIZE</span>
          <i />
          <span>INVESTIGATE</span>
        </div>
      </div>

      <button
        className="living-hero__scroll"
        onClick={onExplore}
        type="button"
        aria-label="Explore the dashboard"
      >
        <span>SCROLL TO EXPLORE</span>
        <ArrowDown size={15} />
      </button>

      <div className="living-hero__index" aria-hidden="true">
        <span>W / 001</span>
        <span>THE LIVING EARTH</span>
      </div>
    </section>
  )
}
