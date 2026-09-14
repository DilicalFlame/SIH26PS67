"""Async SQLAlchemy engine/session setup.

Alembic migrations use a separate, synchronous connection (see
alembic/env.py) — this module is for the running application only.
"""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator

from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def get_database_url() -> URL:
    """DATABASE_URL (contracts §1) if set — otherwise built from the
    individual POSTGRES_* variables (also §1).

    The individual-variable path exists because compose.yml can't safely
    string-interpolate a DATABASE_URL: with the documented default password
    admin@123, `...://user:${POSTGRES_PASSWORD}@host...` embeds a second,
    unescaped '@' that's ambiguous with the userinfo/host delimiter — psycopg
    parsed the resulting URL as host "123" (confirmed empirically). URL.create()
    percent-encodes each component, so this can't happen regardless of what
    the password contains. compose.yml's api service relies on this: it sets
    POSTGRES_HOST/PORT/USER/PASSWORD/DB but not DATABASE_URL.
    """
    url = os.environ.get("DATABASE_URL")
    if url:
        return make_url(url)

    missing = [v for v in ("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB") if not os.environ.get(v)]
    if missing:
        raise RuntimeError(f"Set DATABASE_URL, or {', '.join(missing)} — see .env.example at the repo root")
    return URL.create(
        "postgresql+asyncpg",
        username=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        database=os.environ["POSTGRES_DB"],
    )


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(get_database_url())
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def get_session() -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency: `session: AsyncSession = Depends(get_session)`."""
    async with get_session_factory()() as session:
        yield session
