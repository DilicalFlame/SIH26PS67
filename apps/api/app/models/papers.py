from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import TIMESTAMP, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, UpdatedAtMixin, UUIDPrimaryKeyMixin

# M4, defined now so migrations are additive, not rewrites (contracts §3).


class Paper(UUIDPrimaryKeyMixin, CreatedAtMixin, UpdatedAtMixin, Base):
    __tablename__ = "papers"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(Text, nullable=False, server_default="private")
    published_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class PaperBlock(UUIDPrimaryKeyMixin, CreatedAtMixin, UpdatedAtMixin, Base):
    __tablename__ = "paper_blocks"

    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("papers.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    block_type: Mapped[str] = mapped_column(Text, nullable=False)  # 'heading'|'text'|'activity'|'citation_list'
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    activity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("activities.id"), nullable=True
    )


class Citation(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "citations"

    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("papers.id", ondelete="CASCADE"), nullable=False
    )
    bibtex_key: Mapped[str] = mapped_column(Text, nullable=False)
    doi: Mapped[str | None] = mapped_column(Text, nullable=True)
    csl_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
