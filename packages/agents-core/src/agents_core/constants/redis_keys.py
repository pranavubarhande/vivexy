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

# Redis stream for pub/sub SSE relay
REDIS_KEY_STREAM_TOKEN = (
    "stream_token:{stream_id}"  # TTL 120s — one-time EventSource auth
)
REDIS_STREAM_CHAT = "chat:xstream:{stream_id}"  # Redis stream key for event payloads

# Cancellation flag: key TTL 300s
REDIS_KEY_CANCEL_TOOL = "cancel_tool:{chat_id}:{tool_name}"

# Email verification token: key TTL 24h, single-use (deleted on consume)
REDIS_KEY_EMAIL_VERIFY = "email_verify:{token}"

# Resend-verification-email rate limit: key TTL 60s
REDIS_KEY_RESEND_COOLDOWN = "resend_cooldown:{user_id}"

# One-time OAuth exchange code: key TTL 60s, single-use (deleted on consume)
REDIS_KEY_OAUTH_EXCHANGE = "oauth_exchange:{code}"
