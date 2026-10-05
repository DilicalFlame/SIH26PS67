"""Per-request id, logging, and tracing (issue #34).

Pure ASGI middleware, not BaseHTTPMiddleware: the latter buffers the
response, which would break the chat SSE endpoint (contracts §4.6, #71)
once it exists. Never logs the request body - it will contain chat content.
"""

from __future__ import annotations

import time
import uuid
from typing import TYPE_CHECKING

import structlog
from starlette.datastructures import MutableHeaders

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = structlog.get_logger("app.request")


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        method = scope["method"]
        path = scope["path"]
        status_code = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = MutableHeaders(scope=message)
                headers.append("x-request-id", request_id)
            await send(message)

        start = time.perf_counter()
        with structlog.contextvars.bound_contextvars(request_id=request_id):
            try:
                await self.app(scope, receive, send_wrapper)
            except Exception:
                duration_ms = (time.perf_counter() - start) * 1000
                logger.exception(
                    "request_failed",
                    method=method,
                    path=path,
                    status=status_code,
                    duration_ms=round(duration_ms, 2),
                )
                raise
            else:
                duration_ms = (time.perf_counter() - start) * 1000
                logger.info(
                    "request_completed",
                    method=method,
                    path=path,
                    status=status_code,
                    duration_ms=round(duration_ms, 2),
                )
