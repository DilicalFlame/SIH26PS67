"""Catalog endpoints (contracts §4.2). Routes land in #79/#80/#164."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/catalog", tags=["catalog"])
