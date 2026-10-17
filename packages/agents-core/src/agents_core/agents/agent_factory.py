import base64
import importlib
import logging
import os
from typing import Any, Dict, List, Optional, Set

from agents_core.agents.config import (
    AGENT_METADATA,
    DEFAULT_AGENT_ID,
    DESKTOP_ENVIRONMENT_PROMPT,
    SYSTEM_PROMPTS,
    TASK_TOOL_DESCRIPTION,
    UNIFIED_SYSTEM_PROMPT,
    WEB_ENVIRONMENT_PROMPT,
    WRITE_TODOS_TOOL_DESCRIPTION,
    AgentConfig,
    FileContext,
)
from agents_core.agents.skill_loader import SandboxSkillSync, load_builtin_skills
from agents_core.constants.features import (
    FEATURE_CONNECTORS,
    FEATURE_GITHUB,
    FEATURE_RAG,
)
from agents_core.models.chat import Artifact, ChatAttachment
from agents_core.services.s3_service import S3Service
from agents_core.tools.chat.skill_tool import (
    get_load_skill_tool,
    get_save_user_skill_tool,
)
from agents_core.tools.sandbox.daytona_tools import (
    get_execute_code_tool,
    get_list_sandbox_files_tool,
    get_upload_sandbox_file_tool,
    install_sandbox_dependencies,
)
from composio import Composio
from composio_langchain import LangchainProvider
from daytona import CreateSandboxFromSnapshotParams, Daytona
from deepagents.middleware.patch_tool_calls import PatchToolCallsMiddleware
from deepagents.middleware.subagents import SubAgentMiddleware
from langchain.agents import create_agent as build_agent_graph
from langchain.agents.middleware import (
    ClearToolUsesEdit,
    ContextEditingMiddleware,
    HumanInTheLoopMiddleware,
    SummarizationMiddleware,
    TodoListMiddleware,
)
from langchain.chat_models import init_chat_model
from langchain_anthropic.middleware import AnthropicPromptCachingMiddleware
from langchain_core.tools import BaseTool, tool
from langchain_daytona import DaytonaSandbox
from langgraph.checkpoint.redis import RedisSaver

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

logger = logging.getLogger(__name__)

CONTEXT_EDIT_TRIGGER_TOKENS = 50_000
CONTEXT_EDIT_KEEP_TOOL_RESULTS = 5

# Stateful checkpointer for cross-request chat history, backed by Redis so it
# survives past a single process — any pod can resume any chat's LangGraph
# state, not just the one that happened to handle the previous turn.
#
# Built lazily (on first agent creation) rather than at import time: this
# module is imported by things that don't need Redis at all (Alembic
# migrations, one-off scripts, test collection), and RedisSaver's
# constructor connects eagerly, so importing it unconditionally would make
# every one of those hard-depend on Redis being reachable.
_checkpointer_instance: Optional[RedisSaver] = None


def get_global_checkpointer() -> RedisSaver:
    global _checkpointer_instance
    if _checkpointer_instance is None:
        saver = RedisSaver(redis_url=REDIS_URL)
        saver.setup()
        _checkpointer_instance = saver
    return _checkpointer_instance


_SYNC_CHUNK_SIZE = 60_000  # base64 chars per chunk — safely below shell ARG_MAX


def _write_bytes_to_sandbox(
    backend: DaytonaSandbox, content_bytes: bytes, dest_path: str
):
    """Write binary content into the sandbox at dest_path.

    Uses a chunked Python-based approach so that files larger than ~45 KB
    (where a single ``echo … | base64 -d`` would approach ARG_MAX limits)
    are written reliably regardless of size.
    """
    b64_data = base64.b64encode(content_bytes).decode("utf-8")

    if len(b64_data) <= _SYNC_CHUNK_SIZE:
        # Small file: single command is fine
        backend.execute(f"echo '{b64_data}' | base64 -d > {dest_path}")
        return

    # Large file: write in chunks via python3 to stay well under ARG_MAX
    # First chunk — creates / truncates the destination file
    first_chunk = b64_data[:_SYNC_CHUNK_SIZE]
    backend.execute(
        f"python3 -c \"import base64; open('{dest_path}', 'wb').write(base64.b64decode('{first_chunk}'))\""
    )
    # Remaining chunks — append
    for offset in range(_SYNC_CHUNK_SIZE, len(b64_data), _SYNC_CHUNK_SIZE):
        chunk = b64_data[offset : offset + _SYNC_CHUNK_SIZE]
        backend.execute(
            f"python3 -c \"import base64; open('{dest_path}', 'ab').write(base64.b64decode('{chunk}'))\""
        )


def sync_chat_artifacts_to_sandbox(chat_id: str, backend: DaytonaSandbox):
    """Restores previous chat attachments and the latest version of each artifact from S3 back into the sandbox."""
    try:
        s3 = S3Service()

        # Fetch all attachments and artifacts for this chat
        attachments = ChatAttachment.query.filter_by(chat_id=chat_id).all()
        artifacts = Artifact.query.filter_by(chat_id=chat_id).all()

        to_restore = []  # List of (filename, s3_key)
        seen_keys = set()

        # Add attachments (no versioning concept, add all unique)
        for att in attachments:
            if att.s3_key and att.s3_key not in seen_keys:
                to_restore.append((att.filename, att.s3_key))
                seen_keys.add(att.s3_key)

        # For artifacts, keep only the latest version (highest seq) per filename
        filename_to_latest: dict = {}
        for art in artifacts:
            fname = art.filename or art.title or "unnamed_artifact"
            existing = filename_to_latest.get(fname)
            if existing is None or (art.seq or 0) > (existing.seq or 0):
                filename_to_latest[fname] = art

        for fname, art in filename_to_latest.items():
            metadata = art.artifact_metadata or {}
            s3_key = metadata.get("s3_key")
            if s3_key and s3_key not in seen_keys:
                to_restore.append((fname, s3_key))
                seen_keys.add(s3_key)

        if not to_restore:
            return

        logger.info(
            f"Syncing {len(to_restore)} files back to sandbox for chat {chat_id}"
        )

        for filename, s3_key in to_restore:
            try:
                content_bytes = s3.get_file_content(s3_key)
                if content_bytes:
                    safe_filename = filename.replace(" ", "_")
                    _write_bytes_to_sandbox(
                        backend, content_bytes, f"./{safe_filename}"
                    )
                    logger.info(
                        f"Restored {filename} ({len(content_bytes)} bytes) to sandbox"
                    )
            except Exception as e:
                logger.warning(f"Failed to restore {filename} to sandbox: {e}")

    except Exception as e:
        logger.error(f"Error in sync_chat_artifacts_to_sandbox: {e}")


def safe_import_tool(
    module_path: str, function_name: str, *args, **kwargs
) -> List[BaseTool]:
    """Helper to safely import and execute tool fetch functions."""
    try:
        module = importlib.import_module(module_path)
        func = getattr(module, function_name)
        tool = func(*args, **kwargs)
        if hasattr(tool, "__iter__") and not isinstance(tool, BaseTool):
            return list(tool)
        return [tool] if tool else []
    except (ImportError, AttributeError, Exception) as e:
        logger.warning(f"Failed to load tools from {module_path}.{function_name} — {e}")
        return []


def get_base_tools(chat_id: str) -> List[BaseTool]:
    """Get the base tools available to the main agent."""
    tools = []
    import_list = [
        ("agents_core.tools.chat.ask_user_tool", "get_ask_user_tool", []),
        ("agents_core.tools.chat.render_chart_tool", "get_render_chart_tool", []),
        ("agents_core.tools.files.file_tools", "get_file_read_tool", [chat_id]),
        ("agents_core.tools.web.search_tools", "get_web_tools", []),
        ("agents_core.tools.web.crawler_tools", "get_crawler_tools", []),
    ]
    for module_path, func_name, args in import_list:
        tools.extend(safe_import_tool(module_path, func_name, *args))
    return tools


def get_finance_tools() -> List[BaseTool]:
    """Get finance-specific tools (stocks, news, financial sheets)."""
    tools = []
    import_list = [
        ("agents_core.tools.stocks.yahoo_finance_tools", "get_stock_quote_tool", []),
        (
            "agents_core.tools.stocks.yahoo_finance_tools",
            "get_yahoo_finance_quote_tool",
            [],
        ),
        (
            "agents_core.tools.stocks.yahoo_finance_tools",
            "get_yahoo_finance_quote_summary_tool",
            [],
        ),
        (
            "agents_core.tools.stocks.yahoo_finance_tools",
            "get_yahoo_finance_historical_tool",
            [],
        ),
        (
            "agents_core.tools.stocks.yahoo_finance_tools",
            "get_yahoo_finance_search_tool",
            [],
        ),
        (
            "agents_core.tools.stocks.financial_sheets_tools",
            "get_financial_sheets_tool",
            [],
        ),
        ("agents_core.tools.stocks.news_tools", "get_stock_news_tool", []),
    ]
    for module_path, func_name, args in import_list:
        tools.extend(safe_import_tool(module_path, func_name, *args))
    return tools


def get_document_tools(chat_id: str, include_rag: bool = True) -> List[BaseTool]:
    """Get document-specific tools (e.g. analyze data, RAG)."""
    tools = []
    tools.extend(
        safe_import_tool(
            "agents_core.tools.files.file_tools", "get_analyze_data_tool", [chat_id]
        )
    )
    if include_rag:
        tools.extend(
            safe_import_tool(
                "agents_core.tools.rag.rag_tools", "get_rag_tools", [chat_id]
            )
        )
    return tools


def get_legal_tools() -> List[BaseTool]:
    tools = []
    for module_path, func_name, args in [
        ("agents_core.tools.legal.contract_tools", "get_contract_tools", []),
        (
            "agents_core.tools.legal.legal_research_tools",
            "get_legal_research_tools",
            [],
        ),
    ]:
        tools.extend(safe_import_tool(module_path, func_name, *args))
    return tools


def get_compliance_tools() -> List[BaseTool]:
    tools = []
    for module_path, func_name, args in [
        ("agents_core.tools.compliance.sanctions_tools", "get_sanctions_tools", []),
        (
            "agents_core.tools.compliance.regulatory_feed_tools",
            "get_regulatory_feed_tools",
            [],
        ),
        ("agents_core.tools.compliance.audit_tools", "get_audit_tools", []),
    ]:
        tools.extend(safe_import_tool(module_path, func_name, *args))
    return tools


def get_market_data_tools() -> List[BaseTool]:
    tools = []
    for module_path, func_name, args in [
        ("agents_core.tools.finance.market_data_tools", "get_market_data_tools", []),
    ]:
        tools.extend(safe_import_tool(module_path, func_name, *args))
    return tools


def get_sec_edgar_tools() -> List[BaseTool]:
    tools = []
    tools.extend(
        safe_import_tool(
            "agents_core.tools.finance.sec_edgar_tools", "get_sec_edgar_tools"
        )
    )
    return tools


def get_legal_db_tools() -> List[BaseTool]:
    tools = []
    tools.extend(
        safe_import_tool("agents_core.tools.legal.legal_db_tools", "get_legal_db_tools")
    )
    return tools


def get_reg_feeds_tools() -> List[BaseTool]:
    tools = []
    tools.extend(
        safe_import_tool(
            "agents_core.tools.compliance.regulatory_feed_tools",
            "get_regulatory_feed_tools",
        )
    )
    return tools


def get_workflow_tools() -> List[BaseTool]:
    tools = []
    tools.extend(
        safe_import_tool(
            "agents_core.tools.shared.workflow_tools", "get_workflow_tools"
        )
    )
    return tools


def get_composio_tools(chat_id: str, user_id: Optional[str] = None) -> List[BaseTool]:
    """Get Composio tools for the user associated with this chat."""
    try:
        if not user_id:
            return []
        composio_client = Composio(provider=LangchainProvider())
        connections = composio_client.connected_accounts.list(user_ids=[user_id])
        active_toolkits = []
        for conn in connections.items:
            slug = getattr(getattr(conn, "toolkit", None), "slug", None)
            if slug:
                active_toolkits.append(slug)
        if not active_toolkits:
            return []
        return composio_client.tools.get(user_id=user_id, toolkits=active_toolkits)
    except Exception as e:
        logger.exception("Error loading Composio tools: %s", e)
        return []


def build_skills_context(user_skills: List[Dict]) -> str:
    """List skills by name and description; full instructions load via load_skill."""
    lines = [
        f"- {skill['name']}: {skill['description']}"
        for skill in load_builtin_skills().values()
    ]
    for skill in user_skills:
        line = f"- /{skill.get('name', 'unnamed')} (user skill)"
        if skill.get("description"):
            line += f": {skill['description']}"
        lines.append(line)
    if not lines:
        return ""
    return (
        "## Skills\n"
        "Before a task that matches a skill, or when the user invokes /{skill-name}, call "
        "`load_skill` with its name and follow its instructions.\n" + "\n".join(lines)
    )


def build_mcp_stub_tools(mcp_tools: List[Dict]) -> List[BaseTool]:
    """
    Create LangChain stub tools for each MCP tool definition.
    Tools are named 'mcp__{serverName}__{toolName}' so the Electron client
    can route the call back to the correct MCP server.
    Each stub uses langgraph interrupt() to delegate execution to the desktop client.
    """
    import uuid
    from typing import Any

    from langgraph.types import interrupt
    from pydantic import create_model

    stubs: List[BaseTool] = []
    for mcp_tool in mcp_tools:
        server_name = mcp_tool.get("serverName", "unknown")
        tool_name = mcp_tool.get("name", "")
        description = mcp_tool.get("description", f"MCP tool from server {server_name}")
        input_schema = mcp_tool.get("inputSchema", {})

        if not tool_name:
            continue

        namespaced = f"mcp__{server_name}__{tool_name}"

        # Build a minimal Pydantic model from the JSON schema properties
        properties = (
            input_schema.get("properties", {}) if isinstance(input_schema, dict) else {}
        )
        field_definitions: Dict[str, Any] = {
            k: (Optional[str], None) for k in properties
        }
        DynamicInput = create_model(f"{namespaced}_input", **field_definitions)

        # Capture namespaced name in closure
        _namespaced = namespaced

        @tool(_namespaced, args_schema=DynamicInput)
        def _stub(**kwargs) -> str:
            result = interrupt(
                {
                    "type": "client_tool_request",
                    "request_id": str(uuid.uuid4()),
                    "tool_name": _namespaced,
                    "tool_input": kwargs,
                }
            )
            if result is None:
                return '{"error": "No result received from desktop client"}'
            return result if isinstance(result, str) else str(result)

        _stub.description = description  # type: ignore[attr-defined]
        stubs.append(_stub)

    return stubs


def _clone_repo_into_sandbox(backend: "DaytonaSandbox", github_context: Dict) -> bool:
    """Clone the linked GitHub repo into ./repo/ inside the sandbox.

    Returns True on success so the caller can update the system prompt.
    Uses a shallow clone (--depth 1) for speed.  If ./repo already contains
    a checkout of the same repo we skip the clone entirely.
    """
    # Keys arrive snake_case after the camelCase→snake_case middleware converts the request body
    full_name = github_context.get("full_name", "") or github_context.get(
        "fullName", ""
    )
    branch = github_context.get("branch", "main")
    token = github_context.get("access_token", "")

    if not full_name or not token:
        logger.warning(
            "_clone_repo_into_sandbox: skipped — full_name=%r token_present=%s",
            full_name,
            bool(token),
        )
        return False

    logger.info("_clone_repo_into_sandbox: cloning %s @ %s", full_name, branch)

    try:
        # Check if repo is already cloned (same origin)
        check = backend.execute(
            "git -C ./repo remote get-url origin 2>/dev/null || echo NONE"
        )
        existing_remote = getattr(check, "output", "NONE").strip()
        if full_name in existing_remote:
            # Already cloned — just fetch + checkout the requested branch
            backend.execute(f"git -C ./repo fetch --depth 1 origin {branch} 2>&1")
            backend.execute(f"git -C ./repo checkout {branch} 2>&1")
            logger.info(
                f"Repo {full_name} already present — updated to branch {branch}"
            )
            return True

        # Fresh clone into ./repo/
        clone_url = f"https://x-access-token:{token}@github.com/{full_name}.git"
        result = backend.execute(
            f"git clone --depth 1 --branch {branch} {clone_url} ./repo 2>&1"
        )
        exit_code = getattr(result, "exit_code", -1)
        output = getattr(result, "output", "")
        if exit_code != 0:
            logger.warning(f"git clone failed (exit {exit_code}): {output[:500]}")
            return False

        logger.info(f"Cloned {full_name}@{branch} into sandbox ./repo/")
        return True
    except Exception as e:
        logger.warning(f"_clone_repo_into_sandbox error: {e}")
        return False


def create_agent(
    agent_id: str,
    provider: str,
    model_id: str,
    chat_id: str,
    files: Optional[List[FileContext]] = None,
    client_tools_enabled: bool = False,
    user_id: Optional[str] = None,
    user_skills: Optional[List[Dict]] = None,
    mcp_tools: Optional[List[Dict]] = None,
    user_api_keys: Optional[Dict[str, str]] = None,
    github_context: Optional[Dict] = None,
    disabled_features: Optional[Set[str]] = None,
):
    """
    Create the single unified LangGraph agent using deepagents.

    disabled_features: feature flags the user's organization has switched off
    (see constants/features.py); their tools are left out of the agent.
    """
    ag_config = AgentConfig.from_env(
        provider=provider, model=model_id, user_api_keys=user_api_keys
    )
    user_skills = user_skills or []
    mcp_tools = mcp_tools or []
    disabled_features = disabled_features or set()
    include_rag = FEATURE_RAG not in disabled_features
    if FEATURE_GITHUB in disabled_features:
        github_context = None

    # 1. Assemble tools based on agent's declared tool groups
    meta = AGENT_METADATA.get(agent_id, AGENT_METADATA[DEFAULT_AGENT_ID])
    tool_groups = meta.get("tools", ["base"])

    _TOOL_LOADERS = {
        "base": lambda: get_base_tools(chat_id),
        "finance": get_finance_tools,
        "legal": get_legal_tools,
        "compliance": get_compliance_tools,
        "document": lambda: get_document_tools(chat_id, include_rag),
        "market_data": get_market_data_tools,
        "sec_edgar": get_sec_edgar_tools,
        "legal_db": get_legal_db_tools,
        "reg_feeds": get_reg_feeds_tools,
        "workflow": get_workflow_tools,
        "sanctions": lambda: [
            t
            for t in safe_import_tool(
                "agents_core.tools.compliance.sanctions_tools", "get_sanctions_tools"
            )
        ],
    }

    tools: List[BaseTool] = []
    seen_names: set = set()

    for group in tool_groups:
        loader = _TOOL_LOADERS.get(group)
        new_tools = loader() if loader else []
        for t in new_tools:
            if t.name not in seen_names:
                tools.append(t)
                seen_names.add(t.name)

    # Composio tools for the user's connected accounts, unless switched off
    if FEATURE_CONNECTORS not in disabled_features:
        for t in get_composio_tools(chat_id, user_id):
            if t.name not in seen_names:
                tools.append(t)
                seen_names.add(t.name)

    # Optional client filesystem execution tools
    if client_tools_enabled:
        fs_tools = safe_import_tool("agents_core.tools.files.fs_tools", "get_fs_tools")
        existing_names = set(t.name for t in tools)
        for t in fs_tools:
            if t.name not in existing_names:
                tools.append(t)
                existing_names.add(t.name)

    # Register MCP tools as client-delegated stubs (desktop only)
    if mcp_tools and client_tools_enabled:
        mcp_stubs = build_mcp_stub_tools(mcp_tools)
        existing_names = set(t.name for t in tools)
        for t in mcp_stubs:
            if t.name not in existing_names:
                tools.append(t)
                existing_names.add(t.name)
        logger.info("Registered %d MCP stub tool(s) from desktop", len(mcp_stubs))

    # 2. Subagents configuration
    finance_subagent = {
        "name": "finance_analyst",
        "description": "Analyzes stock market data, fetches stock quotes, historical data, financial sheets, and news.",
        "system_prompt": "You are a financial analyst. Fetch requested stock data, fundamentals, or news accurately. Return a concise summary to the main agent.",
        "tools": get_finance_tools(),
    }

    research_subagent = {
        "name": "researcher",
        "description": "Reads and analyzes documents, and searches files using RAG.",
        "system_prompt": "You are a thorough researcher. Look into the documents and files context using the RAG and data analysis tools to answer questions.",
        "tools": get_document_tools(chat_id, include_rag),
    }

    # 3. Sandbox backend
    try:
        params = CreateSandboxFromSnapshotParams(
            ephemeral=True,
            auto_stop_interval=5,  # The ephemeral sandbox will be deleted after 5 minutes of inactivity
        )
        sandbox = Daytona().create(params=params)
        backend = DaytonaSandbox(sandbox=sandbox)

        # Install skills dependencies on sandbox boot
        install_sandbox_dependencies(backend)

        # Register the upload and execute tools explicitly
        tools.append(get_upload_sandbox_file_tool(backend, chat_id))
        skill_sync = SandboxSkillSync(backend)
        tools.append(get_execute_code_tool(backend, chat_id, skill_sync))
        tools.append(get_list_sandbox_files_tool(backend))

        # 4. Restore previous artifacts to the sandbox
        sync_chat_artifacts_to_sandbox(chat_id, backend)

        # 5. Clone GitHub repo into sandbox if a GitHub context is active
        if (
            github_context
            and github_context.get("type") == "github"
            and github_context.get("access_token")
            and (github_context.get("full_name") or github_context.get("fullName"))
        ):
            cloned = _clone_repo_into_sandbox(backend, github_context)
            if cloned:
                github_context = dict(github_context)
                github_context["cloned"] = True

    except Exception as e:
        logger.warning(f"Failed to initialize Daytona sandbox: {e}")
        sandbox = None
        backend = None
        skill_sync = None

    tools.append(get_load_skill_tool(user_skills, skill_sync))
    if user_id:
        tools.append(get_save_user_skill_tool(user_id))

    # 5. Agent Checkpointer
    checkpointer = get_global_checkpointer()

    _provider_env_map = {
        "google": "GOOGLE_API_KEY",
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "groq": "GROQ_API_KEY",
        "mistral": "MISTRAL_API_KEY",
        "together": "TOGETHER_API_KEY",
        "fireworks": "FIREWORKS_API_KEY",
        "cohere": "COHERE_API_KEY",
        "xai": "XAI_API_KEY",
    }
    if ag_config.api_key and ag_config.provider in _provider_env_map:
        os.environ[_provider_env_map[ag_config.provider]] = ag_config.api_key

    # LangChain init_chat_model provider identifiers — must use "provider:model" format
    _provider_prefix = {
        "google": "google_genai",
        "openai": "openai",
        "anthropic": "anthropic",
        "groq": "groq",
        "mistral": "mistralai",
        "together": "together",
        "fireworks": "fireworks",
        "cohere": "cohere",
        "xai": "xai",
        "ollama": "ollama",
    }
    prefix = _provider_prefix.get(ag_config.provider, ag_config.provider)
    provider_str = f"{prefix}:{ag_config.model}"

    # Generate system prompt — use agent-specific prompt if defined
    final_prompt = SYSTEM_PROMPTS.get(agent_id, UNIFIED_SYSTEM_PROMPT)

    final_prompt += "\n\n" + (
        DESKTOP_ENVIRONMENT_PROMPT if client_tools_enabled else WEB_ENVIRONMENT_PROMPT
    )

    # Append skills context
    skills_ctx = build_skills_context(user_skills)
    if skills_ctx:
        final_prompt += f"\n\n{skills_ctx}"

    # Inject repository context
    if github_context:
        ctx_type = github_context.get("type", "github")
        repo_name = (
            github_context.get("full_name")
            or github_context.get("fullName")
            or github_context.get("repo_name")
            or github_context.get("repoName", "")
        )
        branch = github_context.get("branch", "")
        remote = github_context.get("remote", "")
        workspace = github_context.get("workspace_path", "") or github_context.get(
            "workspacePath", ""
        )
        is_cloned = github_context.get("cloned", False)

        ctx_lines = ["## Active Repository Context"]
        if ctx_type == "local":
            ctx_lines.append("Type: Local git repository (Desktop)")
            if workspace:
                ctx_lines.append(f"Workspace path: {workspace}")
            if repo_name:
                ctx_lines.append(f"Repository: {repo_name}")
            if branch:
                ctx_lines.append(f"Current branch: **{branch}**")
            ctx_lines.append(
                "\nThe user's local workspace IS this repository. "
                "Use `list_files`, `grep_files`, `read_file`, `git_status`, `git_log`, `git_diff`, "
                "`git_branch` to explore and understand the code. "
                "Answer branch/status questions using these tools — do NOT look for the repo in the sandbox."
            )
        else:
            ctx_lines.append("Type: GitHub repository")
            if repo_name:
                ctx_lines.append(f"Repository: {repo_name}")
            if branch:
                ctx_lines.append(f"Current branch: **{branch}**")
            if remote:
                ctx_lines.append(f"Remote: {remote}")
            if is_cloned or github_context.get("access_token"):
                ctx_lines.append(
                    f"\nThe repository has been cloned into `./repo/` inside the sandbox. "
                    f"Use `execute_code` with paths like `./repo/src/...` to read files, run grep, etc. "
                    f"You can also run `git -C ./repo log --oneline -10`, `git -C ./repo branch -a`, "
                    f"`git -C ./repo diff HEAD` etc. inside `execute_code`."
                )
            else:
                ctx_lines.append(
                    "\nAnswer questions about branch/repo using the context above. "
                    "The repository is not available locally — use GitHub information only."
                )

        ctx_lines.append(
            "\nWhen the user asks 'what branch am I on?', 'show me recent commits', "
            "'what files changed?' — answer using this repository context and the available tools."
        )
        final_prompt += "\n\n" + "\n".join(ctx_lines)

    if files:
        parts = []
        for f in files:
            content = f.content[:3000] if len(f.content) > 3000 else f.content
            parts.append(f"File: {f.filename} ({f.file_type})\n{content}")
        file_ctx = "\n\n---\n\n".join(parts)
        final_prompt += f"\n\n[File Context]\n{file_ctx}"

    agent = _build_agent(
        model=init_chat_model(provider_str),
        tools=tools,
        subagents=[finance_subagent, research_subagent],
        checkpointer=checkpointer,
        system_prompt=final_prompt,
    )

    # Store sandbox instance into the agent object for cleanup if necessary
    agent.__sandbox = sandbox
    return agent


def _build_agent(model, tools, subagents, checkpointer, system_prompt):
    """Assemble the agent graph with compact planning/subagent prompts and context management."""
    if isinstance(model.profile, dict) and isinstance(
        model.profile.get("max_input_tokens"), int
    ):
        summarize_trigger, summarize_keep = ("fraction", 0.85), ("fraction", 0.10)
    else:
        summarize_trigger, summarize_keep = ("tokens", 170_000), ("messages", 6)

    prompt_caching = AnthropicPromptCachingMiddleware(
        unsupported_model_behavior="ignore"
    )
    middleware = [
        TodoListMiddleware(
            system_prompt="", tool_description=WRITE_TODOS_TOOL_DESCRIPTION
        ),
        SubAgentMiddleware(
            default_model=model,
            default_tools=tools,
            subagents=subagents,
            default_middleware=[PatchToolCallsMiddleware(), prompt_caching],
            general_purpose_agent=False,
            system_prompt=None,
            task_description=TASK_TOOL_DESCRIPTION,
        ),
        ContextEditingMiddleware(
            edits=[
                ClearToolUsesEdit(
                    trigger=CONTEXT_EDIT_TRIGGER_TOKENS,
                    keep=CONTEXT_EDIT_KEEP_TOOL_RESULTS,
                    exclude_tools=("ask_user",),
                    placeholder="[older tool result cleared to save context]",
                )
            ]
        ),
        SummarizationMiddleware(
            model=model,
            trigger=summarize_trigger,
            keep=summarize_keep,
            trim_tokens_to_summarize=None,
        ),
        prompt_caching,
        PatchToolCallsMiddleware(),
        HumanInTheLoopMiddleware(
            interrupt_on={
                "delete_file": {"allowed_decisions": ["approve", "reject"]},
                "move_file": {"allowed_decisions": ["approve", "reject"]},
            }
        ),
    ]
    return build_agent_graph(
        model,
        system_prompt=system_prompt,
        tools=tools,
        middleware=middleware,
        checkpointer=checkpointer,
    ).with_config({"recursion_limit": 1000})


# Alias for backward compatibility
create_langgraph_agent = create_agent


def get_available_agents() -> List[Dict[str, Any]]:
    return list(AGENT_METADATA.values())
