"""Chat endpoints (contracts §4.6). Paths are frozen as
/projects/{project_id}/chat/... so no prefix is set here.

The SSE stub replays fixtures/chat/sse_events.json verbatim, validated
against the frozen event union - no token pacing, no build_context(), no
Groq call. Those are #68/#70/#71's job; this just proves the six event
types round-trip over the wire so #74 (chat panel) can be built against it.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import TypeAdapter

from app.core.fixtures import load_fixture
from app.schemas.chat import ChatNode, ChatNodeCreateRequest, ChatSSEEvent

router = APIRouter(tags=["chat"])

_sse_event_adapter: TypeAdapter[ChatSSEEvent] = TypeAdapter(ChatSSEEvent)


async def _sse_stream() -> AsyncIterator[str]:
    for raw_event in load_fixture("chat/sse_events.json"):
        event = _sse_event_adapter.validate_python(raw_event)
        # exclude_unset, not exclude_none: UiAction's optional fields
        # (colormap, valueRange, ...) are TS `?:` - absent, not null - while
        # node_created's parentId is TS `string | null` - present and null
        # is the correct wire value there. Only a fixture key's presence in
        # the source JSON, not its value, should decide inclusion.
        yield f"data: {event.model_dump_json(by_alias=True, exclude_unset=True)}\n\n"


@router.post(
    "/projects/{project_id}/chat/nodes",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def create_chat_node(project_id: str, body: ChatNodeCreateRequest) -> StreamingResponse:
    return StreamingResponse(_sse_stream(), media_type="text/event-stream")


@router.get("/projects/{project_id}/chat/tree", response_model=list[ChatNode])
async def get_chat_tree(project_id: str) -> list[ChatNode]:
    return [ChatNode.model_validate(raw) for raw in load_fixture("chat/tree.json")]
