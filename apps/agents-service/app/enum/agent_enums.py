from enum import Enum


class AgentType(Enum):
    GENERAL = "general"


class AgentPhase(Enum):
    PLANNING = "planning"
    SEARCHING = "searching"
    EXECUTING = "executing"
    GENERATING = "generating"
    DONE = "done"


class TaskStatus(Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    DONE = "DONE"
    ERROR = "ERROR"
