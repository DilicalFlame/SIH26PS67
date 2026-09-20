"""Sanity checks that app/models/ matches contracts §3's table list. Doesn't
touch a database - these models are kept matching the hand-written migration
by hand (see that migration's docstring), so this is what catches the two
from silently drifting apart."""

from __future__ import annotations

from app.models import Base

EXPECTED_TABLES = {
    "users",
    "sessions",
    "catalog_layers",
    "platforms",
    "profiles",
    "profile_levels",
    "projects",
    "chat_nodes",
    "activities",
    "papers",
    "paper_blocks",
    "citations",
}


def test_every_contract_table_has_a_model() -> None:
    assert set(Base.metadata.tables.keys()) == EXPECTED_TABLES


def test_profile_levels_has_no_timestamp_columns() -> None:
    """Contracts §3 lists this table without created_at/updated_at, unlike
    the blanket "every table gets ..." sentence - the one table it's easiest
    to get wrong by applying that sentence uniformly."""
    columns = set(Base.metadata.tables["profile_levels"].columns.keys())
    assert "created_at" not in columns
    assert "updated_at" not in columns


def test_tables_with_updated_at_match_contract() -> None:
    tables_with_updated_at = {
        name for name, table in Base.metadata.tables.items() if "updated_at" in table.columns
    }
    assert tables_with_updated_at == {"users", "catalog_layers", "projects", "papers", "paper_blocks"}


def test_chat_nodes_parent_id_is_nullable_self_reference() -> None:
    chat_nodes = Base.metadata.tables["chat_nodes"]
    parent_id = chat_nodes.columns["parent_id"]
    assert parent_id.nullable is True
    fk = next(iter(parent_id.foreign_keys))
    assert fk.target_fullname == "chat_nodes.id"
