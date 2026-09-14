"""Scalar field endpoints (contracts §4.3). Routes land in #80."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/fields", tags=["fields"])
