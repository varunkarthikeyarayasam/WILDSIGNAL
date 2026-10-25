import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Activity, ArrowUpRight, CalendarDays, ChevronDown, CircleHelp, Clock3, Database, Download, Flame, Layers3, LocateFixed, Map as MapIcon, Menu, Minus, Play, Plus, Radio, RefreshCw, Satellite, Search, ShieldCheck, SlidersHorizontal, Waves, X } from 'lucide-react'
import { AboutData } from './features/activity/AboutData'
import { getFacilities, getHistory, getObservations, getStatus, refreshData, type Facility, type Filters, type History, type Observation, type ObservationPage, type ServiceStatus } from './lib/api'
import { describeSource } from './lib/sourceStatus'
import { MapBoundary } from './components/MapBoundary'
import { Hero } from './features/hero/Hero'

const MapView = lazy(() => import('./features/investigation/MapView').then((module) => ({ default: module.MapView })))
type Page = 'Overview' | 'Investigation' | 'Activity History' | 'About the Data'
const navItems: { label: Page; icon: typeof MapIcon }[] = [
  { label: 'Overview', icon: Layers3 }, { label: 'Investigation', icon: MapIcon },
  { label: 'Activity History', icon: Activity }, { label: 'About the Data', icon: CircleHelp },
]
type Entrance = 'hero' | 'transitioning' | 'dashboard'
const ENTRANCE_MS = 2600 // matches the CSS timeline in hero.css and styles/shell.css
const emptyFilters: Filters = { from: '', to: '', satellite: 'any', category: 'any', activity: 'any', confidence: 'any' }
const categoryLabels: Record<string, string> = { industrial_associated_candidate: 'Industrial associated candidate', vegetation_agricultural_candidate: 'Vegetation / agricultural candidate', other_uncertain: 'Other / uncertain' }
const activityLabels: Record<string, string> = { recurring_across_observations: 'Recurring across observations', insufficient_historical_evidence: 'Insufficient historical evidence' }

function App() {
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

  /* Entrance state machine (Overview only): hero -> transitioning -> dashboard.
     It advances only when the visitor activates the Enter control, on a fixed timer. Scrolling is never read. */
  const [entrance, setEntrance] = useState<Entrance>('hero')
  const entranceRef = useRef<Entrance>('hero')
  const entranceTimer = useRef(0)
  const phase: Entrance = page === 'Overview' ? entrance : 'dashboard'
  const moveEntrance = useCallback((next: Entrance) => { entranceRef.current = next; setEntrance(next) }, [])
  useEffect(() => () => window.clearTimeout(entranceTimer.current), [])
  useEffect(() => {
    // while the hero or the entrance is showing, the page itself does not scroll; the Enter button is the way in
    const root = document.documentElement
    root.classList.toggle('ws-locked', phase !== 'dashboard')
    if (phase === 'hero') window.scrollTo(0, 0)
    return () => root.classList.remove('ws-locked')
  }, [phase])
  const finishEntrance = useCallback(() => {
    moveEntrance('dashboard')
    window.scrollTo(0, 0)
    window.requestAnimationFrame(() => document.getElementById('dashboard')?.focus({ preventScroll: true }))
  }, [moveEntrance])
  const enterDashboard = useCallback((options?: { instant?: boolean }) => {
    if (entranceRef.current !== 'hero') return // repeated activation cannot start a second entrance
    window.clearTimeout(entranceTimer.current)
    if (options?.instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finishEntrance(); return }
    window.scrollTo(0, 0) // the dashboard must emerge from its top, whatever happened to the document before
    moveEntrance('transitioning')
    entranceTimer.current = window.setTimeout(finishEntrance, ENTRANCE_MS)
  }, [finishEntrance, moveEntrance])
  const goPage = (next: Page) => {
    if (next === 'Activity History' && page !== next) { setHistoryLoading(true); setHistoryError('') }
    setPage(next); setMobileNav(false)
  }
  const showHero = () => {
    // the brand mark and "Intro" return to the opening scene; the Enter button is again the way back in
    window.clearTimeout(entranceTimer.current)
    setMobileNav(false); setPage('Overview'); moveEntrance('hero')
  }

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

  return <div className="app-shell" data-phase={phase}>
    <header className={phase === 'hero' ? 'topbar is-resting' : 'topbar'} inert={phase !== 'dashboard'}>
      <button className="brand" aria-label="WILDSIGNAL home" onClick={showHero}><span className="brand-mark"><span /><span /><span /></span><span className="brand-copy"><b>WILDSIGNAL</b><small>Earth observation intelligence</small></span></button>
      <nav className={mobileNav ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} className={page === label ? 'nav-link active' : 'nav-link'} onClick={() => goPage(label)}><Icon size={16} />{label}</button>)}</nav>
      <div className="topbar-right"><span className={`status-pill ${status ? 'connected' : 'disconnected'}`}><i /><span>{status ? 'API connected' : 'API unavailable'}</span></span><button className="replay-intro" aria-label="Replay introduction" title="Replay introduction" onClick={showHero}><Play size={14}/><span>Intro</span></button><button className="mobile-menu" aria-label={mobileNav ? 'Close navigation' : 'Open navigation'} onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? <X /> : <Menu />}</button><span className="user-badge" aria-label="WILDSIGNAL workspace">W</span></div>
    </header>
    {phase !== 'dashboard' && <Hero phase={phase} onEnter={enterDashboard} />}
    <main id="dashboard" tabIndex={-1} inert={phase !== 'dashboard'}>
      <section className="page-heading" data-ws-reveal="1"><div className="heading-copy"><div className="eyebrow"><span className="eyebrow-line" /> Satellite thermal intelligence <span className="heading-dot">/</span> North Chennai, India</div><h1>{page === 'Overview' ? <>Thermal observations,<br /><em>in context.</em></> : page === 'Investigation' ? <>Follow the heat,<br /><em>weigh the evidence.</em></> : page === 'Activity History' ? <>What the satellites<br /><em>saw, and when.</em></> : <>Reading the data<br /><em>with care.</em></>}</h1><p>{page === 'About the Data' ? 'Where each number comes from, how it is interpreted, and where that interpretation stops.' : page === 'Activity History' ? 'Stored detections grouped by the day they were observed. A quiet day here may simply be a day nothing was recorded.' : page === 'Investigation' ? 'Filter, search and open any record to see what the satellite measured and what the map can and cannot tell you about it.' : 'A close look at where satellites have seen heat around Manali–Ennore, and what is mapped nearby. The evidence comes first; conclusions are yours to draw.'}</p></div>
        <div className="heading-actions"><span className="date-chip"><CalendarDays size={15} />{observationPage ? `${observationPage.period.start} — ${observationPage.period.end}` : 'Observation window unavailable'}</span><button className="button button-dark" onClick={exportCsv}><Download size={15} /> Export CSV</button><button className="button button-refresh" onClick={() => void syncSources()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />{refreshing ? 'Refreshing' : 'Refresh data'}</button></div>
      </section>
      {page === 'About the Data' ? <AboutData status={status} /> : page === 'Activity History' ? <ActivityView history={history} loading={historyLoading} error={historyError} onAbout={() => goPage('About the Data')} /> : <>
        <section className="status-banner" data-ws-reveal="2"><div className="status-icon"><Radio size={18} /></div><div><b>{status ? status.region : 'Waiting for the WILDSIGNAL API'}</b><p>{available ? `Showing ${observationPage?.total} stored observations from the local database. Retrieval time: ${freshness}.` : error ? error : loading ? 'Loading stored observations…' : 'No stored observations in the selected window. This is not evidence that no thermal activity occurred.'}</p></div><div className="source-tags"><SourceBadge name="FIRMS" source={status?.sources.firms} /><SourceBadge name="OSM" source={status?.sources.osm} /></div><button aria-label="About data sources" className="banner-help" onClick={() => goPage('About the Data')}><CircleHelp size={17} /></button></section>
        {error && <div className="api-error" role="alert"><span><b>Data service unavailable</b>{error}</span><button onClick={() => void loadWorkspace(filters)}>Retry connection</button></div>}
        <div className="workspace-grid" data-ws-reveal="3">
          <section className="map-card"><div className="map-header"><div><div className="section-kicker">Regional investigation</div><h2>Manali–Ennore industrial belt</h2><p>13.16° N, 80.27° E <span>·</span> Tamil Nadu, India <span>·</span> {facilities.length.toLocaleString()} mapped context features</p></div><div className="map-header-actions"><span className="map-status"><i />{loading ? 'Loading records' : `${observations.length} in view`}</span><button className="icon-button" title="Switch basemap style" aria-label="Switch basemap style" onClick={() => setLayer(layer === 'streets' ? 'satellite' : 'streets')}><Layers3 size={17} /></button><button className="icon-button" title="Recenter map" aria-label="Recenter map" onClick={() => window.dispatchEvent(new Event('wildsignal:recenter'))}><LocateFixed size={17} /></button></div></div>
            <div className={refreshing ? 'map-body is-refreshing' : 'map-body'} aria-busy={refreshing}><MapBoundary><Suspense fallback={<div className="map-loading">Preparing regional map…</div>}><MapView layer={layer} observations={visibleObservations} facilities={facilities} selectedId={selectedId} showObservations={showObservations} showFacilities={showFacilities} onSelect={(item) => {
  setSelectedFacility(null)
  setSelectedId(item?.id || null)
}}
onFacilitySelect={(facility) => {
  setSelectedFacility(facility)
  setSelectedId(null)
}} /></Suspense></MapBoundary><div className="map-legend"><div className="legend-title">Map key</div><div><span className="legend-symbol observation-symbol" />Thermal observations <b>{visibleObservations.length}</b></div><div><span className="legend-symbol facility-symbol" />OSM geographic context <b>{facilities.length}</b></div><small>Only records returned by the backend are plotted</small></div><div className="map-attribution">{layer === 'streets' ? '© OpenStreetMap contributors' : 'Tiles © Esri · Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'}</div></div>
            <div className="map-footer"><label><input type="checkbox" checked={showObservations} onChange={(e) => setShowObservations(e.target.checked)} /> <Flame size={13} /> Observations</label><label><input type="checkbox" checked={showFacilities} onChange={(e) => setShowFacilities(e.target.checked)} /> <MapIcon size={13} /> OSM context</label><span><Waves size={14} /> Geographic context only</span><button onClick={() => goPage('About the Data')}>Methodology <ArrowUpRight size={13} /></button></div>
          </section>
          <aside className="side-column" aria-label="Investigation controls"><section className="panel observation-list" aria-label="Returned observations"><div className="observation-list-head"><div><div className="section-kicker">Records in current result</div><h3>Observation index</h3></div><span>{visibleObservations.length} shown</span></div><label className="record-search"><Search size={15}/><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search ID, satellite or coordinates" aria-label="Search returned observations"/>{searchText && <button onClick={() => setSearchText('')} aria-label="Clear search"><X size={14}/></button>}</label><div className="observation-rows">{visibleObservations.length ? visibleObservations.slice(0, 12).map((record) => <button key={record.id} aria-pressed={selectedId === record.id} className={selectedId === record.id ? 'observation-row selected' : 'observation-row'} onClick={() => { setSelectedFacility(null); setSelectedId(record.id) }}><span className="record-signal"><Flame size={14}/></span><span className="record-copy"><b>{record.satellite || record.source}</b><small>{record.latitude.toFixed(4)}°, {record.longitude.toFixed(4)}° · {new Date(record.acquired_at).toLocaleString('en-IN', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</small></span><span className="record-confidence">{record.confidence || '—'}</span></button>) : <div className="record-empty">{loading ? <span className="record-skeletons" role="status" aria-label="Loading records from the API"><i /><i /><i /><i /></span> : !observationPage ? 'The records could not be loaded because the API did not respond. That is not the same as zero observations; use Retry or Refresh data.' : observations.length ? 'No returned records match this search.' : 'No observations are loaded. The regional basemap remains available while source data is empty or unavailable.'}</div>}</div></section><section className="panel filter-panel"><div className="panel-heading"><div className="panel-title-icon"><SlidersHorizontal size={16} /></div><div><h3>Investigation filters</h3><p>{observationPage?.total ?? 0} records in current query</p></div><button className="text-button" onClick={resetFilters}>Reset</button></div><div className="filter-disabled-note"><Database size={14} /> Filters query the SQLite-backed API</div>
            <label className="field-label">Observation window · UTC</label><div className="date-fields"><label><span>From</span><input type="date" value={filters.from} onChange={(e) => update('from', e.target.value)} /></label><label><span>To</span><input type="date" value={filters.to} onChange={(e) => update('to', e.target.value)} /></label></div>
            <SelectField label="Satellite / feed" value={filters.satellite} options={[['any', 'All feeds'], ['VIIRS_NOAA21_NRT', 'VIIRS · NOAA-21 NRT'], ['VIIRS_NOAA20_NRT', 'VIIRS · NOAA-20 NRT'], ['VIIRS_SNPP_NRT', 'VIIRS · Suomi-NPP NRT']]} onChange={(value) => update('satellite', value)} />
            <SelectField label="Source assessment" value={filters.category} options={[[ 'any', 'All assessments'], ['industrial_associated_candidate', 'Industrial-associated candidate'], ['vegetation_agricultural_candidate', 'Vegetation / agricultural candidate'], ['other_uncertain', 'Other / uncertain']]} onChange={(value) => update('category', value)} />
            <SelectField label="Temporal assessment" value={filters.activity} options={[[ 'any', 'Any history'], ['recurring_across_observations', 'Recurring across observations'], ['insufficient_historical_evidence', 'Insufficient history']]} onChange={(value) => update('activity', value)} />
            <SelectField label="NASA-provided confidence" value={filters.confidence} options={[[ 'any', 'Any / not supplied'], ['low', 'Low or higher'], ['nominal', 'Nominal or higher'], ['high', 'High']]} onChange={(value) => update('confidence', value)} />
            <button className="apply-button apply-active" disabled={loading} onClick={() => void applyFilters()}><Search size={15} /> Apply filters <span>{loading ? 'Loading…' : 'Query API'}</span></button>
          </section>
<section className={selected || selectedFacility ? 'panel detail-panel has-selection' : 'panel detail-panel'}>
            <div className="panel-heading">
              <div className={selectedFacility ? 'panel-title-icon is-facility' : 'panel-title-icon'}>{selectedFacility ? <MapIcon size={16} /> : <Satellite size={16} />}</div>
              <div><h3>{selectedFacility ? 'Facility details' : 'Observation details'}</h3><p>{selectedFacility ? 'Mapped OpenStreetMap facility' : 'Selected satellite record'}</p></div>
              <button className="collapse-button" aria-label={detailsOpen ? 'Collapse details' : 'Expand details'} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}>{detailsOpen ? <Minus size={15} /> : <Plus size={15} />}</button>
            </div>
            {detailsOpen && (selectedFacility ? <FacilityDetails facility={selectedFacility} onClose={() => setSelectedFacility(null)} /> : selected ? <ObservationDetails observation={selected} onClose={() => setSelectedId(null)} /> : <div className="empty-detail">
              <div className="empty-orbit"><Satellite size={21} /></div>
              <b>{available ? 'Select an observation or facility' : loading ? 'Loading stored observations' : 'No observation selected'}</b>
              <p>Click an orange marker to inspect satellite data, or a blue marker to inspect mapped facility information.</p>
              <span><ShieldCheck size={13} /> No unsupported attribution</span>
            </div>)}
          </section>
        </aside>
        </div>
        <section className="metrics-grid" aria-label="Observation summary" data-ws-reveal="4"><Metric label="Observations in window" value={loading ? '…' : observationPage ? String(observationPage.total) : '—'} note={!loading && !observationPage ? 'Unavailable: the API did not respond' : 'FIRMS records in selected dates'} icon={<Flame />} accent="orange" /><Metric label="Industrial context candidates" value={loading ? '…' : observationPage ? String(industrialCount) : '—'} note="Nearby mapped OSM context; not attribution" icon={<MapIcon />} accent="blue" /><Metric label="Recurring observations" value={loading ? '…' : observationPage ? String(recurringCount) : '—'} note="Rows with distinct satellite/day groups within 500 m" icon={<Activity />} accent="teal" /><Metric label="Latest retrieval" value={dataRetrieved ? freshness.split(',')[0] : '—'} note={dataRetrieved ? freshness : 'No successful retrieval timestamp'} icon={<Clock3 />} accent="blue" /></section>
        <div className="lower-note"><span className="note-icon"><CircleHelp size={15} /></span><span><b>Interpret with care.</b> Recurrence means separate acquisition dates within the spatial screening radius. Gaps between overpasses remain unobserved; proximity to an OSM feature does not confirm industrial origin.</span><button onClick={() => goPage('About the Data')}>Read methodology <ArrowUpRight size={13} /></button></div>
      </>}
      <footer className="footer"><span>WILDSIGNAL <i>·</i> Environmental observation, in context.</span><span>Data retrieved {dataRetrieved || '—'} <i>·</i> Study region</span></footer>
    </main>
    {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={14} /></button></div>}
  </div>
}

function SourceBadge({ name, source }: { name: string; source?: ServiceStatus['sources'][string] }) {
  const summary = describeSource(source)
  const tone = summary.tone === 'ok' ? '' : summary.tone === 'cached' ? 'cached' : summary.tone === 'warn' ? 'unavailable' : 'idle'
  return <span className={`source-badge ${tone}`} title={summary.detail}><i />{name} · {summary.label}</span>
}

function Metric({ label, value, note, icon, accent }: { label: string; value: string; note: string; icon: ReactNode; accent: string }) { return <article className="metric-card"><div className={`metric-icon ${accent}`}>{icon}</div><span className="metric-label">{label}</span><strong>{value}</strong><small>{note}</small><span className="metric-dash" /></article> }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { return <label className="select-field"><span className="field-label">{label}</span><span className="select-wrap"><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</select><ChevronDown size={14} /></span></label> }

function ObservationDetails({ observation, onClose }: { observation: Observation; onClose: () => void }) {
  const source = observation.source_assessment
  const temporal = observation.temporal_assessment
  const acquired = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(observation.acquired_at))
  return <div className="selected-detail"><div className="selected-coordinates"><div><small>Coordinates · WGS84</small><b>{observation.latitude.toFixed(5)}° N, {observation.longitude.toFixed(5)}° E</b></div><button className="collapse-button" onClick={onClose} aria-label="Clear selected observation"><X size={14} /></button></div><DetailGroup label="Acquisition"><DetailRow label="Observed (UTC)" value={acquired} /><DetailRow label="Satellite / instrument" value={`${observation.satellite || '—'} / ${observation.instrument || '—'}`} /><DetailRow label="Feed" value={observation.source} /></DetailGroup><DetailGroup label="Satellite attributes"><DetailRow label="NASA confidence" value={observation.confidence || 'Not supplied'} /><DetailRow label="Brightness T4 / T5" value={`${observation.bright_ti4 ?? '—'} / ${observation.bright_ti5 ?? '—'} K`} /><DetailRow label="Fire radiative power" value={observation.frp == null ? 'Not supplied' : `${observation.frp} MW`} /></DetailGroup><DetailGroup label="Source assessment"><strong className="assessment-label">{categoryLabels[source.category || 'other_uncertain']}</strong><small className="classification-confidence">Platform classification confidence: not scored</small>{source.nearest_feature && <DetailRow label={source.nearest_feature.name || source.nearest_feature.facility_id} value={`${source.nearest_feature.distance_m} m to mapped feature`} />}{(source.evidence || []).map((line) => <p className="evidence-line" key={line}>{line}</p>)}{(source.limitations || []).map((line) => <small className="detail-limitation" key={line}>Limit: {line}</small>)}</DetailGroup><DetailGroup label="Temporal assessment"><strong className="assessment-label">{activityLabels[temporal.status || ''] || temporal.status}</strong><small>{temporal.separate_observation_groups ?? 0} distinct observation groups in 500 m</small><small>{temporal.definition}</small></DetailGroup><small className="detail-provenance">Retrieved {observation.retrieved_at} · NASA FIRMS</small></div>
}
function FacilityDetails({ facility, onClose }: { facility: Facility; onClose: () => void }) {
  const tags = Object.entries(facility.tags || {})
  return <div className="selected-detail"><div className="selected-coordinates"><div><small>Coordinates · WGS84</small><b>{facility.latitude.toFixed(5)}, {facility.longitude.toFixed(5)}</b></div><button className="collapse-button" onClick={onClose} aria-label="Clear selected facility"><X size={14} /></button></div><DetailGroup label="Facility"><strong className="assessment-label">{facility.name || 'Unnamed facility'}</strong><DetailRow label="OSM type" value={String(facility.osm_type)} /><DetailRow label="OSM ID" value={String(facility.osm_id)} /></DetailGroup><DetailGroup label="Mapped tags">{tags.length ? <div className="facility-tags">{tags.map(([key, value]) => <DetailRow key={key} label={key} value={String(value)} />)}</div> : <small>No additional tags available.</small>}</DetailGroup><small className="detail-provenance">Mapped OpenStreetMap context. Proximity to an observation does not establish that this facility is its source.</small><button className="detail-close" onClick={onClose}>Close facility details</button></div>
}
function DetailGroup({ label, children }: { label: string; children: ReactNode }) { return <section className="detail-group"><div className="field-label">{label}</div>{children}</section> }
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><b>{value}</b></div> }

function ActivityView({ history, loading, error, onAbout }: { history: History | null; loading: boolean; error: string; onAbout: () => void }) {
  const max = Math.max(1, ...(history?.days.map((item) => item.observations) || []))
  return <div className="method-layout"><section className="panel activity-empty"><div className="section-kicker">Historical observation record · last {history?.window_days ?? 90} days</div><h2>Activity history across stored acquisitions.</h2>{loading ? <p>Loading records from the local API…</p> : error ? <div className="api-error" role="alert">{error}</div> : history?.total_observations ? <><p>{history.total_observations.toLocaleString()} observations grouped by UTC acquisition date. An empty day in this record does not imply no thermal activity occurred.</p><div className="history-chart" data-max={max} role="img" aria-label="Observation counts grouped by UTC date">{history.days.map((item) => <div className="history-bar" key={item.date} title={`${item.date}: ${item.observations} observations`}><span style={{ height: `${Math.max(4, item.observations / max * 100)}%` }} /><small>{item.date.slice(5)}</small></div>)}</div><div className="history-legend"><span><i /> Stored detections by observation (acquisition) day · UTC. Retrieval time is reported separately and is never used as an observation date.</span><b>{history.total_observations.toLocaleString()} observations</b></div></> : <p>No stored historical observations for the selected window. After FIRMS records are retrieved, this view will group observed detections by date. No fallback or illustrative records are included.</p>}<div className="history-steps"><span><i>01</i> Acquisition day</span><span><i>02</i> Separate overpasses</span><span><i>03</i> Provenance retained</span></div></section><section className="panel history-side"><div className="section-kicker">How to read recurrence</div><h3>Repeated ≠ continuous</h3><p>{history?.recurrence_note || 'Every point is an observation at a particular overpass. Gaps between acquisition dates are unobserved periods, not evidence of continuous burning or absence.'}</p><button className="inline-link" onClick={onAbout}>Explore the methodology <ArrowUpRight size={14} /></button></section></div>
}

export default App



