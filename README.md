# WILDSIGNAL

**See the signal. Understand the source.** A map-first thermal observation investigation workspace for the Manali–Ennore industrial belt, northern Chennai.

## Project layout

- `src/` — React, TypeScript, Vite, Tailwind and MapLibre frontend.
- `backend/app/` — FastAPI routes, provider integrations, SQLite access, normalization and evidence-based analysis.
- `backend/tests/` — Python `unittest` coverage for analysis and API logic.
- `%LOCALAPPDATA%/WILDSIGNAL/wildsignal.sqlite3` on Windows (or `~/.local/WILDSIGNAL/wildsignal.sqlite3` elsewhere) — created on first API start and excluded from the distribution ZIP.

## Requirements

- Node.js 20.19+ (or 22.12+) and npm.
- Python 3.10+ (tested here with Python 3.14) and pip.
- Internet access for OpenStreetMap and Esri basemap tiles, optional NASA FIRMS, and OpenStreetMap Overpass refreshes.

## Configure the API and data sources

Copy `.env.example` to `.env` in the project root. Set `FIRMS_MAP_KEY` to a key obtained from [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/). The example contains empty placeholders only. A FIRMS key is optional for running the UI and API; without it, the source status is `credential_required` and no FIRMS records are fetched. The key is read only by the backend process and is never returned by an API route or exposed in the frontend bundle.

`FIRMS_SOURCE` defaults to `VIIRS_NOAA21_NRT`. FIRMS Area API supports `west,south,east,north` and day ranges of 1–5; the current implementation sends the configured area and date interval server-side and validates the CSV header and provider error responses. Its MAP_KEY quota is currently documented as 5,000 transactions per 10-minute interval; use the short lookback and refresh cache to avoid unnecessary requests. [NASA FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/)

`FIRMS_AREA` defaults to `79.92,12.95,80.42,13.42` (west, south, east, north), the existing Manali–Ennore study extent. `FIRMS_LOOKBACK_DAYS` may be 1–5. An absent key produces `credential_required`; it does not make the API unhealthy. Get a key from [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/). A key is needed for actual satellite observations and cannot be supplied by the frontend.

The public Overpass endpoint defaults to `https://overpass-api.de/api/interpreter`. Queries cover the configured study box, request mapped context, use bounded retries for transient errors, and cache successful results for 12 hours. When an endpoint fails, prior facilities remain stored and their last-success time is retained. Public Overpass capacity is shared and can be delayed or rate limited; use a managed or self-hosted endpoint before production-scale use. [Overpass API guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)

Backend environment variables: `FIRMS_MAP_KEY`, `FIRMS_SOURCE`, `FIRMS_AREA`, `FIRMS_LOOKBACK_DAYS`, `OVERPASS_URL`, `OVERPASS_TIMEOUT_SECONDS`, `DATABASE_PATH`, and `CORS_ORIGINS`. `DATABASE_PATH` defaults to `%LOCALAPPDATA%/WILDSIGNAL/wildsignal.sqlite3` on Windows or `~/.local/WILDSIGNAL/wildsignal.sqlite3` elsewhere; the project retains `WILDSIGNAL_DB_PATH` as a compatibility fallback. `CORS_ORIGINS` is a comma-separated list and defaults to the two local Vite origins. Frontend configuration uses `VITE_API_BASE_URL` and defaults to `http://localhost:8000`.

## Run the backend

From the project root, create a virtual environment and install the backend dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn app.main:app --app-dir backend --env-file .env --host 127.0.0.1 --port 8000
```

The API health route is `http://127.0.0.1:8000/api/health`; interactive API documentation is at `/docs`. The application creates or migrates the SQLite schema on start. The database path is configurable with `DATABASE_PATH`.

The frontend does not start FastAPI. The reported `Failed to fetch` occurs when the API is unreachable at `VITE_API_BASE_URL` (by default, no backend is listening at `http://localhost:8000`). Start the backend separately and make sure the configured address and CORS origin match. Provider outages are independent of API health. The frontend loads status, observations, and facilities independently so a failure of one data route does not suppress successful results from another.

## Run the frontend

In a second terminal from the project root:

```powershell
npm install
npm run dev
```

Vite serves the UI at `http://localhost:5173`. The frontend defaults to `http://localhost:8000`; change `VITE_API_BASE_URL` in `.env` only when the API uses another origin. Both API origins for `localhost` and `127.0.0.1` on port 5173 are allowed by the development CORS configuration.

## Verify locally

```powershell
npm run build
npm run lint
python -m unittest discover -s backend/tests -t backend -v
```

`unittest` uses temporary SQLite databases for API logic checks. No test observations are included in the application database.

## API summary

- `GET /api/health` — service and SQLite availability.
- `GET /api/status` — source retrieval states and counts from the local record store.
- `GET /api/observations` — bounded record query, up to 30 days, with bbox, date, feed, source assessment, temporal assessment, NASA confidence class and pagination filters.
- `GET /api/observations/{id}` — selected observation and contextual analysis.
- `GET /api/facilities` — cached OSM features and GeoJSON geometries in the study box.
- `GET /api/history?days=90` — daily counts based on stored acquisitions.
- `POST /api/refresh` — retrieve FIRMS and OSM data, respecting source caches; `?force=true` requests an explicit cache bypass.

`GET /api/status` gives each provider its own `status`, `configured`, `message`, `retrieved_at` (last successful fetch), `last_attempt_at`, `last_success_at`, `error_category`, and `cached_data_available` values. FIRMS can be `credential_required`, `available`, or `unavailable`; OSM errors leave its previously stored facilities available. A successful zero-record provider response is `available` with count zero, distinct from an error.

## Data and interpretation

- The UI plots only records returned by the backend. No demo detections, facility features, statistics, or fallback dataset are bundled.
- FIRMS records are stored with acquisition time, feed, satellite/instrument attributes, provider confidence and retrieval time. NASA confidence is never presented as WILDSIGNAL classification confidence.
- OSM is geographic context, not validated industrial ground truth. Features can be missing or stale. Distances use a Haversine geodesic screening distance to the mapped feature’s representative coordinate (Overpass center for ways/relations); they are not distances to a verified facility boundary.
- `industrial_associated_candidate` means a detection falls within 500 m of a mapped feature tagged industrial/works/power. This is only a candidate association and is not proof of source. Vegetation/agriculture candidates are similarly based on nearby mapped land-use context. All other or inadequate context is `other_uncertain`. No numeric platform classification confidence is invented.
- `recurring_across_observations` requires at least two UTC acquisition-date/satellite groups within 500 m in the locally stored history; same-day pixels from one satellite are grouped together. Otherwise the assessment is `insufficient_historical_evidence`; “newly observed” and “unusual change” are not asserted because this MVP does not yet establish complete observation coverage or a validated baseline. Recurrence does not imply continuous burning.
- Empty successful data retrievals are distinct from missing credentials, provider errors, and an offline API. Cached SQLite records remain visible when a later provider request fails, and source status identifies the failure.

## Basemap and deployment notes

The default basemap uses OpenStreetMap raster tiles. The satellite layer uses Esri World Imagery. Both tile layers are loaded by MapLibre and require browser network access; the current UI displays provider attribution on the map. The basemap remains visible when observations or mapped facilities are empty. [OpenStreetMap attribution](https://www.openstreetmap.org/copyright) and [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9).

For deployment, persist the SQLite file on a durable volume or migrate the repository layer to PostgreSQL/PostGIS. Configure production CORS explicitly, keep `.env` outside version control, and use a tile service and OSM data service whose operating terms match expected traffic. Do not expose FIRMS keys to browser code.
