"""
File Tools
LangChain tools for file reading, writing (versioned), and analysis.
All file-write operations use versioned S3 keys so each generation produces
a new version that can be inspected or downloaded independently.
"""

import os
from typing import Any, Dict, List, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from agents_core.services.file_processor import FileProcessor
from agents_core.services.s3_service import S3Service

# ============================================
# Input Schemas
# ============================================


class ReadFileInput(BaseModel):
    """Input for reading a file"""

    filename: str = Field(
        ..., description="Name of the file to read from the chat's uploaded files"
    )


class AnalyzeDataInput(BaseModel):
    """Input for data analysis"""

    filename: str = Field(
        ...,
        description="Name of the CSV or XLSX file to analyze from the chat's uploaded files",
    )


# ============================================
# Tool Functions
# ============================================


def read_file_func(chat_id: str, filename: str) -> Dict[str, Any]:
    """Read a file from the chat's files"""
    try:
        s3 = S3Service()
        files = s3.list_chat_files(chat_id)

        target_file = next(
            (f for f in files if filename.lower() in f["filename"].lower()), None
        )
        if not target_file:
            return {
                "success": False,
                "error": f"File '{filename}' not found in chat files",
            }

        local_path = s3.download_file(target_file["s3_key"])
        if not local_path:
            return {"success": False, "error": "Failed to download file"}

        try:
            processor = FileProcessor()
            result = processor.read_file(local_path)
            text = result.get("text", "")
            if len(text) > 5000:
                text = (
                    text[:5000]
                    + "\n... [Content truncated, use analyze_data for full analysis]"
                )
            return {
                "success": True,
                "filename": filename,
                "type": result.get("type"),
                "content": text,
                "metadata": {
                    "shape": result.get("shape"),
                    "columns": result.get("columns"),
                    "pages": result.get("pages"),
                },
            }
        finally:
            os.unlink(local_path)

    except Exception as e:
        return {"success": False, "error": str(e)}


def analyze_data_func(chat_id: str, filename: str) -> Dict[str, Any]:
    """Analyze data from a CSV or XLSX file"""
    try:
        s3 = S3Service()
        files = s3.list_chat_files(chat_id)

        target_file = next(
            (f for f in files if filename.lower() in f["filename"].lower()), None
        )
        if not target_file:
            return {
                "success": False,
                "error": f"File '{filename}' not found in chat files",
            }

        local_path = s3.download_file(target_file["s3_key"])
        if not local_path:
            return {"success": False, "error": "Failed to download file"}

        try:
            processor = FileProcessor()
            return processor.analyze_data(local_path)
        finally:
            os.unlink(local_path)

    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================
# Tool Factory Functions
# ============================================


def get_file_read_tool(chat_id: str) -> StructuredTool:
    """Get file read tool"""
    return StructuredTool.from_function(
        func=lambda **kwargs: read_file_func(chat_id, **kwargs),
        name="read_file",
        description=(
            "Read content from an uploaded file in the current chat. "
            "Supports CSV, XLSX, PDF, DOCX, MD, and TXT files. "
            "Returns the file content and metadata."
        ),
        args_schema=ReadFileInput,
    )


def get_analyze_data_tool(chat_id: str) -> StructuredTool:
    """Get data analysis tool"""
    return StructuredTool.from_function(
        func=lambda **kwargs: analyze_data_func(chat_id, **kwargs),
        name="analyze_data",
        description=(
            "Perform statistical analysis on a CSV or XLSX file. "
            "Returns summary statistics, column info, and missing value counts."
        ),
        args_schema=AnalyzeDataInput,
    )


def get_file_tools(chat_id: str) -> List[StructuredTool]:
    """Get all file tools (read + analyze)"""
    tools = [get_file_read_tool(chat_id), get_analyze_data_tool(chat_id)]
    return tools
