"""
WasteWise AI — AI Municipal Decision Agent Router
POST /api/v1/agent/query — Officer submits a natural language question.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import require_role, TokenPayload
from app.ai.municipal_agent import MunicipalDecisionAgent, AgentResponse

router = APIRouter()


class AgentQueryRequest(BaseModel):
    query: str


@router.post("/query", response_model=AgentResponse)
async def agent_query(
    payload: AgentQueryRequest,
    current_user: TokenPayload = Depends(require_role("officer", "admin")),
):
    """
    AI Municipal Decision Assistant: receives a natural language question and
    returns a grounded, explainable answer with data citations.
    """
    return await MunicipalDecisionAgent.process_query(
        query=payload.query,
        officer_id=current_user.sub,
    )
