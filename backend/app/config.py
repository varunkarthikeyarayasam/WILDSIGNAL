from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

DATA_DIR = Path(os.getenv("LOCALAPPDATA", Path.home() / ".local")) / "WILDSIGNAL"
_db_override = os.getenv("DATABASE_PATH", "").strip() or os.getenv("WILDSIGNAL_DB_PATH", "").strip()
DB_PATH = Path(_db_override).expanduser() if _db_override else DATA_DIR / "wildsignal.sqlite3"
FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "").strip()
FIRMS_SOURCE = os.getenv("FIRMS_SOURCE", "VIIRS_NOAA21_NRT").strip()
OVERPASS_URL = os.getenv("OVERPASS_URL", "").strip() or "https://overpass-api.de/api/interpreter"
_DEFAULT_BBOX = "79.92,12.95,80.42,13.42"
try:
    REGION_BBOX = tuple(float(part.strip()) for part in os.getenv("FIRMS_AREA", _DEFAULT_BBOX).split(","))
    if len(REGION_BBOX) != 4:
        raise ValueError
    west, south, east, north = REGION_BBOX
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError
except ValueError:
    raise RuntimeError("FIRMS_AREA must be west,south,east,north within valid longitude and latitude bounds") from None
FIRMS_LOOKBACK_DAYS = max(1, min(5, int(os.getenv("FIRMS_LOOKBACK_DAYS", "5"))))
FIRMS_CACHE_SECONDS = int(os.getenv("FIRMS_CACHE_SECONDS", "900"))
OSM_CACHE_SECONDS = int(os.getenv("OSM_CACHE_SECONDS", "43200"))
OVERPASS_TIMEOUT_SECONDS = max(5, min(90, int(os.getenv("OVERPASS_TIMEOUT_SECONDS", "40"))))
try:
    _origins = os.getenv("CORS_ORIGINS", "").strip() or "http://localhost:5173,http://127.0.0.1:5173"
    CORS_ORIGINS = [origin.strip() for origin in _origins.split(",") if origin.strip()]
except ValueError:
    CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
