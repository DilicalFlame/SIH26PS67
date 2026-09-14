"""Auth endpoints (contracts §4.5). Routes land in #152/#153."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])
