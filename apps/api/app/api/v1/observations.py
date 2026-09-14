"""Observation endpoints (contracts §4.4). Routes land in #63."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/observations", tags=["observations"])
