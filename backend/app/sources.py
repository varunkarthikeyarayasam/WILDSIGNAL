
from __future__ import annotations
import csv
import hashlib
import io
from pathlib import Path
import json
import time
from datetime import date, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from typing import Any

from .analysis import parse_acquisition, parse_number
from .config import (
    FIRMS_CACHE_SECONDS,
    FIRMS_LOOKBACK_DAYS,
    FIRMS_MAP_KEY,
    FIRMS_SOURCE,
    OSM_CACHE_SECONDS,
    OVERPASS_TIMEOUT_SECONDS,
    OVERPASS_URL,
    REGION_BBOX,
)
from .database import (
    cached_facilities,
    set_source_state,
    source_states,
    upsert_facilities,
    upsert_observations,
    utc_now,
)


class SourceError(RuntimeError):
    def __init__(self, source: str, message: str, status: int = 502):
        super().__init__(message)
        self.source, self.status = source, status


def _request(
    url: str,
    body: bytes | None = None,
    content_type: str | None = None,
    timeout: int = 35,
) -> bytes:
    headers = {
        "User-Agent": "WILDSIGNAL/0.1 (research prototype; contact: project maintainers)"
    }
    if content_type:
        headers["Content-Type"] = content_type

    for attempt in range(3):
        request = Request(
            url,
            data=body,
            headers=headers,
            method="POST" if body is not None else "GET",
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return response.read()

        except HTTPError as exc:
            if exc.code == 429:
                raise SourceError(
                    "upstream_rate_limited",
                    "The data provider rate limited this request.",
                    503,
                ) from None

            if exc.code in {401, 403}:
                raise SourceError(
                    "invalid_credentials",
                    "The provider rejected the configured credentials.",
                    424,
                ) from None

            if exc.code not in {502, 503, 504} or attempt == 2:
                raise SourceError(
                    "upstream_http_error",
                    f"Upstream provider returned HTTP {exc.code}.",
                    502,
                ) from None

        except (URLError, TimeoutError, OSError) as exc:
            if attempt == 2:
                print(
                    "WILDSIGNAL upstream network error: "
                    f"url={url!r}, error={type(exc).__name__}: {exc}",
                    flush=True,
                )
                raise SourceError(
                    "upstream_timeout_or_network",
                    "The upstream provider timed out or could not be reached.",
                    503,
                ) from None

        time.sleep(0.25 * (2**attempt))

    raise SourceError(
        "upstream_timeout_or_network",
        "The upstream provider could not be reached.",
        503,
    )


def _record_id(*values: str) -> str:
    return hashlib.sha256("|".join(values).encode()).hexdigest()[:24]


def fetch_firms(start: date, end: date) -> list[dict[str, Any]]:
    if not FIRMS_MAP_KEY:
        raise SourceError(
            "credential_required",
            "Configure FIRMS_MAP_KEY in the backend environment to retrieve NASA FIRMS records.",
            424,
        )

    span = (end - start).days + 1
    if span < 1 or span > 30:
        raise SourceError(
            "invalid_window",
            "FIRMS requests are limited to a 1–30 day window.",
            422,
        )

    retrieved_at = utc_now()
    records: list[dict[str, Any]] = []
    cursor = start

    while cursor <= end:
        chunk_days = min(5, (end - cursor).days + 1)
        bbox = ",".join(str(value) for value in REGION_BBOX)
        key = quote(FIRMS_MAP_KEY, safe="")
        source = quote(FIRMS_SOURCE, safe="")
        area = quote(bbox, safe=",")
        url = (
            f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
            f"{key}/{source}/{area}/{chunk_days}/{cursor.isoformat()}"
        )

        try:
            text = _request(url).decode("utf-8-sig")

            if any(
                marker in text.lower()
                for marker in (
                    "invalid map key",
                    "invalid map_key",
                    "unauthorized",
                    "access denied",
                )
            ):
                raise SourceError(
                    "invalid_credentials",
                    "NASA FIRMS rejected the configured map key.",
                    424,
                )

            reader = csv.DictReader(io.StringIO(text))
            if not reader.fieldnames or not {
                field.strip().lower() for field in reader.fieldnames
            }.issuperset({"latitude", "longitude"}):
                raise SourceError(
                    "invalid_provider_response",
                    "NASA FIRMS returned an unexpected response.",
                    502,
                )

            for row in reader:
                lat = parse_number(row.get("latitude"))
                lon = parse_number(row.get("longitude"))

                if (
                    lat is None
                    or lon is None
                    or not -90 <= lat <= 90
                    or not -180 <= lon <= 180
                ):
                    continue

                try:
                    acquired_at = parse_acquisition(
                        row.get("acq_date", ""),
                        row.get("acq_time", ""),
                    )
                except ValueError:
                    continue

                satellite = row.get("satellite")
                instrument = row.get("instrument")
                provider_id = row.get("id") or row.get("record_id")

                if provider_id:
                    record_id = _record_id(FIRMS_SOURCE, provider_id)
                else:
                    record_id = _record_id(
                        FIRMS_SOURCE,
                        satellite or "",
                        instrument or "",
                        acquired_at,
                        f"{lat:.7f}",
                        f"{lon:.7f}",
                        row.get("version", ""),
                    )

                records.append(
                    {
                        "id": record_id,
                        "latitude": lat,
                        "longitude": lon,
                        "acquired_at": acquired_at,
                        "satellite": satellite,
                        "instrument": instrument,
                        "source": FIRMS_SOURCE,
                        "confidence": row.get("confidence") or None,
                        "bright_ti4": parse_number(row.get("bright_ti4")),
                        "bright_ti5": parse_number(row.get("bright_ti5")),
                        "frp": parse_number(row.get("frp")),
                        "daynight": row.get("daynight") or None,
                        "satellite_record_id": provider_id,
                        "provider_metadata": row,
                        "retrieved_at": retrieved_at,
                    }
                )

        except SourceError:
            raise
        except (UnicodeError, csv.Error):
            raise SourceError(
                "invalid_provider_response",
                "NASA FIRMS returned malformed CSV.",
                502,
            ) from None

        cursor += timedelta(days=chunk_days)

    upsert_observations(records)
    set_source_state(
        "firms",
        "available",
        None,
        retrieved_at,
        len(records),
        time.time() + FIRMS_CACHE_SECONDS,
    )
    return records


def _facility_geometry(
    element: dict[str, Any],
) -> tuple[dict[str, Any], float, float] | None:
    if element.get("type") == "node":
        lat = parse_number(element.get("lat"))
        lon = parse_number(element.get("lon"))

        if (
            lat is None
            or lon is None
            or not -90 <= lat <= 90
            or not -180 <= lon <= 180
        ):
            return None

        return {"type": "Point", "coordinates": [lon, lat]}, lat, lon

    points = element.get("geometry") or []
    if not isinstance(points, list):
        return None

    coordinates = []
    for point in points:
        if not isinstance(point, dict):
            continue

        lon = parse_number(point.get("lon"))
        lat = parse_number(point.get("lat"))

        if (
            lon is not None
            and lat is not None
            and -180 <= lon <= 180
            and -90 <= lat <= 90
        ):
            coordinates.append([lon, lat])

    if len(coordinates) >= 2:
        closed = coordinates[0] == coordinates[-1]

        if closed and len(coordinates) >= 4:
            geometry = {"type": "Polygon", "coordinates": [coordinates]}
        else:
            geometry = {"type": "LineString", "coordinates": coordinates}

        center = element.get("center") or {
            "lat": sum(point[1] for point in coordinates) / len(coordinates),
            "lon": sum(point[0] for point in coordinates) / len(coordinates),
        }
        lat = parse_number(center.get("lat"))
        lon = parse_number(center.get("lon"))

        if (
            lat is None
            or lon is None
            or not -90 <= lat <= 90
            or not -180 <= lon <= 180
        ):
            return None

        return geometry, lat, lon

    center = element.get("center")
    if center:
        lat = parse_number(center.get("lat"))
        lon = parse_number(center.get("lon"))

        if (
            lat is None
            or lon is None
            or not -90 <= lat <= 90
            or not -180 <= lon <= 180
        ):
            return None

        return {"type": "Point", "coordinates": [lon, lat]}, lat, lon

    return None


def fetch_osm(force: bool = False) -> list[dict[str, Any]]:
    state = source_states().get("osm")

    if (
        not force
        and state
        and state.get("cache_until")
        and state["cache_until"] > time.time()
    ):
        return cached_facilities()

    west, south, east, north = REGION_BBOX
    mid_lat = (south + north) / 2
    mid_lon = (west + east) / 2

    tiles = [
        (south, west, mid_lat, mid_lon),
        (south, mid_lon, mid_lat, east),
        (mid_lat, west, north, mid_lon),
        (mid_lat, mid_lon, north, east),
    ]

    collected: dict[tuple[str, int], dict[str, Any]] = {}
    failures = 0

    for tile_s, tile_w, tile_n, tile_e in tiles:
        query = f"""[out:json][timeout:30];
        (
          nwr["landuse"="industrial"]({tile_s},{tile_w},{tile_n},{tile_e});
          nwr["industrial"]({tile_s},{tile_w},{tile_n},{tile_e});
          nwr["man_made"~"^(works|storage_tank|kiln)$"]({tile_s},{tile_w},{tile_n},{tile_e});
          nwr["power"~"^(plant|substation)$"]({tile_s},{tile_w},{tile_n},{tile_e});
          nwr["landuse"="quarry"]({tile_s},{tile_w},{tile_n},{tile_e});
        );
        out center tags;"""

        try:
            raw = _request(
                OVERPASS_URL,
                urlencode({"data": query}).encode(),
                "application/x-www-form-urlencoded",
                max(5, min(OVERPASS_TIMEOUT_SECONDS, 40)),
            )
            payload = json.loads(raw)

        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            failures += 1
            print(
                f"WILDSIGNAL OSM tile returned invalid JSON: {type(exc).__name__}",
                flush=True,
            )
            continue

        except SourceError as exc:
            failures += 1
            print(
                f"WILDSIGNAL OSM tile failed: {exc.source}: {exc}",
                flush=True,
            )
            continue

        if (
            not isinstance(payload, dict)
            or not isinstance(payload.get("elements"), list)
            or payload.get("remark")
        ):
            failures += 1
            print(
                "WILDSIGNAL OSM tile returned an incomplete or invalid response.",
                flush=True,
            )
            continue

        for element in payload["elements"]:
            if not isinstance(element, dict):
                continue

            osm_type = element.get("type")
            osm_id = element.get("id")

            if (
                osm_type in {"node", "way", "relation"}
                and isinstance(osm_id, int)
                and not isinstance(osm_id, bool)
                and osm_id > 0
            ):
                collected[(osm_type, osm_id)] = element

   
    if failures == len(tiles):
        raise SourceError(
            "upstream_timeout_or_network",
            "All OpenStreetMap Overpass tiles failed; previously cached facilities were preserved.",
            503,
        )

    retrieved = utc_now()
    features: list[dict[str, Any]] = []

    for element in collected.values():
        normalized = _facility_geometry(element)
        if not normalized:
            continue

        geometry, lat, lon = normalized
        tags = element.get("tags") or {}

        if not isinstance(tags, dict):
            tags = {}

        osm_type = str(element.get("type", "unknown"))
        osm_id = int(element.get("id", 0))
        identity = f"{osm_type}/{osm_id}"

        features.append(
            {
                "id": identity,
                "osm_type": osm_type,
                "osm_id": osm_id,
                "name": tags.get("name"),
                "tags": tags,
                "geometry": geometry,
                "latitude": lat,
                "longitude": lon,
                "retrieved_at": retrieved,
            }
        )

    # Upsert only real features received from OSM. Existing records are not
    # deleted when a refresh fails or returns only part of the requested area.
    if features:
        upsert_facilities(features)

    if failures:
        raise SourceError(
            "partial_upstream_failure",
            (
                f"OpenStreetMap returned partial data: "
                f"{failures} of {len(tiles)} tiles failed. "
                "Received facilities were saved; existing records were preserved."
            ),
            503,
        )

    set_source_state(
        "osm",
        "available",
        None,
        retrieved,
        len(features),
        time.time() + OSM_CACHE_SECONDS,
    )
    return features
