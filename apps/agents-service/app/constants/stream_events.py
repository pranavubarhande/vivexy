"""
Stream event type constants for SSE/agent streaming.
"""

# Lifecycle
STREAM_EVENT_START = "start"
STREAM_EVENT_DONE = "done"
"""Redis worker sends this after all events; web worker uses it to close the stream."""
STREAM_EVENT_REDIS_DONE = "__done__"

# Content & reasoning
STREAM_EVENT_CONTENT = "content"
STREAM_EVENT_REASONING = "reasoning"

# Phases & tasks
STREAM_EVENT_PHASE_CHANGE = "phase_change"
STREAM_EVENT_TASK_PLANNED = "task_planned"
STREAM_EVENT_TASK_STARTED = "task_started"
STREAM_EVENT_TASK_COMPLETED = "task_completed"
STREAM_EVENT_TASK_ERROR = "task_error"

# Tools & approval
STREAM_EVENT_TOOL_CALL = "tool_call"
STREAM_EVENT_APPROVAL_REQUEST = "approval_request"
STREAM_EVENT_CLIENT_TOOL_REQUEST = "client_tool_request"

# Structured outputs
STREAM_EVENT_ARTIFACT = "artifact"
STREAM_EVENT_ARTIFACT_STREAM = "artifact_stream"
STREAM_EVENT_TODO = "todo"
STREAM_EVENT_FILE_VERSION = "file_version"

# Error
STREAM_EVENT_ERROR = "error"
