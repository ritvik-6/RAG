from langchain_core.tools import tool
from langchain.agents import create_agent
from backend.config import MODEL
from backend.prompts import get_orchestrator_prompt

from backend.services.agents.rag_worker import run_rag_sub_agent
from backend.services.agents.catalog_worker import run_catalog_sub_agent


def create_orchestrator_agent(user_id: str, collection_name: str):
    """Compiles the parent supervisor engine with decoupled sub-agent tools."""

    @tool
    async def rag_sub_agent(query: str) -> str:
        """Call this agent strictly to search, extract, and read text insights
        from within the user's uploaded physical document scopes."""
        import asyncio
        result = run_rag_sub_agent(query, collection_name)
        if asyncio.iscoroutine(result):
            return await result
        return result

    @tool
    async def catalog_sub_agent(query: str) -> str:
        """Call this agent immediately if the user is checking document status,
        upload dates, counts, names, or file inventory items."""
        return await run_catalog_sub_agent(user_id)

    tools = [rag_sub_agent, catalog_sub_agent]
    system_prompt = get_orchestrator_prompt(user_id)

    return create_agent(MODEL, tools, system_prompt=system_prompt)