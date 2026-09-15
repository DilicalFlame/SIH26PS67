from __future__ import annotations

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import ARRAY, TIMESTAMP, Double, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, UpdatedAtMixin, UUIDPrimaryKeyMixin


class CatalogLayer(UUIDPrimaryKeyMixin, CreatedAtMixin, UpdatedAtMixin, Base):
    """The "what data do I have, and where" table — the agent's world model
    (contracts §3), not optional plumbing. Populate it properly from day 1."""

    __tablename__ = "catalog_layers"

    layer_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # 'vector' | 'scalar_field' | 'point_collection'
    variable: Mapped[str | None] = mapped_column(Text, nullable=True)
    units: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    bbox: Mapped[str | None] = mapped_column(Geometry(geometry_type="POLYGON", srid=4326), nullable=True)
    depths: Mapped[list[float] | None] = mapped_column(ARRAY(Double), nullable=True)
    times: Mapped[list[datetime] | None] = mapped_column(ARRAY(TIMESTAMP(timezone=True)), nullable=True)
    value_min: Mapped[float | None] = mapped_column(Double, nullable=True)
    value_max: Mapped[float | None] = mapped_column(Double, nullable=True)
    default_colormap: Mapped[str] = mapped_column(Text, nullable=False, server_default="thermal")
    object_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)
    attribution: Mapped[str | None] = mapped_column(Text, nullable=True)
    licence: Mapped[str | None] = mapped_column(Text, nullable=True)
