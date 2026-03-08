"""
Redis key and channel name patterns.
Use .format(request_id=...) or .format(chat_id=...) when building keys.
"""

# Approval store: key TTL 300s
REDIS_KEY_APPROVAL = "approval:{request_id}"
REDIS_CHANNEL_APPROVAL = "approval_channel:{request_id}"

# Client tool store: key TTL 120s
REDIS_KEY_CLIENT_TOOL = "client_tool:{request_id}"
REDIS_CHANNEL_CLIENT_TOOL = "client_tool_channel:{request_id}"

# SSE stream (worker -> web)
REDIS_CHANNEL_CHAT_STREAM = "chat:stream:{chat_id}"
