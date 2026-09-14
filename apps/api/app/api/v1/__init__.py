"""The /api/v1 router (contracts §4). Sub-routers ship as stubs here; their
path operations land in the issues named in each module's docstring.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.api.v1 import auth, catalog, chat, fields, observations
from app.core.database import get_engine

router = APIRouter()


@router.get("/healthz", tags=["health"])
async def healthz() -> dict[str, object]:
    """Contracts §4.1. `storage` is stubbed True — no MinIO client exists in
    this app yet, so there is nothing to check.
    """
    db_ok = True
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 -- health check must not crash on any DB failure mode
        db_ok = False

    return {"status": "ok", "db": db_ok, "storage": True}


router.include_router(catalog.router)
router.include_router(fields.router)
router.include_router(observations.router)
router.include_router(auth.router)
router.include_router(chat.router)
