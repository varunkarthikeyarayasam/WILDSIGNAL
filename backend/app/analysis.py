from __future__ import annotations

from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from typing import Any


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres; suitable for local association screening."""
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    value = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 6_371_008.8 * 2 * asin(sqrt(value))


def classify_source(observation: dict[str, Any], facilities: list[dict[str, Any]]) -> dict[str, Any]:
    nearest: tuple[dict[str, Any], float] | None = None
    industrial: list[tuple[dict[str, Any], float]] = []
    vegetation: list[tuple[dict[str, Any], float]] = []
    for facility in facilities:
        tags = facility.get("tags", {})
        distance = haversine_m(observation["latitude"], observation["longitude"], facility["latitude"], facility["longitude"])
        if nearest is None or distance < nearest[1]:
            nearest = (facility, distance)
        if distance <= 500:
            if tags.get("landuse") in {"industrial"} or any(key in tags for key in ("industrial", "man_made", "power")):
                industrial.append((facility, distance))
            if tags.get("landuse") in {"farmland", "forest", "meadow", "orchard", "vineyard"}:
                vegetation.append((facility, distance))
    category = "other_uncertain"
    evidence: list[str] = []
    association = None
    if nearest:
        facility, distance = nearest
        association = {"facility_id": facility["id"], "name": facility.get("name"), "distance_m": round(distance)}
    if industrial and vegetation:
        evidence.append("Both industrial and vegetation/agricultural features are mapped within 500 m; context is ambiguous")
    elif industrial:
        candidate, distance = min(industrial, key=lambda item: item[1])
        category = "industrial_associated_candidate"
        association = {"facility_id": candidate["id"], "name": candidate.get("name"), "distance_m": round(distance)}
        evidence.append(f"Mapped industrial feature {candidate['id']} about {round(distance)} m away; proximity is context, not proof of origin")
    elif vegetation:
        candidate, distance = min(vegetation, key=lambda item: item[1])
        category = "vegetation_agricultural_candidate"
        association = {"facility_id": candidate["id"], "name": candidate.get("name"), "distance_m": round(distance)}
        evidence.append(f"Mapped {candidate.get('tags', {}).get('landuse', 'vegetation/agricultural')} feature about {round(distance)} m away; land-use context is not proof of source")
    if not evidence:
        evidence.append("Insufficient mapped context to support a source association")
    return {"category": category, "classification_confidence": None, "evidence": evidence,
            "nearest_feature": association, "limitations": ["OSM coverage may be incomplete or outdated", "Facility proximity does not establish source"]}


def temporal_assessment(observation: dict[str, Any], nearby: list[dict[str, Any]]) -> dict[str, Any]:
    current = observation["acquired_at"]
    companions = []
    for record in nearby:
        if record["id"] == observation["id"]:
            continue
        if haversine_m(observation["latitude"], observation["longitude"], record["latitude"], record["longitude"]) <= 500:
            companions.append(record)
    passes = {record["acquired_at"][:10] + ":" + str(record.get("satellite") or "unknown") for record in companions}
    passes.add(current[:10] + ":" + str(observation.get("satellite") or "unknown"))
    label = "recurring_across_observations" if len(passes) >= 2 else "insufficient_historical_evidence"
    return {"status": label, "separate_observation_groups": len(passes),
            "definition": "A group is one UTC acquisition date and satellite. Recurrence requires at least two such groups within 500 m; it does not imply continuous activity."}


def normalize_confidence(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def parse_number(value: Any) -> float | None:
    try:
        if value is None or str(value).strip() in {"", "null", "nan"}:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_acquisition(acq_date: str, acq_time: str) -> str:
    digits = str(acq_time).strip().zfill(4)
    parsed = datetime.strptime(f"{acq_date} {digits[:2]}{digits[2:4]}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
    return parsed.isoformat(timespec="minutes")
