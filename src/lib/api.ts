import { apiBaseUrl } from './config'
import type { Geometry } from 'geojson'

export type Assessment = {
  category?: string
  status?: string
  classification_confidence?: number | null
  evidence?: string[]
  limitations?: string[]
  separate_observation_groups?: number
  definition?: string
  nearest_feature?: { facility_id: string; name?: string | null; distance_m: number } | null
}

export type Observation = {
  id: string
  latitude: number
  longitude: number
  acquired_at: string
  satellite: string | null
  instrument: string | null
  source: string
  confidence: string | null
  bright_ti4: number | null
  bright_ti5: number | null
  frp: number | null
  daynight: string | null
  satellite_record_id?: string | null
  provider_metadata?: Record<string, string>
  first_fetched_at?: string | null
  retrieved_at: string
  source_assessment: Assessment
  temporal_assessment: Assessment
}

export type Facility = {
  id: string
  osm_type: string
  osm_id: number
  name: string | null
  tags: Record<string, string>
  geometry: Geometry
  latitude: number
  longitude: number
  retrieved_at: string
}

export type SourceState = { status: string; message: string | null; retrieved_at: string | null; record_count: number; configured: boolean; last_attempt_at?: string | null; last_success_at?: string | null; error_category?: string | null; outcome?: string | null; cached_data_available?: boolean; freshness_seconds?: number | null }
export type ServiceStatus = { service: string; region: string; bbox: number[]; observations_count: number; facilities_count: number; sources: Record<string, SourceState> }
export type ObservationPage = { observations: Observation[]; total: number; data_status: 'available' | 'empty'; period: { start: string; end: string }; limit: number; offset: number }
export type History = { days: { date: string; observations: number; satellites: string[] }[]; total_observations: number; window_days: number; recurrence_note: string }
export type Filters = { from: string; to: string; satellite: string; category: string; activity: string; confidence: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  } catch {
    const missingProductionUrl = import.meta.env.PROD && /^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(apiBaseUrl)
    throw new Error(missingProductionUrl
      ? `This production build is pointing at ${apiBaseUrl} because VITE_API_BASE_URL was not set when it was built. Set it to the deployed backend URL and redeploy the frontend.`
      : `WILDSIGNAL API is unreachable at ${apiBaseUrl}. Start the FastAPI backend or set VITE_API_BASE_URL to its address.`)
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(detail?.detail || `API request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export function getStatus() { return request<ServiceStatus>('/api/status') }
export function getFacilities() { return request<Facility[]>('/api/facilities') }
export function getHistory(days = 90) { return request<History>(`/api/history?days=${days}`) }
export function refreshData(force = false) { return request<{ completed_at: string; sources: Record<string, { status: string; message?: string; record_count: number }> }>(`/api/refresh?force=${force}`, { method: 'POST' }) }

export function getObservations(filters?: Filters) {
  const params = new URLSearchParams()
  if (filters?.from) params.set('start', filters.from)
  if (filters?.to) params.set('end', filters.to)
  if (filters?.satellite && filters.satellite !== 'any') params.set('satellite', filters.satellite)
  if (filters?.category && filters.category !== 'any') params.set('category', filters.category)
  if (filters?.activity && filters.activity !== 'any') params.set('activity', filters.activity)
  if (filters?.confidence && filters.confidence !== 'any') params.set('confidence', filters.confidence)
  const suffix = params.size ? `?${params}` : ''
  return request<ObservationPage>(`/api/observations${suffix}`)
}
