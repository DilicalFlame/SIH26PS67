"""Chat endpoints (contracts §4.6). Paths are frozen as
/projects/{project_id}/chat/... so no prefix is set here — routes land in
#69/#71/#198.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["chat"])
