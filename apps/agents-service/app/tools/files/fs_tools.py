"""
Filesystem tools for the desktop agent.

These are LangChain tool definitions only — when client_tools_enabled is True,
execution is delegated to the Electron desktop client via IPC. The server never
runs these tools directly; they exist so the LLM knows the schema.
"""

from typing import Optional

from langchain_core.tools import tool
from pydantic import BaseModel, Field


class ListFilesInput(BaseModel):
    directory: Optional[str] = Field(
        None,
        description="Relative path within workspace to list. Omit for workspace root.",
    )
    recursive: bool = Field(False, description="Recurse into subdirectories.")
    pattern: str = Field(
        "",
        description="Glob-style pattern to filter filenames, e.g. '*.csv' or 'report*'.",
    )


class GrepFilesInput(BaseModel):
    pattern: str = Field(
        ..., description="Text or regex pattern to search for in file contents."
    )
    directory: Optional[str] = Field(
        None, description="Relative directory to search in. Omit for workspace root."
    )
    file_pattern: Optional[str] = Field(
        None, description="Glob pattern to filter which files to search, e.g. '*.py'."
    )
    case_sensitive: bool = Field(
        False, description="Whether the search is case-sensitive."
    )
    max_results: int = Field(
        50, description="Maximum number of matches to return (max 100)."
    )


class MoveFileInput(BaseModel):
    source: str = Field(..., description="Relative path of the file/directory to move.")
    destination: str = Field(..., description="Relative destination path.")


class CopyFileInput(BaseModel):
    source: str = Field(..., description="Relative path of the file/directory to copy.")
    destination: str = Field(..., description="Relative destination path.")


class DeleteFileInput(BaseModel):
    filepath: str = Field(
        ..., description="Relative path of the file or directory to delete."
    )


class CreateDirectoryInput(BaseModel):
    directory: str = Field(..., description="Relative path of the directory to create.")


class WriteFileInput(BaseModel):
    filepath: str = Field(
        ..., description="Relative path within workspace to write the file."
    )
    content: str = Field(..., description="Text content to write to the file.")
    create_dirs: bool = Field(
        True, description="Create parent directories if they don't exist."
    )
    overwrite: bool = Field(
        False,
        description="If True, overwrite the file. If False and file exists, auto-version (e.g. report_v2.md).",
    )


class UpdateFileInput(BaseModel):
    filepath: str = Field(
        ..., description="Relative path of the existing file to update."
    )
    content: Optional[str] = Field(
        None,
        description="If provided, replaces the entire file content.",
    )
    find: Optional[str] = Field(
        None,
        description="Exact substring to find in the file (used with replace).",
    )
    replace: Optional[str] = Field(
        None,
        description="Replacement string for the found substring.",
    )
    append: Optional[str] = Field(
        None,
        description="Text to append to the end of the file.",
    )
    prepend: Optional[str] = Field(
        None,
        description="Text to prepend to the beginning of the file.",
    )


@tool("list_files", args_schema=ListFilesInput)
def list_files_tool(
    directory: Optional[str] = None,
    recursive: bool = False,
    pattern: str = "",
) -> str:
    """List files and directories in the user's workspace. Use to explore the project structure."""
    return '{"error": "This tool is only available on the desktop client"}'


@tool("grep_files", args_schema=GrepFilesInput)
def grep_files_tool(
    pattern: str,
    directory: Optional[str] = None,
    file_pattern: Optional[str] = None,
    case_sensitive: bool = False,
    max_results: int = 50,
) -> str:
    """Search for text patterns across files in the workspace. Like grep/ripgrep."""
    return '{"error": "This tool is only available on the desktop client"}'


@tool("move_file", args_schema=MoveFileInput)
def move_file_tool(source: str, destination: str) -> str:
    """Move or rename a file or directory within the workspace."""
    return '{"error": "This tool is only available on the desktop client"}'


@tool("copy_file", args_schema=CopyFileInput)
def copy_file_tool(source: str, destination: str) -> str:
    """Copy a file or directory within the workspace."""
    return '{"error": "This tool is only available on the desktop client"}'


@tool("delete_file", args_schema=DeleteFileInput)
def delete_file_tool(filepath: str) -> str:
    """Delete a file or directory from the workspace. Requires user approval."""
    return '{"error": "This tool is only available on the desktop client"}'


@tool("create_directory", args_schema=CreateDirectoryInput)
def create_directory_tool(directory: str) -> str:
    """Create a new directory within the workspace."""
    return '{"error": "This tool is only available on the desktop client"}'


@tool("write_file", args_schema=WriteFileInput)
def write_file_tool(
    filepath: str,
    content: str,
    create_dirs: bool = True,
    overwrite: bool = False,
) -> str:
    """Write text content to a new file. If the file already exists and overwrite is False, auto-versions it (e.g. report_v2.md)."""
    return '{"error": "This tool is only available on the desktop client"}'


@tool("update_file", args_schema=UpdateFileInput)
def update_file_tool(
    filepath: str,
    content: Optional[str] = None,
    find: Optional[str] = None,
    replace: Optional[str] = None,
    append: Optional[str] = None,
    prepend: Optional[str] = None,
) -> str:
    """Update an existing file: replace full content, find-and-replace a substring, or append/prepend text."""
    return '{"error": "This tool is only available on the desktop client"}'


def get_fs_tools():
    """Return all filesystem tools. Only useful when client_tools_enabled is True."""
    return [
        list_files_tool,
        grep_files_tool,
        move_file_tool,
        copy_file_tool,
        delete_file_tool,
        create_directory_tool,
        write_file_tool,
        update_file_tool,
    ]
