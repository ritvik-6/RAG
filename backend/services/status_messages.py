import random

STATUS_MESSAGES = {
    "routing_start": [
        "Understanding your question",
        "Figuring out how to best answer this",
        "Reviewing what you're asking",
    ],
    "rag_tool_start": [
        "Reading through your documents",
        "Digging into your uploaded files",
        "Scanning your documents",
    ],
    "catalog_tool_start": [
        "Checking your document library",
        "Looking up your uploaded files",
    ],
    "query_rewrite": [
        "Refining the search — trying a different phrasing",
        "Adjusting the question based on our conversation",
        "Rephrasing to search more precisely",
    ],
    "query_decomposition": [
        "Breaking this into smaller questions",
        "This has a few parts — splitting it up",
        "Untangling this into sub-questions",
    ],
    "sub_question_search": [
        'Searching your documents for "{query}"',
        'Looking for "{query}" in your files',
        'Running a search for "{query}"',
    ],
    "multi_part_progress": [
        "Looking at part {n} of {total}",
        "Working through {n}/{total}",
    ],
    "synthesis": [
        "Putting together a response",
        "Drafting your answer",
        "Writing this up based on what I found",
    ],
}

def truncate_query(query: str, limit: int = 60) -> str:
    """Truncate at a word boundary, only if needed, with ellipsis."""
    # Clean double quotes from query
    query = query.replace('"', '').strip()
    if len(query) <= limit:
        return query
    # Truncate to limit
    truncated = query[:limit]
    # Check if we cut mid-word by checking if there's a space or if we are at word boundary
    if " " in truncated:
        truncated = truncated.rsplit(" ", 1)[0]
    return f"{truncated}…"

def pick_status(stage: str, last_message: str | None = None, **kwargs) -> str:
    if "query" in kwargs:
        kwargs["query"] = truncate_query(kwargs["query"])
    pool = STATUS_MESSAGES[stage]
    candidates = [m.format(**kwargs) for m in pool]
    choices = [c for c in candidates if c != last_message] or candidates
    return random.choice(choices)
