"""POST /projects/{id}/chat/nodes (SSE), GET .../chat/tree (contracts §4.6/§4.7)."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import Field

from app.schemas.common import CamelModel

ChatRole = Literal["user", "assistant", "system"]


class ToolCall(CamelModel):
    tool: str
    args: dict[str, Any]


class ChatNode(CamelModel):
    node_id: str
    parent_id: str | None
    role: ChatRole
    content: str
    tool_calls: list[ToolCall] | None
    created_at: str


class ChatNodeCreateRequest(CamelModel):
    parent_id: str | None
    content: str


# --- UiAction (contracts §4.7 / §5.4) -----------------------------------


class SetMapLayerAction(CamelModel):
    type: Literal["set_map_layer"]
    layer_id: str
    depth_index: int | None = None
    time_index: int | None = None
    colormap: str | None = None
    value_range: tuple[float, float] | None = None


class FlyToAction(CamelModel):
    type: Literal["fly_to"]
    bbox: tuple[float, float, float, float]


class OpenProfileAction(CamelModel):
    type: Literal["open_profile"]
    profile_id: str


UiAction = Annotated[
    SetMapLayerAction | FlyToAction | OpenProfileAction,
    Field(discriminator="type"),
]


# --- SSE event types (contracts §4.6) -----------------------------------


class NodeCreatedEvent(CamelModel):
    type: Literal["node_created"]
    node_id: str
    parent_id: str | None
    role: ChatRole


class TokenEvent(CamelModel):
    type: Literal["token"]
    node_id: str
    text: str


class ToolCallEvent(CamelModel):
    type: Literal["tool_call"]
    node_id: str
    tool: str
    args: dict[str, Any]


class UiActionEvent(CamelModel):
    type: Literal["ui_action"]
    action: UiAction


class DoneEvent(CamelModel):
    type: Literal["done"]
    node_id: str


class ChatErrorEvent(CamelModel):
    type: Literal["error"]
    code: str
    message: str


ChatSSEEvent = Annotated[
    NodeCreatedEvent | TokenEvent | ToolCallEvent | UiActionEvent | DoneEvent | ChatErrorEvent,
    Field(discriminator="type"),
]
