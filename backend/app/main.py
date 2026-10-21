from __future__ import annotations

import json
import sqlite3
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.requests import Request

from .analysis import classify_source, temporal_assessment
from .config import CORS_ORIGINS, FIRMS_CACHE_SECONDS, FIRMS_LOOKBACK_DAYS, FIRMS_MAP_KEY, OSM_CACHE_SECONDS, REGION_BBOX
from .database import connect, initialize, set_source_state, source_states, utc_now
from .schemas import Facility, HistoryDay, HistoryResponse, Observation, ObservationPage, RefreshResponse, SourceState, StatusResponse
from .sources import SourceError, fetch_firms, fetch_osm


app = FastAPI(title="WILDSIGNAL API", version="0.2.0", description="Thermal observation and geographic context service for the Manali–Ennore study area.")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])


@app.on_event("startup")
def startup() -> None:
    initialize()


def _query(sql: str, params: tuple = ()) -> list[dict]:
    with connect() as db:
        return [dict(row) for row in db.execute(sql, params).fetchall()]


def _bbox_clause(bbox: tuple[float, float, float, float], prefix: str = "") -> tuple[str, tuple[float, ...]]:
    west, south, east, north = bbox
    column = lambda name: f"{prefix}{name}"
    return f"{column('longitude')} BETWEEN ? AND ? AND {column('latitude')} BETWEEN ? AND ?", (west, east, south, north)


def _parse_bbox(value: str | None) -> tuple[float, float, float, float]:
    if not value:
        return REGION_BBOX
    try:
        bounds = tuple(float(part.strip()) for part in value.split(","))
    except ValueError:
        raise HTTPException(422, "bbox must be west,south,east,north") from None
    if len(bounds) != 4:
        raise HTTPException(422, "bbox must be west,south,east,north")
    west, south, east, north = bounds
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise HTTPException(422, "bbox bounds are invalid")
    if east - west > 5 or north - south > 5:
        raise HTTPException(422, "bbox is too large; maximum side length is 5 degrees")
    return bounds


def _facilities_for_bbox(bbox: tuple[float, float, float, float]) -> list[dict]:
    clause, params = _bbox_clause(bbox)
    rows = _query(f"SELECT * FROM facilities WHERE {clause} LIMIT 5000", params)
    for row in rows:
        row["tags"] = json.loads(row.pop("tags_json"))
        row["geometry"] = json.loads(row.pop("geometry_json"))
    return rows


def _enriched(row: dict, facilities: list[dict]) -> dict:
    row = dict(row)
    row["provider_metadata"] = json.loads(row.pop("provider_metadata_json", "{}"))
    related = _query("SELECT id,latitude,longitude,acquired_at,satellite FROM observations WHERE ABS(latitude-?) < 0.01 AND ABS(longitude-?) < 0.01 ORDER BY acquired_at DESC LIMIT 500", (row["latitude"], row["longitude"]))
    return {**row, "source_assessment": classify_source(row, facilities), "temporal_assessment": temporal_assessment(row, related)}


@app.get("/api/health")
def health() -> dict:
    try:
        initialize()
        with connect() as db:
            db.execute("SELECT 1").fetchone()
        return {"status": "ok", "backend": "available", "database": "available", "time": utc_now()}
    except (sqlite3.Error, OSError):
        raise HTTPException(503, "The local data store is unavailable.") from None


@app.get("/api/status", response_model=StatusResponse)
def status() -> StatusResponse:
    states = source_states()
    counts = _query("SELECT (SELECT COUNT(*) FROM observations) AS observations_count,(SELECT COUNT(*) FROM facilities) AS facilities_count")[0]
    record_counts = {"firms": counts["observations_count"], "osm": counts["facilities_count"]}
    sources = {}
    for name in ("firms", "osm"):
        state = states.get(name, {})
        configured = bool(FIRMS_MAP_KEY) if name == "firms" else True
        default_status = "credential_required" if name == "firms" and not configured else "not_fetched"
        message = ("Set FIRMS_MAP_KEY in the backend environment to retrieve NASA FIRMS records." if name == "firms" and not configured else state.get("message"))
        provider_status = default_status if name == "firms" and not configured else state.get("status", default_status)
        freshness = None
        if state.get("last_success_at"):
            try:
                success_at = datetime.fromisoformat(state["last_success_at"])
                freshness = max(0, int((datetime.now(timezone.utc) - success_at.astimezone(timezone.utc)).total_seconds()))
            except (TypeError, ValueError):
                freshness = None
        sources[name] = SourceState(status=provider_status, message=message,
            retrieved_at=state.get("retrieved_at"), record_count=record_counts[name], configured=configured,
            last_attempt_at=state.get("last_attempt_at"), last_success_at=state.get("last_success_at"),
            error_category=state.get("error_category"), outcome=state.get("outcome"),
            cached_data_available=record_counts[name] > 0, freshness_seconds=freshness)
    return StatusResponse(service="ok", region="Manali–Ennore, Tamil Nadu, India", bbox=list(REGION_BBOX),
        observations_count=counts["observations_count"], facilities_count=counts["facilities_count"], sources=sources)


@app.get("/api/observations", response_model=ObservationPage)
def observations(
    bbox: str | None = None, start: date | None = None, end: date | None = None,
    satellite: str | None = None, category: str | None = None, activity: str | None = None,
    confidence: Literal["any", "low", "nominal", "high"] = "any", limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0, le=100000),
) -> ObservationPage:
    bounds = _parse_bbox(bbox)
    if start and end and start > end:
        raise HTTPException(422, "start must be on or before end")
    if start and end and (end - start).days > 30:
        raise HTTPException(422, "date window is limited to 30 days")
    end_date = end or datetime.now(timezone.utc).date()
    start_date = start or end_date - timedelta(days=4)
    if (end_date - start_date).days > 30:
        raise HTTPException(422, "date window is limited to 30 days")
    clause, params = _bbox_clause(bounds)
    conditions = [clause, "acquired_at >= ?", "acquired_at < ?"]
    values: list = [*params, start_date.isoformat(), (end_date + timedelta(days=1)).isoformat()]
    if satellite:
        conditions.append("source = ?")
        values.append(satellite)
    where = " AND ".join(conditions)
    all_rows = _query(f"SELECT * FROM observations WHERE {where} ORDER BY acquired_at DESC LIMIT 10000", tuple(values))
    facilities = _facilities_for_bbox(bounds)
    enriched = [_enriched(row, facilities) for row in all_rows]
    if confidence != "any":
        confidence_rank = {"low": 1, "nominal": 2, "high": 3}
        enriched = [row for row in enriched if confidence_rank.get(str(row.get("confidence", "")).lower(), 0) >= confidence_rank[confidence]]
    if category:
        enriched = [row for row in enriched if row["source_assessment"]["category"] == category]
    if activity:
        enriched = [row for row in enriched if row["temporal_assessment"]["status"] == activity]
    total = len(enriched)
    return ObservationPage(observations=[Observation(**row) for row in enriched[offset:offset + limit]], total=total,
        limit=limit, offset=offset, data_status="available" if total else "empty",
        period={"start": start_date.isoformat(), "end": end_date.isoformat()})


@app.get("/api/observations/{observation_id}", response_model=Observation)
def observation_detail(observation_id: str) -> Observation:
    rows = _query("SELECT * FROM observations WHERE id = ?", (observation_id,))
    if not rows:
        raise HTTPException(404, "Observation not found")
    row = rows[0]
    return Observation(**_enriched(row, _facilities_for_bbox(REGION_BBOX)))


@app.get("/api/facilities", response_model=list[Facility])
def facilities(bbox: str | None = None, limit: int = Query(3000, ge=1, le=5000)) -> list[Facility]:
    bounds = _parse_bbox(bbox)
    return [Facility(**row) for row in _facilities_for_bbox(bounds)[:limit]]


@app.get("/api/history", response_model=HistoryResponse)
def history(days: int = Query(30, ge=1, le=365)) -> HistoryResponse:
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=days - 1)).isoformat()
    rows = _query("SELECT substr(acquired_at,1,10) AS day,COUNT(*) AS observations,GROUP_CONCAT(DISTINCT satellite) AS satellites FROM observations WHERE acquired_at >= ? GROUP BY day ORDER BY day", (cutoff,))
    grouped = [HistoryDay(date=row["day"], observations=row["observations"], satellites=sorted(filter(None, (row["satellites"] or "").split(",")))) for row in rows]
    return HistoryResponse(days=grouped, total_observations=sum(item.observations for item in grouped), window_days=days,
        recurrence_note="Counts represent detections timestamped on each UTC day. Separate overpasses are not evidence of continuous activity.")


@app.post("/api/refresh", response_model=RefreshResponse)
def refresh(force: bool = False) -> RefreshResponse:
    results: dict[str, dict] = {}
    now = time.time()
    for name, cache_seconds in (("firms", FIRMS_CACHE_SECONDS), ("osm", OSM_CACHE_SECONDS)):
        existing = source_states().get(name, {})
        if not force and existing.get("status") in {"available", "unavailable"} and existing.get("cache_until") and existing["cache_until"] > now:
            results[name] = {"status": "cached", "retrieved_at": existing.get("retrieved_at"), "record_count": existing.get("record_count", 0)}
            continue
        try:
            if name == "firms":
                end = datetime.now(timezone.utc).date()
                records = fetch_firms(end - timedelta(days=FIRMS_LOOKBACK_DAYS - 1), end)
            else:
                records = fetch_osm(force=True)
            results[name] = {"status": "available", "retrieved_at": utc_now(), "record_count": len(records)}
        except SourceError as error:
            state = "credential_required" if error.source == "credential_required" else "unavailable"
            attempted_at = utc_now()
            set_source_state(name, state, str(error), attempted_at, 0, now + cache_seconds,
                             error_category=error.source, outcome=state)
            count = int(_query("SELECT COUNT(*) AS count FROM observations" if name == "firms" else "SELECT COUNT(*) AS count FROM facilities")[0]["count"])
            results[name] = {"status": state, "message": str(error), "record_count": count,
                             "cached_data_available": count > 0, "error_category": error.source}
        except Exception:
            attempted_at = utc_now()
            set_source_state(name, "unavailable", "Unexpected provider integration error; cached data was retained.", attempted_at,
                             0, now + cache_seconds, error_category="provider_integration_error", outcome="unavailable")
            count = int(_query("SELECT COUNT(*) AS count FROM observations" if name == "firms" else "SELECT COUNT(*) AS count FROM facilities")[0]["count"])
            results[name] = {"status": "unavailable", "message": "Unexpected provider integration error; cached data was retained.",
                             "record_count": count, "cached_data_available": count > 0, "error_category": "provider_integration_error"}
    return RefreshResponse(completed_at=utc_now(), sources=results)


@app.exception_handler(sqlite3.Error)
async def database_error_handler(_: Request, __: sqlite3.Error) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Local data store unavailable."})
