from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .config import DB_PATH


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    db_path = path or DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialize(path: Path | None = None) -> None:
    with connect(path) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS observations (
                id TEXT PRIMARY KEY, latitude REAL NOT NULL, longitude REAL NOT NULL,
                acquired_at TEXT NOT NULL, satellite TEXT, instrument TEXT, source TEXT NOT NULL,
                confidence TEXT, bright_ti4 REAL, bright_ti5 REAL, frp REAL, daynight TEXT,
                satellite_record_id TEXT, retrieved_at TEXT NOT NULL,
                provider_metadata_json TEXT NOT NULL DEFAULT '{}', first_fetched_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_observations_time ON observations(acquired_at);
            CREATE INDEX IF NOT EXISTS idx_observations_location ON observations(latitude, longitude);
            CREATE TABLE IF NOT EXISTS facilities (
                id TEXT PRIMARY KEY, osm_type TEXT NOT NULL, osm_id INTEGER NOT NULL,
                name TEXT, tags_json TEXT NOT NULL, geometry_json TEXT NOT NULL,
                latitude REAL NOT NULL, longitude REAL NOT NULL, retrieved_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS source_state (
                name TEXT PRIMARY KEY, status TEXT NOT NULL, message TEXT,
                retrieved_at TEXT, record_count INTEGER NOT NULL DEFAULT 0, cache_until REAL
            );
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(source_state)")}
        for name, declaration in (("last_attempt_at", "TEXT"), ("last_success_at", "TEXT"), ("error_category", "TEXT"), ("outcome", "TEXT")):
            if name not in columns:
                db.execute(f"ALTER TABLE source_state ADD COLUMN {name} {declaration}")
        observation_columns = {row["name"] for row in db.execute("PRAGMA table_info(observations)")}
        for name, declaration in (("provider_metadata_json", "TEXT NOT NULL DEFAULT '{}'"), ("first_fetched_at", "TEXT")):
            if name not in observation_columns:
                db.execute(f"ALTER TABLE observations ADD COLUMN {name} {declaration}")


def upsert_observations(records: list[dict[str, Any]], path: Path | None = None) -> None:
    prepared = [{**row, "provider_metadata_json": json.dumps(row.get("provider_metadata", {}), separators=(",", ":")),
                 "first_fetched_at": row.get("first_fetched_at") or row["retrieved_at"]} for row in records]
    with connect(path) as db:
        db.executemany("""INSERT INTO observations
            (id,latitude,longitude,acquired_at,satellite,instrument,source,confidence,bright_ti4,bright_ti5,frp,daynight,satellite_record_id,retrieved_at,provider_metadata_json,first_fetched_at)
            VALUES (:id,:latitude,:longitude,:acquired_at,:satellite,:instrument,:source,:confidence,:bright_ti4,:bright_ti5,:frp,:daynight,:satellite_record_id,:retrieved_at,:provider_metadata_json,:first_fetched_at)
            ON CONFLICT(id) DO UPDATE SET confidence=excluded.confidence, bright_ti4=excluded.bright_ti4,
            bright_ti5=excluded.bright_ti5, frp=excluded.frp, retrieved_at=excluded.retrieved_at,
            provider_metadata_json=excluded.provider_metadata_json""", prepared)


def upsert_facilities(records: list[dict[str, Any]], path: Path | None = None) -> None:
    with connect(path) as db:
        db.executemany("""INSERT INTO facilities
            (id,osm_type,osm_id,name,tags_json,geometry_json,latitude,longitude,retrieved_at)
            VALUES (:id,:osm_type,:osm_id,:name,:tags_json,:geometry_json,:latitude,:longitude,:retrieved_at)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, tags_json=excluded.tags_json,
            geometry_json=excluded.geometry_json, latitude=excluded.latitude,
            longitude=excluded.longitude, retrieved_at=excluded.retrieved_at""",
            [{**row, "tags_json": json.dumps(row["tags"], separators=(",", ":")),
              "geometry_json": json.dumps(row["geometry"], separators=(",", ":"))} for row in records])


def set_source_state(name: str, status: str, message: str | None, retrieved_at: str | None,
                     count: int = 0, cache_until: float | None = None, path: Path | None = None,
                     *, error_category: str | None = None, outcome: str | None = None) -> None:
    with connect(path) as db:
        success = retrieved_at if status == "available" else None
        db.execute("""INSERT INTO source_state(name,status,message,retrieved_at,record_count,cache_until,last_attempt_at,last_success_at,error_category,outcome)
            VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET status=excluded.status,
            message=excluded.message,retrieved_at=COALESCE(excluded.last_success_at,source_state.retrieved_at),
            record_count=excluded.record_count,cache_until=excluded.cache_until,
            last_attempt_at=excluded.last_attempt_at,
            last_success_at=COALESCE(excluded.last_success_at,source_state.last_success_at),
            error_category=excluded.error_category,outcome=excluded.outcome""",
            (name, status, message, retrieved_at, count, cache_until, retrieved_at, success, error_category, outcome or status))


def cached_facilities(path: Path | None = None) -> list[dict[str, Any]]:
    with connect(path) as db:
        rows = db.execute("SELECT * FROM facilities ORDER BY id LIMIT 5000").fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["tags"] = json.loads(item.pop("tags_json"))
        item["geometry"] = json.loads(item.pop("geometry_json"))
        result.append(item)
    return result


def source_states(path: Path | None = None) -> dict[str, dict[str, Any]]:
    with connect(path) as db:
        return {row["name"]: dict(row) for row in db.execute("SELECT * FROM source_state")}
