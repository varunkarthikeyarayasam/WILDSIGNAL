import { Activity, Database, MapPin, Satellite, ShieldCheck } from 'lucide-react'
import type { ServiceStatus } from '../../lib/api'

const sources = [
  { icon: Satellite, title: 'NASA FIRMS', text: 'The Fire Information for Resource Management System distributes active fire and thermal anomaly observations from satellite instruments. Each record represents an observation at an overpass time; sensor attributes and confidence depend on the source.' },
  { icon: MapPin, title: 'OpenStreetMap', text: 'Mapped facilities and geographic features provide context. Coverage and tagging vary by place, and an unmapped facility may still exist. OSM proximity alone is never evidence of industrial origin.' },
  { icon: Activity, title: 'Recurrence over time', text: 'A recurring source means multiple detections across separate observed overpasses during a stated period. Clouds, orbital timing, sensor sensitivity and gaps mean recurrence does not prove continuous activity.' },
  { icon: ShieldCheck, title: 'Classification and uncertainty', text: 'Source category is an evidence-based interpretation, distinct from the satellite’s own confidence attribute and from activity status. Sparse or ambiguous evidence should remain uncertain.' },
]

export function AboutData({ status }: { status: ServiceStatus | null }) {
  const firms = status?.sources.firms
  const osm = status?.sources.osm
  return <div className="about-layout"><section className="about-intro panel"><div className="section-kicker">METHODOLOGY & PROVENANCE</div><h2>Every signal has a source.<br /><em>Every conclusion has limits.</em></h2><p>WILDSIGNAL keeps satellite measurements, mapped context and interpretation separate. Data below reflects the current backend state; no fallback or illustrative observations are bundled.</p><span className="method-note"><Database size={15} /> API {status ? 'connected' : 'unavailable'} · FIRMS {firms?.status || 'not fetched'} ({firms?.record_count ?? 0} stored) · OSM {osm?.status || 'not fetched'} ({osm?.record_count ?? 0} mapped features)</span></section><div className="source-grid">{sources.map(({ icon: Icon, title, text }, index) => <article className="panel source-card" key={title}><span className="source-index">0{index + 1}</span><div className="source-icon"><Icon size={18} /></div><h3>{title}</h3><p>{text}</p></article>)}</div><section className="provenance-strip"><span><Database size={15} /> SOURCE RECORDS</span><p>Observation time, satellite and instrument, source feed, provider confidence attributes and retrieval time are retained with records. Historic observations are labeled as stored acquisitions; retrieval time is distinct from acquisition time.</p></section></div>
}
