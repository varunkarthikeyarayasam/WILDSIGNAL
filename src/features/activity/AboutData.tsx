import { Activity, Clock3, Database, MapPin, Satellite, ShieldCheck } from 'lucide-react'
import type { ServiceStatus } from '../../lib/api'
import { describeSource } from '../../lib/sourceStatus'

const sources = [
  { icon: Satellite, title: 'NASA FIRMS', text: 'The Fire Information for Resource Management System distributes active fire and thermal anomaly observations from satellite instruments. Each record represents an observation at an overpass time; sensor attributes and confidence depend on the source. A detection is evidence of observed heat, not proof of what produced it.' },
  { icon: MapPin, title: 'OpenStreetMap', text: 'Mapped facilities and geographic features provide context. Coverage and tagging vary by place, and an unmapped facility may still exist. OSM proximity alone is never evidence of industrial origin, and proximity between an observation and a facility does not establish that the facility caused it.' },
  { icon: Database, title: 'Facility data and fallbacks', text: 'Facility records are loaded through the backend. When the live provider cannot be reached, the app shows only the records already stored and reports the source as unavailable. A bundled snapshot, wherever a deployment provides one, is a fallback and not a continuously refreshed source; it is labelled as such in the source status below, never as live.' },
  { icon: Activity, title: 'Recurrence over time', text: 'A recurring source means multiple detections across separate observed overpasses during a stated period. Clouds, orbital timing, sensor sensitivity and gaps mean recurrence does not prove continuous activity.' },
  { icon: Clock3, title: 'Observation time and retrieval time', text: 'Every record carries the time the satellite observed it and, separately, the time WILDSIGNAL retrieved it. Activity History groups records by acquisition date; retrieval time describes data freshness and is never used as an observation date.' },
  { icon: ShieldCheck, title: 'Classification and uncertainty', text: 'Source category is an evidence-based interpretation, distinct from the satellite’s own confidence attribute and from activity status. Sparse or ambiguous evidence should remain uncertain, and an empty result is not evidence that nothing burned.' },
]

export function AboutData({ status }: { status: ServiceStatus | null }) {
  const rows = [
    { name: 'NASA FIRMS', kind: 'Thermal observations', summary: describeSource(status?.sources.firms) },
    { name: 'OpenStreetMap', kind: 'Geographic context', summary: describeSource(status?.sources.osm) },
  ]
  return <div className="about-layout">
    <section className="about-intro">
      <div className="section-kicker">Methodology & provenance</div>
      <h2>Every signal has a source.<br /><em>Every conclusion has limits.</em></h2>
      <p>WILDSIGNAL keeps satellite measurements, mapped context and interpretation separate. No fallback or illustrative observations are bundled; everything below reflects the current backend state.</p>
      <div className="state-list" aria-label="Current backend state">
        <p className={status ? 'state-api is-ok' : 'state-api is-down'}><i /> API {status ? 'connected' : 'unavailable'}</p>
        {rows.map(({ name, kind, summary }) => <div className={`state-row tone-${summary.tone}`} key={name}>
          <i /><div><b>{name}</b><small>{kind}</small></div><em>{summary.label}</em><p>{summary.detail}</p>
        </div>)}
      </div>
    </section>
    <div className="source-grid">{sources.map(({ icon: Icon, title, text }, index) => <article className="source-card" key={title}><span className="source-index">0{index + 1}</span><div className="source-icon"><Icon size={18} /></div><h3>{title}</h3><p>{text}</p></article>)}</div>
    <section className="provenance-strip"><span><Database size={15} /> Source records</span><p>Observation time, satellite and instrument, source feed, provider confidence attributes and retrieval time are retained with records. Historic observations are labelled as stored acquisitions; retrieval time is distinct from acquisition time.</p></section>
  </div>
}
