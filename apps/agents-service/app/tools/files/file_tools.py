"""
File Tools
LangChain tools for file reading, writing (versioned), and analysis.
All file-write operations use versioned S3 keys so each generation produces
a new version that can be inspected or downloaded independently.
"""

import os
import json
import tempfile
from typing import List, Dict, Any, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.services.file_processor import FileProcessor
from app.services.s3_service import S3Service


# ============================================
# Input Schemas
# ============================================

class ReadFileInput(BaseModel):
    """Input for reading a file"""
    filename: str = Field(..., description="Name of the file to read from the chat's uploaded files")


class WriteCsvInput(BaseModel):
    """Input for writing CSV file"""
    data: str = Field(..., description="JSON string representing table data. Can be an array of objects or an object with arrays as values.")
    filename: str = Field(..., description="Output filename (will be saved with .csv extension)")


class WriteXlsxInput(BaseModel):
    """Input for writing Excel file"""
    data: str = Field(..., description="JSON string representing table data. Can be an array of objects or an object with arrays as values.")
    filename: str = Field(..., description="Output filename (will be saved with .xlsx extension)")


class WritePdfInput(BaseModel):
    """Input for writing PDF file"""
    content: str = Field(..., description="Text content to write to the PDF")
    filename: str = Field(..., description="Output filename (will be saved with .pdf extension)")
    title: Optional[str] = Field(None, description="Optional document title")


class WriteDocxInput(BaseModel):
    """Input for writing Word document"""
    content: str = Field(..., description="Text content to write to the document")
    filename: str = Field(..., description="Output filename (will be saved with .docx extension)")
    title: Optional[str] = Field(None, description="Optional document title")


class WriteMdInput(BaseModel):
    """Input for writing Markdown file"""
    content: str = Field(..., description="Markdown content to write")
    filename: str = Field(..., description="Output filename (will be saved with .md extension)")


class AnalyzeDataInput(BaseModel):
    """Input for data analysis"""
    filename: str = Field(..., description="Name of the CSV or XLSX file to analyze from the chat's uploaded files")


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
            return {"success": False, "error": f"File '{filename}' not found in chat files"}

        local_path = s3.download_file(target_file["s3_key"])
        if not local_path:
            return {"success": False, "error": "Failed to download file"}

        try:
            processor = FileProcessor()
            result = processor.read_file(local_path)
            text = result.get("text", "")
            if len(text) > 5000:
                text = text[:5000] + "\n... [Content truncated, use analyze_data for full analysis]"
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


def write_csv_func(chat_id: str, data: str, filename: str) -> Dict[str, Any]:
    """Write data to a versioned CSV file on S3."""
    try:
        import pandas as pd

        parsed_data = json.loads(data)
        if isinstance(parsed_data, (list, dict)):
            df = pd.DataFrame(parsed_data)
        else:
            return {"success": False, "error": "Invalid data format"}

        if not filename.endswith(".csv"):
            filename = f"{filename}.csv"

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            df.to_csv(f.name, index=False)
            temp_path = f.name

        s3 = S3Service()
        result = s3.upload_generated_file_versioned(temp_path, chat_id, filename, "text/csv")
        os.unlink(temp_path)

        if result.get("success"):
            return {
                "success": True,
                "filename": filename,
                "version": result.get("version", 1),
                "url": result.get("url"),
                "rows": len(df),
                "columns": list(df.columns),
                "artifact": {
                    "type": "CSV",
                    "filename": filename,
                    "version": result.get("version", 1),
                    "url": result.get("url"),
                },
            }
        return result

    except json.JSONDecodeError as e:
        return {"success": False, "error": f"Invalid JSON data: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def write_xlsx_func(chat_id: str, data: str, filename: str) -> Dict[str, Any]:
    """Write data to a versioned Excel file on S3."""
    try:
        import pandas as pd

        parsed_data = json.loads(data)
        if isinstance(parsed_data, (list, dict)):
            df = pd.DataFrame(parsed_data)
        else:
            return {"success": False, "error": "Invalid data format"}

        if not filename.endswith(".xlsx"):
            filename = f"{filename}.xlsx"

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            temp_path = f.name
        df.to_excel(temp_path, index=False)

        s3 = S3Service()
        result = s3.upload_generated_file_versioned(
            temp_path, chat_id, filename,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        os.unlink(temp_path)

        if result.get("success"):
            return {
                "success": True,
                "filename": filename,
                "version": result.get("version", 1),
                "url": result.get("url"),
                "rows": len(df),
                "columns": list(df.columns),
                "artifact": {
                    "type": "XLSX",
                    "filename": filename,
                    "version": result.get("version", 1),
                    "url": result.get("url"),
                },
            }
        return result

    except json.JSONDecodeError as e:
        return {"success": False, "error": f"Invalid JSON data: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def write_pdf_func(chat_id: str, content: str, filename: str, title: Optional[str] = None) -> Dict[str, Any]:
    """Write content to a versioned PDF file on S3."""
    try:
        if not filename.endswith(".pdf"):
            filename = f"{filename}.pdf"

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            temp_path = f.name

        processor = FileProcessor()
        result = processor.write_pdf(content, temp_path, title)
        if not result.get("success"):
            return result

        s3 = S3Service()
        upload_result = s3.upload_generated_file_versioned(temp_path, chat_id, filename, "application/pdf")
        os.unlink(temp_path)

        if upload_result.get("success"):
            return {
                "success": True,
                "filename": filename,
                "version": upload_result.get("version", 1),
                "url": upload_result.get("url"),
                "artifact": {
                    "type": "PDF",
                    "filename": filename,
                    "version": upload_result.get("version", 1),
                    "url": upload_result.get("url"),
                },
            }
        return upload_result

    except Exception as e:
        return {"success": False, "error": str(e)}


def write_docx_func(chat_id: str, content: str, filename: str, title: Optional[str] = None) -> Dict[str, Any]:
    """Write content to a versioned Word document on S3."""
    try:
        if not filename.endswith(".docx"):
            filename = f"{filename}.docx"

        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            temp_path = f.name

        processor = FileProcessor()
        result = processor.write_docx(content, temp_path, title)
        if not result.get("success"):
            return result

        s3 = S3Service()
        upload_result = s3.upload_generated_file_versioned(
            temp_path, chat_id, filename,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        os.unlink(temp_path)

        if upload_result.get("success"):
            return {
                "success": True,
                "filename": filename,
                "version": upload_result.get("version", 1),
                "url": upload_result.get("url"),
                "artifact": {
                    "type": "DOCX",
                    "filename": filename,
                    "version": upload_result.get("version", 1),
                    "url": upload_result.get("url"),
                },
            }
        return upload_result

    except Exception as e:
        return {"success": False, "error": str(e)}


def write_md_func(chat_id: str, content: str, filename: str) -> Dict[str, Any]:
    """Write content to a versioned Markdown file on S3."""
    try:
        if not filename.endswith(".md"):
            filename = f"{filename}.md"

        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False, encoding="utf-8") as f:
            f.write(content)
            temp_path = f.name

        s3 = S3Service()
        upload_result = s3.upload_generated_file_versioned(temp_path, chat_id, filename, "text/markdown")
        os.unlink(temp_path)

        if upload_result.get("success"):
            return {
                "success": True,
                "filename": filename,
                "version": upload_result.get("version", 1),
                "url": upload_result.get("url"),
                "artifact": {
                    "type": "MD",
                    "filename": filename,
                    "version": upload_result.get("version", 1),
                    "url": upload_result.get("url"),
                    "content": content,
                },
            }
        return upload_result

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
            return {"success": False, "error": f"File '{filename}' not found in chat files"}

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


def get_file_write_tools(chat_id: str) -> List[StructuredTool]:
    """
    Get all file-writing tools (versioned S3 uploads).
    All write operations require user approval (listed in APPROVAL_REQUIRED_TOOLS).
    """
    return [
        StructuredTool.from_function(
            func=lambda **kwargs: write_csv_func(chat_id, **kwargs),
            name="write_csv",
            description=(
                "Create a versioned CSV file with tabular data. "
                "data must be a JSON string representing an array of objects or an object with arrays. "
                "Each invocation creates a new version of the file on S3."
            ),
            args_schema=WriteCsvInput,
        ),
        StructuredTool.from_function(
            func=lambda **kwargs: write_xlsx_func(chat_id, **kwargs),
            name="write_xlsx",
            description=(
                "Create a versioned Excel file with tabular data. "
                "data must be a JSON string representing an array of objects or an object with arrays. "
                "Each invocation creates a new version of the file on S3."
            ),
            args_schema=WriteXlsxInput,
        ),
        StructuredTool.from_function(
            func=lambda **kwargs: write_pdf_func(chat_id, **kwargs),
            name="write_pdf",
            description=(
                "Create a versioned PDF document from text content. "
                "Good for reports and documents. Each call bumps the version number."
            ),
            args_schema=WritePdfInput,
        ),
        StructuredTool.from_function(
            func=lambda **kwargs: write_docx_func(chat_id, **kwargs),
            name="write_docx",
            description=(
                "Create a versioned Word document from text content. "
                "Good for editable reports. Each call bumps the version number."
            ),
            args_schema=WriteDocxInput,
        ),
        StructuredTool.from_function(
            func=lambda **kwargs: write_md_func(chat_id, **kwargs),
            name="write_md",
            description=(
                "Create a versioned Markdown file. "
                "Good for formatted text, documentation, and reports that can be displayed inline. "
                "Each call bumps the version number."
            ),
            args_schema=WriteMdInput,
        ),
    ]


def get_file_tools(chat_id: str) -> List[StructuredTool]:
    """Get all file tools (read + write + analyze)"""
    tools = [get_file_read_tool(chat_id), get_analyze_data_tool(chat_id)]
    tools.extend(get_file_write_tools(chat_id))
    return tools
