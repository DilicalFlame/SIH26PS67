from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import TIMESTAMP, Double, ForeignKey, Integer, SmallInteger, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class Platform(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "platforms"

    platform_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)  # WMO id for Argo
    platform_type: Mapped[str] = mapped_column(Text, nullable=False)  # 'argo' | 'glider' | 'ctd' | 'mooring'
    name: Mapped[str | None] = mapped_column(Text, nullable=True)


class Profile(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "profiles"

    platform_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platforms.id", ondelete="CASCADE"), nullable=False
    )
    observed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    location: Mapped[str] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    cycle_number: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ProfileLevel(UUIDPrimaryKeyMixin, Base):
    """No created_at/updated_at - contracts §3 lists this table without
    either, unlike the blanket "every table gets ..." sentence."""

    __tablename__ = "profile_levels"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    depth: Mapped[float] = mapped_column(Double, nullable=False)
    temperature: Mapped[float | None] = mapped_column(Double, nullable=True)
    salinity: Mapped[float | None] = mapped_column(Double, nullable=True)
    pressure: Mapped[float | None] = mapped_column(Double, nullable=True)
    qc_flag: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
