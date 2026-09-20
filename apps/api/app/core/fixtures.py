"""Loads fixtures from the repo-root fixtures/ directory (issue #38).

Resolved from this file's own path, not the process cwd, so it works
whether uvicorn is started from apps/api (per CONTRIBUTING.md) or pytest is
run from anywhere else. Walks up to find the ancestor that actually has a
fixtures/ directory rather than hardcoding a parents[] index, so it survives
this file moving a level up or down the package tree.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


@lru_cache
def fixtures_dir() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "fixtures"
        if candidate.is_dir():
            return candidate
    raise RuntimeError(f"No fixtures/ directory found above {here} - is the repo checked out whole?")


def fixture_path(relative_path: str) -> Path:
    """relative_path is relative to repo-root fixtures/, e.g. 'catalog/layers.json'."""
    return fixtures_dir() / relative_path


def load_fixture(relative_path: str) -> Any:
    return json.loads(fixture_path(relative_path).read_text())
