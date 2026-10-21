import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.analysis import classify_source, haversine_m, normalize_confidence, parse_acquisition, parse_number, temporal_assessment
from app.sources import _facility_geometry


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.observation = {"id": "o1", "latitude": 13.1, "longitude": 80.2, "acquired_at": "2026-10-19T04:30+00:00", "satellite": "NOAA-21"}

    def test_geodesic_distance_is_zero_for_same_coordinate(self):
        self.assertEqual(haversine_m(13.1, 80.2, 13.1, 80.2), 0)

    def test_nearby_industrial_feature_is_candidate_with_uncertainty(self):
        facility = {"id": "way/1", "latitude": 13.1005, "longitude": 80.2, "name": "Example", "tags": {"landuse": "industrial"}}
        result = classify_source(self.observation, [facility])
        self.assertEqual(result["category"], "industrial_associated_candidate")
        self.assertIsNone(result["classification_confidence"])
        self.assertIn("proximity is context", result["evidence"][0])

    def test_mixed_nearby_land_use_remains_uncertain(self):
        facilities = [
            {"id": "way/1", "latitude": 13.1005, "longitude": 80.2, "tags": {"landuse": "industrial"}},
            {"id": "way/2", "latitude": 13.1, "longitude": 80.2005, "tags": {"landuse": "farmland"}},
        ]
        result = classify_source(self.observation, facilities)
        self.assertEqual(result["category"], "other_uncertain")
        self.assertIn("ambiguous", result["evidence"][0])

    def test_no_context_remains_uncertain(self):
        result = classify_source(self.observation, [])
        self.assertEqual(result["category"], "other_uncertain")
        self.assertIsNone(result["nearest_feature"])

    def test_recurrence_requires_a_separate_acquisition_date(self):
        same_day = [{**self.observation, "id": "o2", "acquired_at": "2026-10-19T05:00+00:00"}]
        self.assertEqual(temporal_assessment(self.observation, same_day)["status"], "insufficient_historical_evidence")
        other_satellite = [{**self.observation, "id": "o2b", "satellite": "NOAA-20"}]
        self.assertEqual(temporal_assessment(self.observation, other_satellite)["status"], "recurring_across_observations")
        other_day = [{**self.observation, "id": "o3", "acquired_at": "2026-10-18T05:00+00:00"}]
        self.assertEqual(temporal_assessment(self.observation, other_day)["status"], "recurring_across_observations")

    def test_missing_provider_fields_normalize_to_none(self):
        self.assertIsNone(parse_number(""))
        self.assertIsNone(parse_number("bad"))
        self.assertIsNone(normalize_confidence("  "))
        self.assertEqual(parse_acquisition("2026-10-19", "430"), "2026-10-19T04:30+00:00")

    def test_way_geometry_is_preserved_as_polygon_or_line(self):
        polygon = {"type": "way", "geometry": [{"lat": 13, "lon": 80}, {"lat": 13, "lon": 80.1}, {"lat": 13.1, "lon": 80}, {"lat": 13, "lon": 80}]}
        self.assertEqual(_facility_geometry(polygon)[0]["type"], "Polygon")
        line = {"type": "way", "geometry": [{"lat": 13, "lon": 80}, {"lat": 13.1, "lon": 80.1}]}
        self.assertEqual(_facility_geometry(line)[0]["type"], "LineString")
        self.assertIsNone(_facility_geometry({"type": "node", "lat": 100, "lon": 80}))


if __name__ == "__main__":
    unittest.main()
