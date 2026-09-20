"""Unit tests for app.services.wmts_geo - pure functions, no cache/route."""

from __future__ import annotations

from app.services.wmts_geo import bboxes_intersect, parse_polygon_candidates


def test_bboxes_intersect_overlapping() -> None:
    assert bboxes_intersect((-10, -10, 10, 10), (5, 5, 20, 20)) is True


def test_bboxes_intersect_disjoint() -> None:
    assert bboxes_intersect((-10, -10, 10, 10), (20, 20, 30, 30)) is False


def test_bboxes_intersect_touching_edges_counts_as_intersecting() -> None:
    assert bboxes_intersect((0, 0, 10, 10), (10, 10, 20, 20)) is True


def test_bboxes_intersect_one_contains_the_other() -> None:
    assert bboxes_intersect((-180, -90, 180, 90), (10, 10, 20, 20)) is True


def test_parse_polygon_candidates_valid_entries() -> None:
    candidates = parse_polygon_candidates(["poly-1|10,20,30,40", "poly-2|-5,-5,5,5"])
    assert candidates == {"poly-1": (10.0, 20.0, 30.0, 40.0), "poly-2": (-5.0, -5.0, 5.0, 5.0)}


def test_parse_polygon_candidates_skips_malformed_entries() -> None:
    candidates = parse_polygon_candidates(["poly-1|10,20,30,40", "not-valid", "poly-2|1,2,notanumber,4"])
    assert candidates == {"poly-1": (10.0, 20.0, 30.0, 40.0)}


def test_parse_polygon_candidates_handles_none() -> None:
    assert parse_polygon_candidates(None) == {}
