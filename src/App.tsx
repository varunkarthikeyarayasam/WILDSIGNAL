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
      {page === 'About the Data' ? <AboutData status={status} /> : page === 'Activity History' ? <ActivityView history={history} loading={historyLoading} error={historyError} onAbout={() => setPage('About the Data')} onInvestigate={() => setPage('Investigation')} /> : page === 'Investigation' ? <InvestigationView
        loading={loading}
        error={error}
        refreshing={refreshing}
        status={status}
        available={available}
        observationPage={observationPage}
        observations={observations}
        facilities={facilities}
        visibleObservations={visibleObservations}
        searchText={searchText}
        setSearchText={setSearchText}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        selectedFacility={selectedFacility}
        setSelectedFacility={setSelectedFacility}
        detailsOpen={detailsOpen}
        setDetailsOpen={setDetailsOpen}
        showObservations={showObservations}
        setShowObservations={setShowObservations}
        showFacilities={showFacilities}
        setShowFacilities={setShowFacilities}
        layer={layer}
        setLayer={setLayer}
        filters={filters}
        update={update}
        applyFilters={applyFilters}
        resetFilters={resetFilters}
        loadWorkspace={loadWorkspace}
        selected={selected}
        onAbout={() => setPage('About the Data')}
      /> : <OverviewView
        loading={loading}
        error={error}
        refreshing={refreshing}
        status={status}
        available={available}
        observationPage={observationPage}
        observations={observations}
        facilities={facilities}
        visibleObservations={visibleObservations}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        selectedFacility={selectedFacility}
        setSelectedFacility={setSelectedFacility}
        detailsOpen={detailsOpen}
        setDetailsOpen={setDetailsOpen}
        showObservations={showObservations}
        setShowObservations={setShowObservations}
        showFacilities={showFacilities}
        setShowFacilities={setShowFacilities}
        layer={layer}
        setLayer={setLayer}
        searchText={searchText}
        setSearchText={setSearchText}
        industrialCount={industrialCount}
        recurringCount={recurringCount}
        dataRetrieved={dataRetrieved}
        freshness={freshness}
        selected={selected}
        onAbout={() => setPage('About the Data')}
        onInvestigate={() => setPage('Investigation')}
      />}
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

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { return <label className="select-field"><span className="field-label">{label}</span><span className="select-wrap"><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</select><ChevronDown size={14} /></span></label> }

function ObservationDetails({ observation, onClose }: { observation: Observation; onClose: () => void }) {
  const source = observation.source_assessment
  const temporal = observation.temporal_assessment
  const acquired = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(observation.acquired_at))
  return <div className="selected-detail"><div className="selected-coordinates"><div><small>COORDINATES · WGS84</small><b>{observation.latitude.toFixed(5)}° N, {observation.longitude.toFixed(5)}° E</b></div><button className="collapse-button" onClick={onClose} aria-label="Clear selected observation"><X size={14} /></button></div><DetailGroup label="ACQUISITION"><DetailRow label="Observed (UTC)" value={acquired} /><DetailRow label="Satellite / instrument" value={`${observation.satellite || '—'} / ${observation.instrument || '—'}`} /><DetailRow label="Feed" value={observation.source} /></DetailGroup><DetailGroup label="SATELLITE ATTRIBUTES"><DetailRow label="NASA confidence" value={observation.confidence || 'Not supplied'} /><DetailRow label="Brightness T4 / T5" value={`${observation.bright_ti4 ?? '—'} / ${observation.bright_ti5 ?? '—'} K`} /><DetailRow label="Fire radiative power" value={observation.frp == null ? 'Not supplied' : `${observation.frp} MW`} /></DetailGroup><DetailGroup label="SOURCE ASSESSMENT"><strong className="assessment-label">{categoryLabels[source.category || 'other_uncertain']}</strong><small className="classification-confidence">Platform classification confidence: not scored</small>{source.nearest_feature && <DetailRow label={source.nearest_feature.name || source.nearest_feature.facility_id} value={`${source.nearest_feature.distance_m} m to mapped feature`} />}{(source.evidence || []).map((line) => <p className="evidence-line" key={line}>{line}</p>)}{(source.limitations || []).map((line) => <small className="detail-limitation" key={line}>Limit: {line}</small>)}</DetailGroup><DetailGroup label="TEMPORAL ASSESSMENT"><strong className="assessment-label">{activityLabels[temporal.status || ''] || temporal.status}</strong><small>{temporal.separate_observation_groups ?? 0} distinct observation groups in 500 m</small><small>{temporal.definition}</small></DetailGroup><small className="detail-provenance">Retrieved {observation.retrieved_at} · NASA FIRMS</small></div>
}
function DetailGroup({ label, children }: { label: string; children: ReactNode }) { return <section className="detail-group"><div className="field-label">{label}</div>{children}</section> }
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><b>{value}</b></div> }

function OverviewView({ loading, error, refreshing, status, available, observationPage, observations, facilities, visibleObservations, selectedId, setSelectedId, selectedFacility, setSelectedFacility, detailsOpen, setDetailsOpen, showObservations, setShowObservations, showFacilities, setShowFacilities, layer, setLayer, searchText, setSearchText, industrialCount, recurringCount, dataRetrieved, freshness, selected, onAbout, onInvestigate }: {
  loading: boolean; error: string; refreshing: boolean; status: ServiceStatus | null; available: boolean; observationPage: ObservationPage | null; observations: Observation[]; facilities: Facility[]; visibleObservations: Observation[]; selectedId: string | null; setSelectedId: (id: string | null) => void; selectedFacility: Facility | null; setSelectedFacility: (f: Facility | null) => void; detailsOpen: boolean; setDetailsOpen: (v: boolean) => void; showObservations: boolean; setShowObservations: (v: boolean) => void; showFacilities: boolean; setShowFacilities: (v: boolean) => void; layer: 'streets' | 'satellite'; setLayer: (l: 'streets' | 'satellite') => void; searchText: string; setSearchText: (s: string) => void; industrialCount: number; recurringCount: number; dataRetrieved: string | null; freshness: string; selected: Observation | null; onAbout: () => void; onInvestigate: () => void
}) {
  return <div className="overview-layout">
    <section className="status-banner overview-status"><div className="status-icon"><Radio size={18} /></div><div><b>{status ? status.region : 'Waiting for the WILDSIGNAL API'}</b><p>{available ? `${observationPage?.total} stored observations · ${facilities.length.toLocaleString()} mapped context features` : error || 'No observation records are currently loaded in the selected window.'}</p></div><div className="source-tags"><SourceBadge name="FIRMS" source={status?.sources.firms} /><SourceBadge name="OSM" source={status?.sources.osm} /></div><button aria-label="About data sources" className="banner-help" onClick={onAbout}><CircleHelp size={17} /></button></section>

    <div className="overview-hero-grid">
      <section className="map-card overview-map"><div className="map-header"><div><div className="section-kicker">REGIONAL CONTEXT</div><h2>Manali–Ennore industrial belt</h2><p>13.16° N, 80.27° E <span>·</span> Tamil Nadu, India <span>·</span> {facilities.length.toLocaleString()} mapped features</p></div><div className="map-header-actions"><span className="map-status"><i />{loading ? 'Loading' : `${observations.length} obs`}</span><button className="icon-button" title="Switch basemap" aria-label="Switch basemap style" onClick={() => setLayer(layer === 'streets' ? 'satellite' : 'streets')}><Layers3 size={17} /></button><button className="icon-button" title="Recenter map" aria-label="Recenter map" onClick={() => window.dispatchEvent(new Event('wildsignal:recenter'))}><LocateFixed size={17} /></button></div></div>
        <div className={refreshing ? 'map-body is-refreshing' : 'map-body overview-map-body'} aria-busy={refreshing}><Suspense fallback={<div className="map-loading">Preparing regional map…</div>}><MapView layer={layer} observations={visibleObservations} facilities={facilities} selectedId={selectedId} showObservations={showObservations} showFacilities={showFacilities} onSelect={(item) => { setSelectedFacility(null); setSelectedId(item?.id || null) }} onFacilitySelect={(facility) => { setSelectedFacility(facility); setSelectedId(null) }} /></Suspense><div className="map-legend"><div className="legend-title">MAP KEY</div><div><span className="legend-symbol observation-symbol" />Thermal observations <b>{visibleObservations.length}</b></div><div><span className="legend-symbol facility-symbol" />OSM context <b>{facilities.length}</b></div><small>Only backend-returned records are plotted</small></div><div className="map-attribution">{layer === 'streets' ? '© OpenStreetMap contributors' : 'Tiles © Esri · Source: Esri, Maxar, Earthstar Geographics'}</div></div>
        <div className="map-footer"><label><input type="checkbox" checked={showObservations} onChange={(e) => setShowObservations(e.target.checked)} /> <Flame size={13} /> Observations</label><label><input type="checkbox" checked={showFacilities} onChange={(e) => setShowFacilities(e.target.checked)} /> <MapIcon size={13} /> OSM context</label><button onClick={onInvestigate}>Open investigation <ArrowUpRight size={13} /></button></div>
      </section>

      <aside className="overview-side" aria-label="Summary and entry points">
        <div className="overview-stats">
          <div className="overview-stat-featured"><div className="metric-icon orange"><Flame size={18} /></div><span className="metric-label">Observations in window</span><strong>{loading ? '…' : String(observationPage?.total ?? 0)}</strong><small>FIRMS records in selected dates</small></div>
          <div className="overview-stat"><div className="metric-icon lilac"><MapIcon size={15} /></div><div><span className="metric-label">Industrial context candidates</span><strong>{loading ? '…' : String(industrialCount)}</strong></div></div>
          <div className="overview-stat"><div className="metric-icon teal"><Activity size={15} /></div><div><span className="metric-label">Recurring observations</span><strong>{loading ? '…' : String(recurringCount)}</strong></div></div>
          <div className="overview-stat"><div className="metric-icon blue"><Clock3 size={15} /></div><div><span className="metric-label">Latest retrieval</span><strong>{dataRetrieved ? freshness.split(',')[0] : '—'}</strong></div></div>
        </div>

        <section className="panel observation-list overview-obs-list"><div className="observation-list-head"><div><div className="section-kicker">RECENT RECORDS</div><h3>Observation index</h3></div><span>{visibleObservations.length} shown</span></div><label className="record-search"><Search size={15}/><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search ID, satellite or coordinates" aria-label="Search observations"/>{searchText && <button onClick={() => setSearchText('')} aria-label="Clear search"><X size={14}/></button>}</label><div className="observation-rows">{visibleObservations.length ? visibleObservations.slice(0, 8).map((record) => <button key={record.id} aria-pressed={selectedId === record.id} className={selectedId === record.id ? 'observation-row selected' : 'observation-row'} onClick={() => setSelectedId(record.id)}><span className="record-signal"><Flame size={14}/></span><span className="record-copy"><b>{record.satellite || record.source}</b><small>{record.latitude.toFixed(4)}°, {record.longitude.toFixed(4)}° · {new Date(record.acquired_at).toLocaleString('en-IN', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</small></span><span className="record-confidence">{record.confidence || '—'}</span></button>) : <div className="record-empty">{loading ? 'Loading records from the API…' : 'No observations loaded. The basemap remains available.'}</div>}</div></section>

        <button className="overview-investigate-cta" onClick={onInvestigate}><Search size={16} /> Enter the investigation workspace <ArrowUpRight size={16} /></button>
      </aside>
    </div>

    {(selected || selectedFacility) && <section className="panel detail-panel overview-detail"><div className="panel-heading"><div className="panel-title-icon detail-icon"><Satellite size={16} /></div><div><h3>{selectedFacility ? 'Facility details' : 'Observation details'}</h3><p>{selectedFacility ? 'Mapped OpenStreetMap facility' : 'Selected satellite record'}</p></div><button className="collapse-button" aria-label={detailsOpen ? 'Collapse' : 'Expand'} onClick={() => setDetailsOpen(!detailsOpen)}>{detailsOpen ? <Minus size={15} /> : <Plus size={15} />}</button></div>{detailsOpen && (selectedFacility ? <FacilityDetails facility={selectedFacility} onClose={() => setSelectedFacility(null)} /> : selected ? <ObservationDetails observation={selected} onClose={() => setSelectedId(null)} /> : null)}</section>}

    <div className="lower-note"><span className="note-icon"><CircleHelp size={15} /></span><span><b>Interpret with care.</b> Recurrence means separate acquisition dates within the spatial screening radius. Gaps between overpasses remain unobserved; proximity to an OSM feature does not confirm industrial origin.</span><button onClick={onAbout}>Read methodology <ArrowUpRight size={13} /></button></div>
  </div>
}

function InvestigationView({ loading, error, refreshing, status, available, observationPage, observations, facilities, visibleObservations, searchText, setSearchText, selectedId, setSelectedId, selectedFacility, setSelectedFacility, detailsOpen, setDetailsOpen, showObservations, setShowObservations, showFacilities, setShowFacilities, layer, setLayer, filters, update, applyFilters, resetFilters, loadWorkspace, selected, onAbout }: {
  loading: boolean; error: string; refreshing: boolean; status: ServiceStatus | null; available: boolean; observationPage: ObservationPage | null; observations: Observation[]; facilities: Facility[]; visibleObservations: Observation[]; searchText: string; setSearchText: (s: string) => void; selectedId: string | null; setSelectedId: (id: string | null) => void; selectedFacility: Facility | null; setSelectedFacility: (f: Facility | null) => void; detailsOpen: boolean; setDetailsOpen: (v: boolean) => void; showObservations: boolean; setShowObservations: (v: boolean) => void; showFacilities: boolean; setShowFacilities: (v: boolean) => void; layer: 'streets' | 'satellite'; setLayer: (l: 'streets' | 'satellite') => void; filters: Filters; update: (key: keyof Filters, value: string) => void; applyFilters: () => void; resetFilters: () => void; loadWorkspace: (f: Filters) => void; selected: Observation | null; onAbout: () => void
}) {
  return <div className="investigation-layout">
    <section className="status-banner"><div className="status-icon"><Radio size={18} /></div><div><b>{status ? status.region : 'Waiting for the WILDSIGNAL API'}</b><p>{available ? `Showing ${observationPage?.total} stored observations · loaded from the local database` : error || 'No observation records are currently loaded in the selected window.'}</p></div><div className="source-tags"><SourceBadge name="FIRMS" source={status?.sources.firms} /><SourceBadge name="OSM" source={status?.sources.osm} /></div><button aria-label="About data sources" className="banner-help" onClick={onAbout}><CircleHelp size={17} /></button></section>
    {error && <div className="api-error" role="alert"><span><b>Data service unavailable</b>{error}</span><button onClick={() => void loadWorkspace(filters)}>Retry connection</button></div>}
    <div className="workspace-grid">
      <section className="map-card"><div className="map-header"><div><div className="section-kicker">REGIONAL INVESTIGATION</div><h2>Manali–Ennore industrial belt</h2><p>13.16° N, 80.27° E <span>·</span> Tamil Nadu, India <span>·</span> {facilities.length.toLocaleString()} mapped context features</p></div><div className="map-header-actions"><span className="map-status"><i />{loading ? 'Loading records' : `${observations.length} in view`}</span><button className="icon-button" title="Switch basemap style" aria-label="Switch basemap style" onClick={() => setLayer(layer === 'streets' ? 'satellite' : 'streets')}><Layers3 size={17} /></button><button className="icon-button" title="Recenter map" aria-label="Recenter map" onClick={() => window.dispatchEvent(new Event('wildsignal:recenter'))}><LocateFixed size={17} /></button></div></div>
        <div className={refreshing ? 'map-body is-refreshing' : 'map-body'} aria-busy={refreshing}><Suspense fallback={<div className="map-loading">Preparing regional map…</div>}><MapView layer={layer} observations={visibleObservations} facilities={facilities} selectedId={selectedId} showObservations={showObservations} showFacilities={showFacilities} onSelect={(item) => { setSelectedFacility(null); setSelectedId(item?.id || null) }} onFacilitySelect={(facility) => { setSelectedFacility(facility); setSelectedId(null) }} /></Suspense><div className="map-legend"><div className="legend-title">MAP KEY</div><div><span className="legend-symbol observation-symbol" />Thermal observations <b>{visibleObservations.length}</b></div><div><span className="legend-symbol facility-symbol" />OSM geographic context <b>{facilities.length}</b></div><small>Only records returned by the backend are plotted</small></div><div className="map-attribution">{layer === 'streets' ? '© OpenStreetMap contributors' : 'Tiles © Esri · Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'}</div></div>
        <div className="map-footer"><label><input type="checkbox" checked={showObservations} onChange={(e) => setShowObservations(e.target.checked)} /> <Flame size={13} /> Observations</label><label><input type="checkbox" checked={showFacilities} onChange={(e) => setShowFacilities(e.target.checked)} /> <MapIcon size={13} /> OSM context</label><span><Waves size={14} /> Geographic context only</span><button onClick={onAbout}>Methodology <ArrowUpRight size={13} /></button></div>
      </section>
      <aside className="side-column" aria-label="Investigation controls"><section className="panel observation-list" aria-label="Returned observations"><div className="observation-list-head"><div><div className="section-kicker">RECORDS IN CURRENT RESULT</div><h3>Observation index</h3></div><span>{visibleObservations.length} shown</span></div><label className="record-search"><Search size={15}/><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search ID, satellite or coordinates" aria-label="Search returned observations"/>{searchText && <button onClick={() => setSearchText('')} aria-label="Clear search"><X size={14}/></button>}</label><div className="observation-rows">{visibleObservations.length ? visibleObservations.slice(0, 12).map((record) => <button key={record.id} aria-pressed={selectedId === record.id} className={selectedId === record.id ? 'observation-row selected' : 'observation-row'} onClick={() => setSelectedId(record.id)}><span className="record-signal"><Flame size={14}/></span><span className="record-copy"><b>{record.satellite || record.source}</b><small>{record.latitude.toFixed(4)}°, {record.longitude.toFixed(4)}° · {new Date(record.acquired_at).toLocaleString('en-IN', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</small></span><span className="record-confidence">{record.confidence || '—'}</span></button>) : <div className="record-empty">{loading ? 'Loading records from the API…' : observations.length ? 'No returned records match this search.' : 'No observations are loaded. The regional basemap remains available while source data is empty or unavailable.'}</div>}</div></section>
        <section className="panel filter-panel"><div className="panel-heading"><div className="panel-title-icon"><SlidersHorizontal size={16} /></div><div><h3>Investigation filters</h3><p>{observationPage?.total ?? 0} records in current query</p></div><button className="text-button" onClick={resetFilters}>Reset</button></div><div className="filter-disabled-note"><Database size={14} /> Filters query the SQLite-backed API</div>
          <label className="field-label">OBSERVATION WINDOW · UTC</label><div className="date-fields"><label><span>From</span><input type="date" value={filters.from} onChange={(e) => update('from', e.target.value)} /></label><label><span>To</span><input type="date" value={filters.to} onChange={(e) => update('to', e.target.value)} /></label></div>
          <SelectField label="SATELLITE / FEED" value={filters.satellite} options={[['any', 'All feeds'], ['VIIRS_NOAA21_NRT', 'VIIRS · NOAA-21 NRT'], ['VIIRS_NOAA20_NRT', 'VIIRS · NOAA-20 NRT'], ['VIIRS_SNPP_NRT', 'VIIRS · Suomi-NPP NRT']]} onChange={(value) => update('satellite', value)} />
          <SelectField label="SOURCE ASSESSMENT" value={filters.category} options={[[ 'any', 'All assessments'], ['industrial_associated_candidate', 'Industrial-associated candidate'], ['vegetation_agricultural_candidate', 'Vegetation / agricultural candidate'], ['other_uncertain', 'Other / uncertain']]} onChange={(value) => update('category', value)} />
          <SelectField label="TEMPORAL ASSESSMENT" value={filters.activity} options={[[ 'any', 'Any history'], ['recurring_across_observations', 'Recurring across observations'], ['insufficient_historical_evidence', 'Insufficient history']]} onChange={(value) => update('activity', value)} />
          <SelectField label="NASA-PROVIDED CONFIDENCE" value={filters.confidence} options={[[ 'any', 'Any / not supplied'], ['low', 'Low or higher'], ['nominal', 'Nominal or higher'], ['high', 'High']]} onChange={(value) => update('confidence', value)} />
          <button className="apply-button apply-active" disabled={loading} onClick={() => void applyFilters()}><Search size={15} /> Apply filters <span>{loading ? 'Loading…' : 'Query API'}</span></button>
        </section>
        <section className="panel detail-panel"><div className="panel-heading"><div className="panel-title-icon detail-icon"><Satellite size={16} /></div><div><h3>{selectedFacility ? 'Facility details' : 'Observation details'}</h3><p>{selectedFacility ? 'Mapped OpenStreetMap facility' : 'Selected satellite record'}</p></div><button className="collapse-button" aria-label={detailsOpen ? 'Collapse details' : 'Expand details'} onClick={() => setDetailsOpen(!detailsOpen)}>{detailsOpen ? <Minus size={15} /> : <Plus size={15} />}</button></div>
          {detailsOpen && (selectedFacility ? <FacilityDetails facility={selectedFacility} onClose={() => setSelectedFacility(null)} /> : selected ? <ObservationDetails observation={selected} onClose={() => setSelectedId(null)} /> : <div className="empty-detail"><div className="empty-orbit"><Satellite size={21} /></div><b>{available ? 'Select an observation or facility' : loading ? 'Loading stored observations' : 'No observation selected'}</b><p>Click a coral marker to inspect satellite data, or a lilac marker to inspect mapped facility information.</p><span><ShieldCheck size={13} /> No unsupported attribution</span></div>)}
        </section>
      </aside>
    </div>
  </div>
}

function FacilityDetails({ facility, onClose }: { facility: Facility; onClose: () => void }) {
  const tags = Object.entries(facility.tags || {})
  return <div className="selected-detail"><div className="selected-coordinates"><div><small>FACILITY · OSM {facility.osm_type}/{facility.osm_id}</small><b>{facility.name || 'Unnamed facility'}</b></div><button className="collapse-button" onClick={onClose} aria-label="Clear selected facility"><X size={14} /></button></div><DetailGroup label="LOCATION"><DetailRow label="Coordinates" value={`${facility.latitude.toFixed(5)}, ${facility.longitude.toFixed(5)}`} /><DetailRow label="OSM type" value={facility.osm_type} /><DetailRow label="OSM ID" value={String(facility.osm_id)} /></DetailGroup>{tags.length > 0 && <DetailGroup label="MAPPED TAGS">{tags.map(([key, value]) => <DetailRow key={key} label={key} value={String(value)} />)}</DetailGroup>}{tags.length === 0 && <DetailGroup label="MAPPED TAGS"><small className="detail-provenance">No additional tags are associated with this facility.</small></DetailGroup>}<small className="detail-provenance">Source: OpenStreetMap · Context only, not attribution</small></div>
}

function ActivityView({ history, loading, error, onAbout, onInvestigate }: { history: History | null; loading: boolean; error: string; onAbout: () => void; onInvestigate: () => void }) {
  const max = Math.max(1, ...(history?.days.map((item) => item.observations) || []))
  const daysWithData = history?.days.filter((d) => d.observations > 0).length ?? 0
  const peakDay = history?.days.reduce((a, b) => b.observations > a.observations ? b : a, history.days[0]) ?? null
  return <div className="activity-layout">
    <div className="activity-stats-strip">
      <div className="activity-stat"><span className="metric-label">Total observations</span><strong>{loading ? '…' : (history?.total_observations ?? 0).toLocaleString()}</strong></div>
      <div className="activity-stat"><span className="metric-label">Days with data</span><strong>{loading ? '…' : String(daysWithData)}</strong></div>
      <div className="activity-stat"><span className="metric-label">Peak day</span><strong>{peakDay ? peakDay.date.slice(5) : '—'}</strong><small>{peakDay ? `${peakDay.observations} obs` : ''}</small></div>
      <div className="activity-stat"><span className="metric-label">Window</span><strong>{history?.window_days ?? 90} days</strong></div>
    </div>

    <div className="activity-content-grid">
      <section className="panel activity-timeline"><div className="section-kicker">HISTORICAL OBSERVATION RECORD · LAST {history?.window_days ?? 90} DAYS</div><h2>Activity across stored acquisitions</h2>
        {loading ? <p className="activity-loading">Loading records from the local API…</p> : error ? <div className="api-error" role="alert">{error}</div> : history?.total_observations ? <><p className="activity-intro">{history.total_observations.toLocaleString()} observations grouped by UTC acquisition date. An empty day does not imply no thermal activity occurred — only that no overpass detected any.</p><div className="history-chart" role="img" aria-label="Observation counts grouped by UTC date">{history.days.map((item) => <div className="history-bar" key={item.date} title={`${item.date}: ${item.observations} observations`}><span style={{ height: `${Math.max(4, item.observations / max * 100)}%` }} /><small>{item.date.slice(5)}</small></div>)}</div><div className="history-legend"><span><i /> Stored detections by acquisition day · UTC</span><b>{history.total_observations.toLocaleString()} observations</b></div></> : <div className="activity-empty-state"><div className="empty-orbit"><Activity size={24} /></div><b>No stored historical observations</b><p>After FIRMS records are retrieved, this view will group observed detections by date. No fallback or illustrative records are included.</p></div>}
        <div className="history-steps"><span><i>01</i> Acquisition day</span><span><i>02</i> Separate overpasses</span><span><i>03</i> Provenance retained</span></div>
      </section>

      <aside className="activity-aside">
        <section className="panel activity-interpretation"><div className="section-kicker">HOW TO READ RECURRENCE</div><h3>Repeated <em>≠</em> continuous</h3><p>{history?.recurrence_note || 'Every point is an observation at a particular overpass. Gaps between acquisition dates are unobserved periods, not evidence of continuous burning or absence.'}</p><button className="inline-link" onClick={onAbout}>Explore the methodology <ArrowUpRight size={14} /></button></section>
        <button className="activity-investigate-cta" onClick={onInvestigate}><MapIcon size={16} /> Back to investigation <ArrowUpRight size={16} /></button>
      </aside>
    </div>
  </div>
}

export default App



