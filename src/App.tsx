import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, ArrowUpRight, CalendarDays, ChevronDown, CircleHelp, Clock3, Database, Download, Flame, Layers as Layers3, LocateFixed, Map as MapIcon, Menu, Minus, Play, Plus, Radio, RefreshCw, Satellite, Search, ShieldCheck, SlidersHorizontal, Waves, X } from 'lucide-react'
import { AboutData } from './features/activity/AboutData'
import { getFacilities, getHistory, getObservations, getStatus, refreshData, type Facility, type Filters, type History, type Observation, type ObservationPage, type ServiceStatus } from './lib/api'
import './styles.css'
import { LivingEarthHero } from './Components/LivingEarthHero'

const MapView = lazy(() => import('./features/investigation/MapView').then((module) => ({ default: module.MapView })))
type Page = 'Overview' | 'Investigation' | 'Activity History' | 'About the Data'
const navItems: { label: Page; icon: typeof MapIcon }[] = [
  { label: 'Overview', icon: Layers3 }, { label: 'Investigation', icon: MapIcon },
  { label: 'Activity History', icon: Activity }, { label: 'About the Data', icon: CircleHelp },
]
const emptyFilters: Filters = { from: '', to: '', satellite: 'any', category: 'any', activity: 'any', confidence: 'any' }
const categoryLabels: Record<string, string> = { industrial_associated_candidate: 'Industrial associated candidate', vegetation_agricultural_candidate: 'Vegetation / agricultural candidate', other_uncertain: 'Other / uncertain' }
const activityLabels: Record<string, string> = { recurring_across_observations: 'Recurring across observations', insufficient_historical_evidence: 'Insufficient historical evidence' }

function App() {
  const [intro, setIntro] = useState(true)
  const [introExiting, setIntroExiting] = useState(false)
  useEffect(() => {
    if (!intro) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dismissOnEscape = () => setIntro(false)
    window.addEventListener('keydown', dismissOnEscape)
    return () => {
      window.removeEventListener('keydown', dismissOnEscape)
      document.body.style.overflow = previousOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro])
  const dismissIntro = () => {
    if (introExiting) return
    setIntroExiting(true)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const complete = () => {
      setIntro(false)
      setIntroExiting(false)
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.getElementById('wildsignal-dashboard')?.scrollIntoView({
            behavior: reduced ? 'auto' : 'smooth',
            block: 'start',
          })
        })
      })
    }
    if (reduced) { complete(); return }
    window.setTimeout(complete, 480)
  }
  const [page, setPage] = useState<Page>('Overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [observations, setObservations] = useState<Observation[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [observationPage, setObservationPage] = useState<ObservationPage | null>(null)
  const [status, setStatus] = useState<ServiceStatus | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [showObservations, setShowObservations] = useState(true)
  const [showFacilities, setShowFacilities] = useState(true)
  const [layer, setLayer] = useState<'streets' | 'satellite'>('streets')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const update = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }))

  const loadWorkspace = useCallback(async (selectedFilters: Filters = emptyFilters) => {
    setLoading(true); setError('')
    const results = await Promise.allSettled([getStatus(), getObservations(selectedFilters), getFacilities()])
    const [statusResult, observationResult, facilityResult] = results
    if (statusResult.status === 'fulfilled') setStatus(statusResult.value)
    else setError(statusResult.reason instanceof Error ? statusResult.reason.message : 'Could not reach the WILDSIGNAL API.')
    if (observationResult.status === 'fulfilled') {
      setObservationPage(observationResult.value); setObservations(observationResult.value.observations)
      setSelectedId((current) => observationResult.value.observations.some((item) => item.id === current) ? current : null)
    }
    if (facilityResult.status === 'fulfilled') setFacilities(facilityResult.value)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    Promise.allSettled([getStatus(), getObservations(emptyFilters), getFacilities()]).then((results) => {
      if (!active) return
      const [statusResult, observationResult, facilityResult] = results
      if (statusResult.status === 'fulfilled') setStatus(statusResult.value)
      else setError(statusResult.reason instanceof Error ? statusResult.reason.message : 'Could not reach the WILDSIGNAL API.')
      if (observationResult.status === 'fulfilled') { setObservationPage(observationResult.value); setObservations(observationResult.value.observations) }
      if (facilityResult.status === 'fulfilled') setFacilities(facilityResult.value)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (page !== 'Activity History') return
    let active = true
    getHistory().then((value) => { if (active) setHistory(value) }).catch((cause: unknown) => { if (active) setHistoryError(cause instanceof Error ? cause.message : 'History is unavailable.') }).finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [page])

  const visibleObservations = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    if (!query) return observations
    return observations.filter((item) => [item.id, item.satellite, item.source, item.latitude.toFixed(5), item.longitude.toFixed(5)].some((value) => String(value || '').toLowerCase().includes(query)))
  }, [observations, searchText])
  const selected = visibleObservations.find((item) => item.id === selectedId) || null
  const available = observations.length > 0
  const industrialCount = observations.filter((item) => item.source_assessment.category === 'industrial_associated_candidate').length
  const recurringCount = observations.filter((item) => item.temporal_assessment.status === 'recurring_across_observations').length
  const latest = useMemo(() => [...observations].sort((a, b) => b.acquired_at.localeCompare(a.acquired_at))[0], [observations])
  const dataRetrieved = status?.sources.firms.status === 'available' ? status.sources.firms.retrieved_at : latest?.retrieved_at || null
  const freshness = dataRetrieved ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(dataRetrieved)) + ' UTC' : 'Unavailable'

  const applyFilters = async () => { await loadWorkspace(filters) }
  const syncSources = async () => {
    setRefreshing(true); setNotice(''); setError('')
    try {
      const result = await refreshData()
      await loadWorkspace(filters)
      const unavailable = Object.entries(result.sources).filter(([, source]) => !['available', 'cached'].includes(source.status)).map(([name, source]) => `${name.toUpperCase()}: ${source.message || source.status}`)
      setNotice(unavailable.length ? unavailable.join(' · ') : 'Source refresh completed; records are loaded from the local cache.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Refresh failed.') }
    finally { setRefreshing(false) }
  }
  const exportCsv = () => {
    if (!observations.length) { setNotice('There are no loaded records to export.'); return }
    const columns = ['id', 'latitude', 'longitude', 'acquired_at', 'satellite', 'instrument', 'source', 'confidence', 'bright_ti4', 'bright_ti5', 'frp', 'daynight'] as const
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csv = [columns.join(','), ...observations.map((record) => columns.map((column) => escape(record[column])).join(','))].join('\r\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'wildsignal-observations.csv'; link.click(); URL.revokeObjectURL(link.href)
  }
  const resetFilters = () => { setFilters(emptyFilters); void loadWorkspace(emptyFilters) }

  return <div className={`app-shell ${introExiting ? 'dashboard-entering' : ''}`}>
    {intro && <LivingEarthHero onExplore={dismissIntro} exiting={introExiting} />}
    <header className="topbar">
      <button className="brand" aria-label="WILDSIGNAL home" onClick={() => setPage('Overview')}><span className="brand-mark"><span /><span /><span /></span><span className="brand-copy"><b>WILDSIGNAL</b><small>EARTH OBSERVATION INTELLIGENCE</small></span></button>
      <nav className={mobileNav ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} className={page === label ? 'nav-link active' : 'nav-link'} onClick={() => { if (label === 'Activity History' && page !== label) { setHistoryLoading(true); setHistoryError('') } setPage(label); setMobileNav(false) }}><Icon size={16} />{label}</button>)}</nav>
      <div className="topbar-right"><span className={`status-pill ${status ? 'connected' : 'disconnected'}`}><i />{status ? 'API connected' : 'API unavailable'}</span><button className="replay-intro" aria-label="Replay introduction" title="Replay introduction" onClick={() => {
  window.scrollTo({ top: 0, behavior: 'auto' })
  setIntro(true)
}}><Play size={14}/><span>Intro</span></button><button className="mobile-menu" aria-label={mobileNav ? 'Close navigation' : 'Open navigation'} onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? <X /> : <Menu />}</button><span className="user-badge" aria-label="WILDSIGNAL workspace">W</span></div>
    </header>
    <main id="wildsignal-dashboard">
      <section className="page-heading"><div className="heading-copy"><div className="eyebrow"><span className="eyebrow-line" /> SATELLITE THERMAL INTELLIGENCE <span className="heading-dot">/</span> NORTH CHENNAI, INDIA</div><h1>{page === 'Overview' ? <>See the signal.<br /><em>Understand the source.</em></> : page}</h1><p>{page === 'About the Data' ? 'Sources, coverage, interpretation and limits.' : page === 'Activity History' ? 'Observed recurrence across stored satellite detections.' : 'Investigate thermal observations with their geographic and temporal context.'}</p></div>
        <div className="heading-actions"><span className="date-chip"><CalendarDays size={15} />{observationPage ? `${observationPage.period.start} — ${observationPage.period.end}` : 'Observation window unavailable'}</span><button className="button button-dark" onClick={exportCsv}><Download size={15} /> Export CSV</button><button className="button button-refresh" onClick={() => void syncSources()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />{refreshing ? 'Refreshing' : 'Refresh data'}</button></div>
      </section>
      {page === 'About the Data' ? <AboutData status={status} /> : page === 'Activity History' ? <ActivityView history={history} loading={historyLoading} error={historyError} onAbout={() => setPage('About the Data')} /> : <>
        <section className="status-banner"><div className="status-icon"><Radio size={18} /></div><div><b>{status ? status.region : 'Waiting for the WILDSIGNAL API'}</b><p>{available ? `Showing ${observationPage?.total} stored observations · loaded from the local database` : error || 'No observation records are currently loaded in the selected window.'}</p></div><div className="source-tags"><SourceBadge name="FIRMS" source={status?.sources.firms} /><SourceBadge name="OSM" source={status?.sources.osm} /></div><button aria-label="About data sources" className="banner-help" onClick={() => setPage('About the Data')}><CircleHelp size={17} /></button></section>
        {error && <div className="api-error" role="alert"><span><b>Data service unavailable</b>{error}</span><button onClick={() => void loadWorkspace(filters)}>Retry connection</button></div>}
        <div className="workspace-grid">
          <section className="map-card"><div className="map-header"><div><div className="section-kicker">REGIONAL INVESTIGATION</div><h2>Manali–Ennore industrial belt</h2><p>13.16° N, 80.27° E <span>·</span> Tamil Nadu, India <span>·</span> {facilities.length.toLocaleString()} mapped context features</p></div><div className="map-header-actions"><span className="map-status"><i />{loading ? 'Loading records' : `${observations.length} in view`}</span><button className="icon-button" title="Switch basemap style" aria-label="Switch basemap style" onClick={() => setLayer(layer === 'streets' ? 'satellite' : 'streets')}><Layers3 size={17} /></button><button className="icon-button" title="Recenter map" aria-label="Recenter map" onClick={() => window.dispatchEvent(new Event('wildsignal:recenter'))}><LocateFixed size={17} /></button></div></div>
            <div className={refreshing ? 'map-body is-refreshing' : 'map-body'} aria-busy={refreshing}><Suspense fallback={<div className="map-loading">Preparing regional map…</div>}><MapView layer={layer} observations={visibleObservations} facilities={facilities} selectedId={selectedId} showObservations={showObservations} showFacilities={showFacilities} onSelect={(item) => {
  setSelectedFacility(null)
  setSelectedId(item?.id || null)
}}
onFacilitySelect={(facility) => {
  setSelectedFacility(facility)
  setSelectedId(null)
}} /></Suspense><div className="map-legend"><div className="legend-title">MAP KEY</div><div><span className="legend-symbol observation-symbol" />Thermal observations <b>{visibleObservations.length}</b></div><div><span className="legend-symbol facility-symbol" />OSM geographic context <b>{facilities.length}</b></div><small>Only records returned by the backend are plotted</small></div><div className="map-attribution">{layer === 'streets' ? '© OpenStreetMap contributors' : 'Tiles © Esri · Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'}</div></div>
            <div className="map-footer"><label><input type="checkbox" checked={showObservations} onChange={(e) => setShowObservations(e.target.checked)} /> <Flame size={13} /> Observations</label><label><input type="checkbox" checked={showFacilities} onChange={(e) => setShowFacilities(e.target.checked)} /> <MapIcon size={13} /> OSM context</label><span><Waves size={14} /> Geographic context only</span><button onClick={() => setPage('About the Data')}>Methodology <ArrowUpRight size={13} /></button></div>
          </section>
          <aside className="side-column" aria-label="Investigation controls"><section className="panel observation-list" aria-label="Returned observations"><div className="observation-list-head"><div><div className="section-kicker">RECORDS IN CURRENT RESULT</div><h3>Observation index</h3></div><span>{visibleObservations.length} shown</span></div><label className="record-search"><Search size={15}/><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search ID, satellite or coordinates" aria-label="Search returned observations"/>{searchText && <button onClick={() => setSearchText('')} aria-label="Clear search"><X size={14}/></button>}</label><div className="observation-rows">{visibleObservations.length ? visibleObservations.slice(0, 12).map((record) => <button key={record.id} aria-pressed={selectedId === record.id} className={selectedId === record.id ? 'observation-row selected' : 'observation-row'} onClick={() => setSelectedId(record.id)}><span className="record-signal"><Flame size={14}/></span><span className="record-copy"><b>{record.satellite || record.source}</b><small>{record.latitude.toFixed(4)}°, {record.longitude.toFixed(4)}° · {new Date(record.acquired_at).toLocaleString('en-IN', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</small></span><span className="record-confidence">{record.confidence || '—'}</span></button>) : <div className="record-empty">{loading ? 'Loading records from the API…' : observations.length ? 'No returned records match this search.' : 'No observations are loaded. The regional basemap remains available while source data is empty or unavailable.'}</div>}</div></section><section className="panel filter-panel"><div className="panel-heading"><div className="panel-title-icon"><SlidersHorizontal size={16} /></div><div><h3>Investigation filters</h3><p>{observationPage?.total ?? 0} records in current query</p></div><button className="text-button" onClick={resetFilters}>Reset</button></div><div className="filter-disabled-note"><Database size={14} /> Filters query the SQLite-backed API</div>
            <label className="field-label">OBSERVATION WINDOW · UTC</label><div className="date-fields"><label><span>From</span><input type="date" value={filters.from} onChange={(e) => update('from', e.target.value)} /></label><label><span>To</span><input type="date" value={filters.to} onChange={(e) => update('to', e.target.value)} /></label></div>
            <SelectField label="SATELLITE / FEED" value={filters.satellite} options={[['any', 'All feeds'], ['VIIRS_NOAA21_NRT', 'VIIRS · NOAA-21 NRT'], ['VIIRS_NOAA20_NRT', 'VIIRS · NOAA-20 NRT'], ['VIIRS_SNPP_NRT', 'VIIRS · Suomi-NPP NRT']]} onChange={(value) => update('satellite', value)} />
            <SelectField label="SOURCE ASSESSMENT" value={filters.category} options={[[ 'any', 'All assessments'], ['industrial_associated_candidate', 'Industrial-associated candidate'], ['vegetation_agricultural_candidate', 'Vegetation / agricultural candidate'], ['other_uncertain', 'Other / uncertain']]} onChange={(value) => update('category', value)} />
            <SelectField label="TEMPORAL ASSESSMENT" value={filters.activity} options={[[ 'any', 'Any history'], ['recurring_across_observations', 'Recurring across observations'], ['insufficient_historical_evidence', 'Insufficient history']]} onChange={(value) => update('activity', value)} />
            <SelectField label="NASA-PROVIDED CONFIDENCE" value={filters.confidence} options={[[ 'any', 'Any / not supplied'], ['low', 'Low or higher'], ['nominal', 'Nominal or higher'], ['high', 'High']]} onChange={(value) => update('confidence', value)} />
            <button className="apply-button apply-active" disabled={loading} onClick={() => void applyFilters()}><Search size={15} /> Apply filters <span>{loading ? 'Loading…' : 'Query API'}</span></button>
          </section>
<section className="panel detail-panel">
  <div className="panel-heading">
    <div className="panel-title-icon detail-icon">
      <Satellite size={16} />
    </div>
    <div>
      <h3>{selectedFacility ? 'Facility details' : 'Observation details'}</h3>
      <p>{selectedFacility ? 'Mapped OpenStreetMap facility' : 'Selected satellite record'}</p>
    </div>
    <button
      className="collapse-button"
      aria-label={detailsOpen ? 'Collapse details' : 'Expand details'}
      onClick={() => setDetailsOpen(!detailsOpen)}
    >
      {detailsOpen ? <Minus size={15} /> : <Plus size={15} />}
    </button>
  </div>

  {detailsOpen && (
    selectedFacility ? (
      <div className="empty-detail">
        <b>{selectedFacility.name || 'Unnamed facility'}</b>
        <p>OSM type: {selectedFacility.osm_type}</p>
        <p>OSM ID: {selectedFacility.osm_id}</p>
        <p>
          Coordinates: {selectedFacility.latitude.toFixed(5)}, {selectedFacility.longitude.toFixed(5)}
        </p>
        <b>Mapped tags</b>
        {Object.entries(selectedFacility.tags || {}).length > 0 ? (
          Object.entries(selectedFacility.tags || {}).map(([key, value]) => (
            <p key={key}>{key}: {value}</p>
          ))
        ) : (
          <p>No additional tags available.</p>
        )}
        <button onClick={() => setSelectedFacility(null)}>Close facility details</button>
      </div>
    ) : selected ? (
      <ObservationDetails
        observation={selected}
        onClose={() => setSelectedId(null)}
      />
    ) : (
      <div className="empty-detail">
        <div className="empty-orbit"><Satellite size={21} /></div>
        <b>{available ? 'Select an observation or facility' : loading ? 'Loading stored observations' : 'No observation selected'}</b>
        <p>Click a coral marker to inspect satellite data, or a lilac marker to inspect mapped facility information.</p>
        <span><ShieldCheck size={13} /> No unsupported attribution</span>
      </div>
    )
  )}
</section>
        </aside>
        </div>
        <section className="metrics-grid" aria-label="Observation summary"><Metric label="Observations in window" value={loading ? '…' : String(observationPage?.total ?? 0)} note="FIRMS records in selected dates" icon={<Flame />} accent="orange" /><Metric label="Industrial context candidates" value={loading ? '…' : String(industrialCount)} note="Nearby mapped OSM context; not attribution" icon={<MapIcon />} accent="lilac" /><Metric label="Recurring observations" value={loading ? '…' : String(recurringCount)} note="Rows with distinct satellite/day groups within 500 m" icon={<Activity />} accent="teal" /><Metric label="Latest retrieval" value={dataRetrieved ? freshness.split(',')[0] : '—'} note={dataRetrieved ? freshness : 'No successful retrieval timestamp'} icon={<Clock3 />} accent="blue" /></section>
        <div className="lower-note"><span className="note-icon"><CircleHelp size={15} /></span><span><b>Interpret with care.</b> Recurrence means separate acquisition dates within the spatial screening radius. Gaps between overpasses remain unobserved; proximity to an OSM feature does not confirm industrial origin.</span><button onClick={() => setPage('About the Data')}>Read methodology <ArrowUpRight size={13} /></button></div>
      </>}
      <footer className="footer"><span>WILDSIGNAL <i>·</i> Environmental observation, in context.</span><span>DATA RETRIEVED {dataRetrieved || '—'} <i>·</i> STUDY REGION</span></footer>
    </main>
    {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={14} /></button></div>}
  </div>
}

function SourceBadge({ name, source }: { name: string; source?: ServiceStatus['sources'][string] }) {
  const raw = source?.status || 'not fetched'
  const label = raw === 'available' ? (source?.record_count ? 'cached' : 'empty') : raw === 'unavailable' && source?.record_count ? 'unavailable · cached' : raw.replaceAll('_', ' ')
  const tone = raw === 'available' ? source?.record_count ? 'cached' : 'unavailable' : 'unavailable'
  return <span className={`source-badge ${tone}`} title={[source?.message, source?.retrieved_at ? `Last provider attempt ${source.retrieved_at}` : 'No provider retrieval recorded'].filter(Boolean).join(' · ')}><i />{name} · {label}</span>
}

function Metric({ label, value, note, icon, accent }: { label: string; value: string; note: string; icon: ReactNode; accent: string }) { return <article className="metric-card"><div className={`metric-icon ${accent}`}>{icon}</div><span className="metric-label">{label}</span><strong>{value}</strong><small>{note}</small><span className="metric-dash" /></article> }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { return <label className="select-field"><span className="field-label">{label}</span><span className="select-wrap"><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</select><ChevronDown size={14} /></span></label> }

function ObservationDetails({ observation, onClose }: { observation: Observation; onClose: () => void }) {
  const source = observation.source_assessment
  const temporal = observation.temporal_assessment
  const acquired = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(observation.acquired_at))
  return <div className="selected-detail"><div className="selected-coordinates"><div><small>COORDINATES · WGS84</small><b>{observation.latitude.toFixed(5)}° N, {observation.longitude.toFixed(5)}° E</b></div><button className="collapse-button" onClick={onClose} aria-label="Clear selected observation"><X size={14} /></button></div><DetailGroup label="ACQUISITION"><DetailRow label="Observed (UTC)" value={acquired} /><DetailRow label="Satellite / instrument" value={`${observation.satellite || '—'} / ${observation.instrument || '—'}`} /><DetailRow label="Feed" value={observation.source} /></DetailGroup><DetailGroup label="SATELLITE ATTRIBUTES"><DetailRow label="NASA confidence" value={observation.confidence || 'Not supplied'} /><DetailRow label="Brightness T4 / T5" value={`${observation.bright_ti4 ?? '—'} / ${observation.bright_ti5 ?? '—'} K`} /><DetailRow label="Fire radiative power" value={observation.frp == null ? 'Not supplied' : `${observation.frp} MW`} /></DetailGroup><DetailGroup label="SOURCE ASSESSMENT"><strong className="assessment-label">{categoryLabels[source.category || 'other_uncertain']}</strong><small className="classification-confidence">Platform classification confidence: not scored</small>{source.nearest_feature && <DetailRow label={source.nearest_feature.name || source.nearest_feature.facility_id} value={`${source.nearest_feature.distance_m} m to mapped feature`} />}{(source.evidence || []).map((line) => <p className="evidence-line" key={line}>{line}</p>)}{(source.limitations || []).map((line) => <small className="detail-limitation" key={line}>Limit: {line}</small>)}</DetailGroup><DetailGroup label="TEMPORAL ASSESSMENT"><strong className="assessment-label">{activityLabels[temporal.status || ''] || temporal.status}</strong><small>{temporal.separate_observation_groups ?? 0} distinct observation groups in 500 m</small><small>{temporal.definition}</small></DetailGroup><small className="detail-provenance">Retrieved {observation.retrieved_at} · NASA FIRMS</small></div>
}
function DetailGroup({ label, children }: { label: string; children: ReactNode }) { return <section className="detail-group"><div className="field-label">{label}</div>{children}</section> }
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><b>{value}</b></div> }

function ActivityView({ history, loading, error, onAbout }: { history: History | null; loading: boolean; error: string; onAbout: () => void }) {
  const max = Math.max(1, ...(history?.days.map((item) => item.observations) || []))
  return <div className="method-layout"><section className="panel activity-empty"><div className="section-kicker">HISTORICAL OBSERVATION RECORD · LAST {history?.window_days ?? 90} DAYS</div><h2>Activity history across stored acquisitions.</h2>{loading ? <p>Loading records from the local API…</p> : error ? <div className="api-error" role="alert">{error}</div> : history?.total_observations ? <><p>{history.total_observations.toLocaleString()} observations grouped by UTC acquisition date. An empty day in this record does not imply no thermal activity occurred.</p><div className="history-chart" role="img" aria-label="Observation counts grouped by UTC date">{history.days.map((item) => <div className="history-bar" key={item.date} title={`${item.date}: ${item.observations} observations`}><span style={{ height: `${Math.max(4, item.observations / max * 100)}%` }} /><small>{item.date.slice(5)}</small></div>)}</div><div className="history-legend"><span><i /> Stored detections by acquisition day · UTC</span><b>{history.total_observations.toLocaleString()} observations</b></div></> : <p>No stored historical observations for the selected window. After FIRMS records are retrieved, this view will group observed detections by date. No fallback or illustrative records are included.</p>}<div className="history-steps"><span><i>01</i> Acquisition day</span><span><i>02</i> Separate overpasses</span><span><i>03</i> Provenance retained</span></div></section><section className="panel history-side"><div className="section-kicker">HOW TO READ RECURRENCE</div><h3>Repeated ≠ continuous</h3><p>{history?.recurrence_note || 'Every point is an observation at a particular overpass. Gaps between acquisition dates are unobserved periods, not evidence of continuous burning or absence.'}</p><button className="inline-link" onClick={onAbout}>Explore the methodology <ArrowUpRight size={14} /></button></section></div>
}

export default App



