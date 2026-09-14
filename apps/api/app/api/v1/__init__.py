"""The /api/v1 router (contracts §4). Sub-routers ship as stubs here; their
path operations land in the issues named in each module's docstring.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Request, Response, status

from app.api.v1 import auth, catalog, chat, fields, observations
from app.core.health import check_database, check_storage

router = APIRouter()


@router.get("/healthz", tags=["health"])
async def healthz(request: Request, response: Response) -> dict[str, object]:
    """Contracts §4.1 / issue #37. No auth dependency — used by compose
    healthchecks and whoever is debugging with no session at 2am.
    """
    settings = request.app.state.settings
    db_ok, storage_ok = await asyncio.gather(
        check_database(),
        check_storage(settings.MINIO_ENDPOINT),
    )

    healthy = db_ok and storage_ok
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {"status": "ok" if healthy else "error", "db": db_ok, "storage": storage_ok}


router.include_router(catalog.router)
router.include_router(fields.router)
router.include_router(observations.router)
router.include_router(auth.router)
router.include_router(chat.router)
