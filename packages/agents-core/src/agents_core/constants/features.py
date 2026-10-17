"""Per-team feature flags a superadmin can switch off for a client.

Every flag is on unless a team sets it to False. A user loses a feature if any
team they belong to has turned it off, so a client's lockdown can't be side-
stepped by working outside the team."""

FEATURE_SCHEDULED_TASKS = "scheduled-tasks"
FEATURE_DEPLOYED_AGENTS = "deployed-agents"
FEATURE_API_KEYS = "api-keys"
FEATURE_CONNECTORS = "connectors"
FEATURE_GITHUB = "github"
FEATURE_RAG = "rag"

KNOWN_FEATURES = {
    FEATURE_SCHEDULED_TASKS: "Scheduled tasks",
    FEATURE_DEPLOYED_AGENTS: "Deployed agents",
    FEATURE_API_KEYS: "Bring-your-own provider API keys",
    FEATURE_CONNECTORS: "Third-party connectors",
    FEATURE_GITHUB: "GitHub integration",
    FEATURE_RAG: "Document search (RAG)",
}
