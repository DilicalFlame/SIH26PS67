"""Application settings, read from the environment (contracts §1).

Postgres/MinIO/PUBLIC_* variables are deliberately not modelled here —
app/core/database.py already owns DATABASE_URL resolution (and is tested on
its own), and duplicating that logic here would let the two drift apart.
This module only carries the vars the app factory / CORS / chat-and-auth
layers actually consume.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=True)

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    WEB_ORIGIN: str = "http://localhost:5173"
    SESSION_SECRET: str = "dev-only-change-me"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"

    # API-local operational knob, not part of contracts §1 — no other
    # service reads it, so it doesn't need a frozen-contract entry.
    LOG_LEVEL: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
