from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1 import router as api_v1_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.schemas.common import ApiError, api_error_handler


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.LOG_LEVEL)

    app = FastAPI(title="Thalassa API")
    app.state.settings = settings
    app.add_exception_handler(ApiError, api_error_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.WEB_ORIGIN],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestContextMiddleware)
    # The unfiltered WMTS catalog (app/api/v1/wmts_catalog.py) runs tens of
    # MB of JSON - compression matters there specifically, but this benefits
    # every route and costs nothing for the small existing responses.
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    app.include_router(api_v1_router, prefix="/api/v1")

    return app


app = create_app()
