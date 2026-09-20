"""Shared response-model base and the frozen error envelope (contracts §4)."""

from __future__ import annotations

from typing import Literal

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

ErrorCode = Literal["bad_request", "unauthorized", "not_found", "conflict", "upstream_error", "internal"]

_STATUS_FOR_CODE: dict[ErrorCode, int] = {
    "bad_request": 400,
    "unauthorized": 401,
    "not_found": 404,
    "conflict": 409,
    "upstream_error": 502,
    "internal": 500,
}


class CamelModel(BaseModel):
    """Every wire model: Python fields stay snake_case, JSON is camelCase -
    matching the TypeScript interfaces in contracts §4/§5 exactly."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str


class ErrorResponse(BaseModel):
    """The one error shape every /api/v1 route uses (contracts §4)."""

    error: ErrorDetail


class ApiError(Exception):
    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# For a route's `responses=` kwarg, so /docs and openapi.json document the
# error shape too - not just the 2xx one (contracts §4.5's `-> 200 | 401`
# and every by-id lookup's implicit 404 are part of the frozen signature).
NOT_FOUND_RESPONSE: dict[int | str, dict[str, type[BaseModel]]] = {404: {"model": ErrorResponse}}
UNAUTHORIZED_RESPONSE: dict[int | str, dict[str, type[BaseModel]]] = {401: {"model": ErrorResponse}}


async def api_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Signature is (Request, Exception), not (Request, ApiError), only
    because Starlette's add_exception_handler is typed invariantly on the
    exception class - it is only ever registered for ApiError."""
    assert isinstance(exc, ApiError)
    return JSONResponse(
        status_code=_STATUS_FOR_CODE[exc.code],
        content=ErrorResponse(error=ErrorDetail(code=exc.code, message=exc.message)).model_dump(),
    )
