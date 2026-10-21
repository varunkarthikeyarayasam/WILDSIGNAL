import { Activity, Database, MapPin, Satellite, ShieldCheck, AlertTriangle } from 'lucide-react'
import type { ServiceStatus } from '../../lib/api'

export function AboutData({ status }: { status: ServiceStatus | null }) {
  const firms = status?.sources.firms
  const osm = status?.sources.osm

  return <div className="about-editorial">
    {/* Editorial intro — full width */}
    <section className="about-intro panel">
      <div className="section-kicker">METHODOLOGY & PROVENANCE</div>
      <h2>Every signal has a source.<br /><em>Every conclusion has limits.</em></h2>
      <p>WILDSIGNAL keeps satellite measurements, mapped context and interpretation separate. What follows reflects the current backend state — no fallback or illustrative observations are bundled.</p>
      <div className="about-status-row">
        <span className="method-note"><Database size={15} /> API {status ? 'connected' : 'unavailable'}</span>
        <span className="method-note">FIRMS {firms?.status || 'not fetched'} ({firms?.record_count ?? 0} stored)</span>
        <span className="method-note">OSM {osm?.status || 'not fetched'} ({osm?.record_count ?? 0} mapped features)</span>
      </div>
    </section>

    {/* Section 01 — asymmetric: large text left, visual stat right */}
    <div className="about-section about-section--01">
      <div className="about-section-text">
        <span className="about-section-number">01</span>
        <div className="about-section-icon coral"><Satellite size={20} /></div>
        <h3>NASA FIRMS <em>— observed thermal anomalies</em></h3>
        <p>The Fire Information for Resource Management System distributes active fire and thermal anomaly observations from satellite instruments. Each record represents a single observation at an overpass time — not a continuous measurement. Sensor attributes and confidence depend on the instrument, the scan angle, and atmospheric conditions at the moment of acquisition.</p>
        <p className="about-subtext">VIIRS instruments on NOAA-20, NOAA-21, and Suomi-NPP provide the near-real-time feeds used here. Each detection includes brightness temperatures (T4, T5), fire radiative power, and a provider-assigned confidence value.</p>
      </div>
      <div className="about-section-aside">
        <div className="about-stat-block">
          <span className="metric-label">FIRMS STATUS</span>
          <strong>{firms?.status || 'not fetched'}</strong>
          <small>{firms?.record_count ?? 0} stored records</small>
          {firms?.retrieved_at && <small className="about-stat-time">Retrieved {firms.retrieved_at}</small>}
          {firms?.message && <small className="about-stat-warn">{firms.message}</small>}
        </div>
      </div>
    </div>

    {/* Section 02 — reversed asymmetry */}
    <div className="about-section about-section--02">
      <div className="about-section-aside">
        <div className="about-stat-block lilac">
          <span className="metric-label">OSM STATUS</span>
          <strong>{osm?.status || 'not fetched'}</strong>
          <small>{osm?.record_count ?? 0} mapped features</small>
          {osm?.message && <small className="about-stat-warn">{osm.message}</small>}
        </div>
      </div>
      <div className="about-section-text">
        <span className="about-section-number">02</span>
        <div className="about-section-icon lilac"><MapPin size={20} /></div>
        <h3>OpenStreetMap <em>— geographic context, not attribution</em></h3>
        <p>Mapped facilities and geographic features provide context for interpreting where thermal anomalies occur. Coverage and tagging vary by place — a facility absent from OSM may still exist, and a mapped feature's tags may be incomplete or outdated.</p>
        <p className="about-subtext">Proximity to an OSM feature does not confirm industrial origin. The mapped context narrows the search space; it does not by itself identify a source.</p>
      </div>
    </div>

    {/* Section 03 — full width with diagram */}
    <div className="about-section about-section--03">
      <div className="about-section-text">
        <span className="about-section-number">03</span>
        <div className="about-section-icon teal"><Activity size={20} /></div>
        <h3>Recurrence over time <em>— repeated ≠ continuous</em></h3>
        <p>A recurring source means multiple detections across separate observed overpasses during a stated period. Clouds, orbital timing, sensor sensitivity and gaps mean recurrence does not prove continuous activity. An empty day in the record does not imply no thermal activity occurred — only that no overpass detected any.</p>
      </div>
      <div className="about-diagram">
        <div className="about-diagram-track">
          <div className="about-diagram-node"><span>Day 1</span><i className="coral" /></div>
          <div className="about-diagram-gap"><span>unobserved</span></div>
          <div className="about-diagram-node"><span>Day 3</span><i className="coral" /></div>
          <div className="about-diagram-gap"><span>unobserved</span></div>
          <div className="about-diagram-node"><span>Day 7</span><i className="coral" /></div>
        </div>
        <small>Each coral marker is one satellite overpass detection. Gaps are unobserved periods, not evidence of absence.</small>
      </div>
    </div>

    {/* Section 04 — full width, cautionary */}
    <div className="about-section about-section--04">
      <div className="about-section-text">
        <span className="about-section-number">04</span>
        <div className="about-section-icon amber"><ShieldCheck size={20} /></div>
        <h3>Classification & uncertainty <em>— interpretation with boundaries</em></h3>
        <p>Source category is an evidence-based interpretation, distinct from the satellite's own confidence attribute and from activity status. Sparse or ambiguous evidence should remain uncertain. A thermal anomaly classified as an "industrial-associated candidate" is not a finding of industrial fire — it is a flag for further investigation.</p>
      </div>
      <div className="about-caution">
        <AlertTriangle size={22} />
        <div>
          <b>What this data cannot prove</b>
          <ul>
            <li>The cause of a thermal anomaly</li>
            <li>Continuous activity between overpasses</li>
            <li>Industrial origin from OSM proximity alone</li>
            <li>Absence of fire on days with no detection</li>
          </ul>
        </div>
      </div>
    </div>

    {/* Provenance strip — retained fields */}
    <section className="provenance-strip">
      <span><Database size={15} /> SOURCE RECORDS</span>
      <p>Observation time, satellite and instrument, source feed, provider confidence attributes and retrieval time are retained with records. Historic observations are labeled as stored acquisitions; retrieval time is distinct from acquisition time.</p>
    </section>
  </div>
}
