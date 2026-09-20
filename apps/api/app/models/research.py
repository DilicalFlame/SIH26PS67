from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, UpdatedAtMixin, UUIDPrimaryKeyMixin


class Project(UUIDPrimaryKeyMixin, CreatedAtMixin, UpdatedAtMixin, Base):
    """A "work" in the vision doc."""

    __tablename__ = "projects"

    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(Text, nullable=False, server_default="private")  # private|unlisted|public


class ChatNode(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "chat_nodes"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    # NULL for root; self-FK, fine inline in one CREATE TABLE (all columns -
    # including this table's own `id` - are known within a single statement).
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_nodes.id", ondelete="CASCADE"), nullable=True
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)  # 'user' | 'assistant' | 'system'
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tool_calls: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)  # see contracts §4.6
    memory_mode: Mapped[str] = mapped_column(Text, nullable=False, server_default="isolated")  # isolated|shared


class Activity(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """The atomic unit that gets dragged into a paper. `payload` must contain
    enough state to re-render the activity standalone (contracts §3) - a
    plot activity storing only an image URL would make living papers (M4)
    impossible."""

    __tablename__ = "activities"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    chat_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_nodes.id"), nullable=True
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # 'plot'|'selection'|'chat_exchange'|'image'|'link'
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)  # kind-specific
