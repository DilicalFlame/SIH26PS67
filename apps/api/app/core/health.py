"""Dependency reachability checks for GET /api/v1/healthz (issue #37)."""

from __future__ import annotations

import httpx
import structlog
from sqlalchemy import text

from app.core.database import get_engine

logger = structlog.get_logger(__name__)

STORAGE_CHECK_TIMEOUT_SECONDS = 3.0


async def check_database() -> bool:
    """get_engine() is called inside the try, not by the caller - a bad
    DATABASE_URL/POSTGRES_* config must fail this check, not crash it."""
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        logger.warning("healthz_db_unreachable", exc_info=True)
        return False
    return True


async def check_storage(minio_endpoint: str, transport: httpx.AsyncBaseTransport | None = None) -> bool:
    """MinIO's own liveness probe - no bucket access, no credentials needed.

    `transport` exists only for tests (httpx.MockTransport) - production
    callers never pass it and get a real network client.
    """
    url = f"{minio_endpoint.rstrip('/')}/minio/health/live"
    try:
        async with httpx.AsyncClient(timeout=STORAGE_CHECK_TIMEOUT_SECONDS, transport=transport) as client:
            resp = await client.get(url)
    except Exception:
        # Broad on purpose: a malformed MINIO_ENDPOINT raises httpx.InvalidURL,
        # which is not an httpx.HTTPError - this must still degrade to False,
        # not bubble up into a 500 from the healthz route.
        logger.warning("healthz_storage_unreachable", exc_info=True)
        return False
    return resp.status_code == 200
