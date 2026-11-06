import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datetime import date
from fastapi import HTTPException
from app import database
from app import main
from app.sources import SourceError, fetch_firms, seed_bundled_osm_snapshot


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.db_path = Path(self.tempdir.name) / "test.sqlite3"
        self.db_patch = patch("app.database.DB_PATH", self.db_path)
        self.db_patch.start()
        database.initialize()

    def tearDown(self):
        self.db_patch.stop()
        self.tempdir.cleanup()

    def test_health_endpoint_and_empty_response(self):
        self.assertEqual(main.health()["status"], "ok")
        response = main.observations(limit=500, offset=0)
        self.assertEqual(response.data_status, "empty")

    def test_invalid_bbox_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            main.observations(bbox="wrong", limit=500, offset=0)
        self.assertEqual(error.exception.status_code, 422)

    def test_missing_firms_key_is_reported(self):
        with patch("app.sources.FIRMS_MAP_KEY", ""):
            with self.assertRaises(SourceError) as error:
                fetch_firms(date(2026, 10, 19), date(2026, 10, 19))
        self.assertEqual(error.exception.source, "credential_required")

    def test_bundled_osm_snapshot_seeds_only_relevant_in_bounds_features(self):
        import json
        snapshot = Path(self.tempdir.name) / "osm_facilities.json"
        snapshot.write_text(json.dumps([
            {"id": "way/10", "osm_type": "way", "osm_id": 10, "name": "Mapped refinery",
             "tags": {"industrial": "refinery"}, "geometry": {"type": "Point", "coordinates": [80.2, 13.1]},
             "latitude": 13.1, "longitude": 80.2, "retrieved_at": "2026-10-20T11:10:07+00:00"},
            {"id": "way/11", "osm_type": "way", "osm_id": 11, "name": "Commercial area",
             "tags": {"landuse": "commercial"}, "geometry": {"type": "Point", "coordinates": [80.2, 13.1]},
             "latitude": 13.1, "longitude": 80.2, "retrieved_at": "2026-10-20T11:10:07+00:00"},
            {"id": "way/12", "osm_type": "way", "osm_id": 12, "name": "Outside area",
             "tags": {"landuse": "industrial"}, "geometry": {"type": "Point", "coordinates": [81.0, 13.1]},
             "latitude": 13.1, "longitude": 81.0, "retrieved_at": "2026-10-20T11:10:07+00:00"},
        ]), encoding="utf-8")
        with patch("app.sources.OSM_SNAPSHOT_PATH", snapshot):
            records = seed_bundled_osm_snapshot()
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["id"], "way/10")
        state = database.source_states()["osm"]
        self.assertEqual(state["outcome"], "bundled_snapshot")
        self.assertEqual(state["record_count"], 1)

    def test_refresh_does_not_call_overpass_and_preserves_osm_snapshot(self):
        database.upsert_facilities([{"id": "way/10", "osm_type": "way", "osm_id": 10,
            "name": "Mapped works", "tags": {"landuse": "industrial"},
            "geometry": {"type": "Point", "coordinates": [80.2, 13.1]},
            "latitude": 13.1, "longitude": 80.2, "retrieved_at": "2026-10-20T11:10:07+00:00"}])
        database.set_source_state("osm", "available", "Bundled snapshot", "2026-10-20T11:10:07+00:00", 1, 9999999999, outcome="bundled_snapshot")
        with patch("app.main.fetch_firms", side_effect=SourceError("credential_required", "missing key", 424)):
            response = main.refresh(force=True)
        self.assertEqual(response.sources["osm"]["record_count"], 1)
        self.assertTrue(response.sources["osm"]["cached_data_available"])
        self.assertEqual(response.sources["osm"]["outcome"], "bundled_snapshot")

    def test_status_distinguishes_missing_key_from_api_failure(self):
        with patch("app.main.FIRMS_MAP_KEY", ""):
            response = main.status()
        self.assertEqual(response.sources["firms"].status, "credential_required")
        self.assertFalse(response.sources["firms"].configured)

    def test_failed_refresh_state_preserves_last_success_timestamp(self):
        successful = "2026-10-19T06:00:00+00:00"
        database.set_source_state("osm", "available", None, successful, 2, 9999999999)
        database.set_source_state("osm", "unavailable", "rate limited", "2026-10-20T06:00:00+00:00",
                                  0, 9999999999, error_category="upstream_rate_limited")
        state = database.source_states()["osm"]
        self.assertEqual(state["retrieved_at"], successful)
        self.assertEqual(state["last_success_at"], successful)
        self.assertEqual(state["error_category"], "upstream_rate_limited")

    def test_api_enriches_actual_records_and_keeps_confidence_distinct(self):
        retrieved = "2026-10-19T06:00:00+00:00"
        database.upsert_facilities([{"id": "way/10", "osm_type": "way", "osm_id": 10, "name": "Mapped works",
            "tags": {"landuse": "industrial"}, "geometry": {"type": "Point", "coordinates": [80.2, 13.1]},
            "latitude": 13.1, "longitude": 80.2, "retrieved_at": retrieved}])
        database.upsert_observations([{"id": "obs-1", "latitude": 13.1001, "longitude": 80.2,
            "acquired_at": "2026-10-19T04:30+00:00", "satellite": "NOAA-21", "instrument": "VIIRS",
            "source": "VIIRS_NOAA21_NRT", "confidence": "nominal", "bright_ti4": None,
            "bright_ti5": 300.5, "frp": 2.4, "daynight": "N", "satellite_record_id": "1.0NRT",
            "provider_metadata": {"scan": "0.4", "track": "0.3", "version": "1.0NRT"}, "retrieved_at": retrieved}])
        response = main.observations(start=date(2026, 10, 19), end=date(2026, 10, 19), limit=500, offset=0)
        record = response.observations[0].model_dump()
        self.assertEqual(response.data_status, "available")
        self.assertEqual(record["confidence"], "nominal")
        self.assertEqual(record["source_assessment"]["category"], "industrial_associated_candidate")
        self.assertEqual(record["temporal_assessment"]["status"], "insufficient_historical_evidence")
        self.assertEqual(record["provider_metadata"]["scan"], "0.4")
        high_confidence = main.observations(start=date(2026, 10, 19), end=date(2026, 10, 19), confidence="high", limit=500, offset=0)
        self.assertEqual(high_confidence.total, 0)
        nominal = main.observations(start=date(2026, 10, 19), end=date(2026, 10, 19), confidence="nominal", limit=500, offset=0)
        self.assertEqual(nominal.total, 1)


if __name__ == "__main__":
    unittest.main()
