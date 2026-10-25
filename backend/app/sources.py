
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

