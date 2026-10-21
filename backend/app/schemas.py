from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    latitude: float
    longitude: float
    acquired_at: str
    satellite: str | None = None
    instrument: str | None = None
    source: str
    confidence: str | None = None  # NASA attribute; separate from our qualitative assessment
    bright_ti4: float | None = None
    bright_ti5: float | None = None
    frp: float | None = None
    daynight: str | None = None
    satellite_record_id: str | None = None
    provider_metadata: dict[str, Any] = Field(default_factory=dict)
    first_fetched_at: str | None = None
    retrieved_at: str
    source_assessment: dict[str, Any]
    temporal_assessment: dict[str, Any]


class ObservationPage(BaseModel):
    observations: list[Observation]
    total: int
    limit: int
    offset: int
    data_status: Literal["available", "empty"]
    period: dict[str, str]


class Facility(BaseModel):
    id: str
    osm_type: str
    osm_id: int
    name: str | None = None
    tags: dict[str, str]
    geometry: dict[str, Any]
    latitude: float
    longitude: float
    retrieved_at: str


class SourceState(BaseModel):
    status: str
    message: str | None = None
    retrieved_at: str | None = None
    record_count: int = 0
    configured: bool = True
    last_attempt_at: str | None = None
    last_success_at: str | None = None
    error_category: str | None = None
    outcome: str | None = None
    cached_data_available: bool = False
    freshness_seconds: int | None = None


class StatusResponse(BaseModel):
    service: Literal["ok"]
    region: str
    bbox: list[float]
    observations_count: int
    facilities_count: int
    sources: dict[str, SourceState]


class RefreshResponse(BaseModel):
    completed_at: str
    sources: dict[str, dict[str, Any]]


class HistoryDay(BaseModel):
    date: str
    observations: int
    satellites: list[str]


class HistoryResponse(BaseModel):
    days: list[HistoryDay]
    total_observations: int
    window_days: int
    recurrence_note: str
