import type { SourceState } from './api'

export type SourceTone = 'ok' | 'cached' | 'warn' | 'idle'
export type SourceSummary = { tone: SourceTone; label: string; detail: string }

const stamp = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
const when = (iso?: string | null) => (iso ? `${stamp.format(new Date(iso))} UTC` : null)

function ago(seconds?: number | null) {
  if (seconds == null || seconds < 0) return null
  if (seconds < 90) return 'moments ago'
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h ago`
  return `${Math.round(seconds / 86400)} days ago`
}

/**
 * Describes a data source strictly from the fields the API returned. It never upgrades a state: an unavailable
 * provider with stored records is "unavailable, showing stored records", never "live". A snapshot fallback is only
 * reported when the backend itself labels it that way (outcome / error_category / message mention "snapshot").
 */
export function describeSource(source?: SourceState): SourceSummary {
  if (!source) return { tone: 'idle', label: 'status not reported', detail: 'The API did not report this source.' }
  const raw = source.status
  const count = source.record_count
  const tag = `${source.outcome ?? ''} ${source.error_category ?? ''} ${source.message ?? ''}`.toLowerCase()
  const stored = count > 0 || source.cached_data_available
  const last = when(source.last_success_at ?? source.retrieved_at)
  const age = ago(source.freshness_seconds)
  const retrieved = last ? `Last successful retrieval ${last}${age ? ` (${age})` : ''}.` : 'No successful retrieval is recorded.'
  const message = source.message ? ` ${source.message}` : ''

  if (tag.includes('snapshot')) return { tone: 'warn', label: 'bundled snapshot · not live', detail: `Showing a bundled snapshot, not a continuously refreshed source.${message}` }
  if (raw === 'credential_required' || (!source.configured && raw !== 'available')) {
    return { tone: 'warn', label: stored ? 'credentials missing · stored records' : 'credentials missing', detail: `The backend has no credentials for this provider.${message}` }
  }
  if (raw === 'unavailable') return { tone: 'warn', label: stored ? 'unavailable · stored records' : 'unavailable', detail: `The provider did not respond. ${stored ? 'Records already stored are shown.' : 'No stored records exist for it.'} ${retrieved}${message}` }
  if (raw === 'available') {
    return count > 0
      ? { tone: 'ok', label: 'available', detail: `${count.toLocaleString()} stored records. ${retrieved}` }
      : { tone: 'cached', label: 'available · no records', detail: `The last retrieval succeeded and returned no records. That does not show an absence of thermal activity. ${retrieved}` }
  }
  if (raw === 'not_fetched') return { tone: 'idle', label: 'not yet retrieved', detail: 'No retrieval has run yet. Use Refresh data to request it.' }
  return { tone: 'idle', label: raw.replaceAll('_', ' '), detail: `${retrieved}${message}` }
}
