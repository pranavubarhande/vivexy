"""
Daytona Sandbox Tools
Separates the execution environment wrappers out of the agent builder for cleanliness.
"""

import base64
import json
import logging
import os
import tempfile
import uuid
from io import BytesIO

import openpyxl
from langchain_core.tools import BaseTool, tool
from langchain_daytona import DaytonaSandbox

from app.agents.skill_loader import load_skill_deps
from app.models import Artifact, db
from app.models.enums import ArtifactType
from app.services.s3_service import S3Service

logger = logging.getLogger(__name__)


def install_sandbox_dependencies(backend: DaytonaSandbox):
    """Install skills dependencies on sandbox boot."""
    deps = load_skill_deps()
    for dep in set(deps):
        logger.info("Initializing Sandbox with dependency: %s", dep)
        backend.execute(dep)


def get_upload_sandbox_file_tool(backend: DaytonaSandbox, chat_id: str) -> BaseTool:
    @tool
    def upload_sandbox_file_to_chat(filepath: str) -> str:
        """Syncs a file from the sandbox workspace to S3 and creates a versioned chat artifact visible in the UI. Use this for ALL artifact types — .md, .csv, .xlsx, .pptx, .docx, .pdf, .json, .html, etc. ALWAYS call this immediately after writing any file to the sandbox."""
        try:
            ext = os.path.splitext(filepath)[1].lower().replace(".", "").upper()
            try:
                a_type = ArtifactType[ext]
            except KeyError:
                a_type = ArtifactType.OTHER

            res = backend.execute(f"base64 {filepath}")
            if getattr(res, "exit_code", -1) != 0:
                return f"Error reading file from sandbox: {getattr(res, 'output', 'Unknown error')}"

            output = getattr(res, "output", "")
            b64_content = "".join(output.split())  # strip newlines and spaces
            raw_bytes = base64.b64decode(b64_content)

            filename = os.path.basename(filepath)

            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                tmp.write(raw_bytes)
                tmp_path = tmp.name

            try:
                s3 = S3Service()
                size = os.path.getsize(tmp_path)
                with open(tmp_path, "rb") as f:
                    upload_res = s3.upload_file(
                        file=f,
                        chat_id=chat_id,
                        filename=filename,
                        content_type="application/octet-stream",
                    )

                # Store inline content for types that support editing/display
                text_content = ""
                if a_type in [
                    ArtifactType.MD,
                    ArtifactType.TXT,
                    ArtifactType.CSV,
                    ArtifactType.JS,
                    ArtifactType.JSON,
                    ArtifactType.HTML,
                ]:
                    try:
                        text_content = raw_bytes.decode("utf-8")
                    except Exception:
                        text_content = ""
                elif a_type == ArtifactType.XLSX:
                    # Parse binary XLSX to JSON so the frontend editable grid works
                    try:
                        wb = openpyxl.load_workbook(BytesIO(raw_bytes), data_only=True)
                        json_data = {}
                        for sheet_name in wb.sheetnames:
                            ws = wb[sheet_name]
                            rows = list(ws.values)
                            if not rows:
                                json_data[sheet_name] = []
                            else:
                                headers = [
                                    str(h) if h is not None else "" for h in rows[0]
                                ]
                                json_data[sheet_name] = [
                                    {
                                        headers[i]: (row[i] if i < len(row) else None)
                                        for i in range(len(headers))
                                    }
                                    for row in rows[1:]
                                ]
                        text_content = json.dumps(json_data)
                    except Exception as e:
                        logger.warning(f"Failed to parse XLSX to JSON: {e}")

                # seq: global order across all artifacts in this chat
                last = (
                    Artifact.query.filter_by(chat_id=chat_id)
                    .order_by(Artifact.seq.desc())
                    .first()
                )
                next_seq = (last.seq or 0) + 1 if last else 1

                # version: per-filename version counter
                same_file = (
                    Artifact.query.filter_by(chat_id=chat_id, filename=filename)
                    .order_by(Artifact.version.desc())
                    .first()
                )
                next_version = (same_file.version or 0) + 1 if same_file else 1

                new_artifact = Artifact(
                    chat_id=chat_id,
                    message_id=None,
                    title=filename,
                    filename=filename,
                    type=a_type,
                    content=text_content,
                    seq=next_seq,
                    version=next_version,
                    artifact_metadata={"s3_key": upload_res["s3_key"], "size": size},
                )
                db.session.add(new_artifact)
                db.session.commit()
                url = s3.get_presigned_url(upload_res["s3_key"])

                return json.dumps(
                    {
                        "success": True,
                        "message": f"Successfully uploaded {filename} to chat artifacts! You MUST provide this download link to the user: {url}",
                        "artifact_id": new_artifact.id,
                        "chat_id": chat_id,
                        "filename": filename,
                        "content": text_content,
                        "s3_key": upload_res["s3_key"],
                        "url": url,
                        "seq": next_seq,
                        "version": next_version,
                        "type": (
                            a_type.value if hasattr(a_type, "value") else str(a_type)
                        ),
                    }
                )
            finally:
                os.unlink(tmp_path)
        except Exception as e:
            return f"Failed to upload: {e}"

    return upload_sandbox_file_to_chat


def get_execute_code_tool(backend: DaytonaSandbox) -> BaseTool:
    @tool
    def execute_code(code: str, language: str = "python") -> str:
        """Executes a script in the sandbox. Supports 'python' or 'javascript' (Node.js)."""
        try:
            file_ext = "py" if language == "python" else "js"
            filename = f"/tmp/script_{uuid.uuid4().hex}.{file_ext}"

            b64_code = base64.b64encode(code.encode()).decode()

            write_res = backend.execute(f"echo {b64_code} | base64 -d > {filename}")
            if getattr(write_res, "exit_code", -1) != 0:
                return f"Failed to write script: {getattr(write_res, 'output', 'Unknown error')}"

            cmd = f"python3 {filename}" if language == "python" else f"node {filename}"
            run_res = backend.execute(cmd)

            output = getattr(run_res, "output", "")
            exit_code = getattr(run_res, "exit_code", -1)

            return f"Execution finished with exit code {exit_code}.\nOutput:\n{output}"
        except Exception as e:
            return f"Failed to execute code: {e}"

    return execute_code


def get_list_sandbox_files_tool(backend: DaytonaSandbox) -> BaseTool:
    @tool
    def list_sandbox_files(path: str = "./") -> str:
        """List files and directories in the sandbox workspace. Use this to discover which uploaded files (CSV, Excel, PDF, etc.) are available before processing them with execute_code. Returns file names, sizes, and types."""
        try:
            res = backend.execute(f"ls -lah {path} 2>&1")
            output = getattr(res, "output", "").strip()
            exit_code = getattr(res, "exit_code", -1)
            if exit_code != 0:
                return f"Error listing files: {output}"
            return output if output else "No files found in workspace."
        except Exception as e:
            return f"Failed to list files: {e}"

    return list_sandbox_files
