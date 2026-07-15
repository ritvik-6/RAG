from langchain_core.tools import tool
from langchain.agents import create_agent
from backend.config import ROUTER_MODEL
from backend.prompts import get_orchestrator_prompt

from backend.services.agents.rag_worker import run_rag_sub_agent
from backend.services.agents.catalog_worker import run_catalog_sub_agent


def create_orchestrator_agent(user_id: str, collection_name: str,history: list[dict] = None):
    """Compiles the parent supervisor engine with decoupled sub-agent tools."""

    @tool(return_direct=True)
    async def rag_sub_agent(query: str) -> str:
        """Call this for ANY question about the content, facts, people, dates,
        numbers, or subject matter discussed INSIDE the user's uploaded documents.
        This is the default tool — use it whenever unsure."""
        print(f"[ROUTING] user={user_id} tool=rag_sub_agent query={query!r}")
        return await run_rag_sub_agent(query, collection_name, user_id, history=history)

    @tool(return_direct=True)
    async def catalog_sub_agent(query: str) -> str:
        """Call ONLY when the user explicitly asks about their uploaded file list
        itself — e.g. 'what files have I uploaded', 'how many documents do I have',
        'when did I upload X'. Do NOT call this for questions about the content or
        meaning of a document, even if the words 'file' or 'document' appear."""
        print(f"[ROUTING] user={user_id} tool=catalog_sub_agent query={query!r}")
        return await run_catalog_sub_agent(user_id)

    tools = [rag_sub_agent, catalog_sub_agent]
    system_prompt = get_orchestrator_prompt(user_id)

    return create_agent(ROUTER_MODEL, tools, system_prompt=system_prompt)