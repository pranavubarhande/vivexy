"""
S3 File Service
Handles file upload/download operations with AWS S3.
"""

import os
import tempfile
import uuid
from datetime import datetime, timedelta
from typing import Any, BinaryIO, Dict, List, Optional

from configs import Config


class S3Service:
    """
    Service for managing files in AWS S3.
    Organizes files by chat_id for easy retrieval.
    """

    def __init__(self):
        try:
            import boto3
            from botocore.exceptions import ClientError

            # Store ClientError on the class so methods can reference it
            S3Service._ClientError = ClientError
        except ImportError:
            print("Warning: boto3 not installed. S3 functionality will not work.")
            self.s3_client = None
            S3Service._ClientError = Exception  # Fallback so except clauses don't break
            return

        self.bucket_name = os.getenv(
            "AWS_S3_BUCKET_NAME",
            (
                Config.AWS_S3_BUCKET_NAME
                if hasattr(Config, "AWS_S3_BUCKET_NAME")
                else "portfolio-helper-files"
            ),
        )
        self.region = os.getenv(
            "AWS_S3_REGION", getattr(Config, "AWS_S3_REGION", "us-east-1")
        )

        # Initialize S3 client
        self.s3_client = boto3.client(
            "s3",
            aws_access_key_id=os.getenv(
                "AWS_ACCESS_KEY_ID", getattr(Config, "AWS_ACCESS_KEY_ID", None)
            ),
            aws_secret_access_key=os.getenv(
                "AWS_SECRET_ACCESS_KEY", getattr(Config, "AWS_SECRET_ACCESS_KEY", None)
            ),
            region_name=self.region,
        )

    def _get_file_key(
        self, chat_id: str, filename: str, file_id: Optional[str] = None
    ) -> str:
        """Generate S3 key for a file"""
        file_id = file_id or str(uuid.uuid4())
        # Format: chats/{chat_id}/files/{file_id}_{filename}
        return f"chats/{chat_id}/files/{file_id}_{filename}"

    def _get_generated_file_key(self, chat_id: str, filename: str) -> str:
        """Generate S3 key for agent-generated files (legacy, non-versioned)."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"chats/{chat_id}/generated/{timestamp}_{filename}"

    def _get_versioned_generated_file_key(
        self, chat_id: str, filename: str, version: int
    ) -> str:
        """Generate a versioned S3 key: chats/{chat_id}/generated/{filename}/v{version}_{filename}"""
        return f"chats/{chat_id}/generated/{filename}/v{version}_{filename}"

    def upload_file(
        self,
        file: BinaryIO,
        chat_id: str,
        filename: str,
        content_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Upload a file to S3.

        Args:
            file: File-like object to upload
            chat_id: Chat ID to associate with the file
            filename: Original filename
            content_type: MIME type of the file

        Returns:
            Dict with file metadata including s3_key
        """
        if not self.s3_client:
            return {
                "success": False,
                "error": "S3 client not initialized (boto3 not installed or configured)",
            }

        file_id = str(uuid.uuid4())
        s3_key = self._get_file_key(chat_id, filename, file_id)

        try:
            extra_args = {}
            if content_type:
                extra_args["ContentType"] = content_type

            self.s3_client.upload_fileobj(
                file, self.bucket_name, s3_key, ExtraArgs=extra_args
            )

            return {
                "success": True,
                "file_id": file_id,
                "filename": filename,
                "s3_key": s3_key,
                "content_type": content_type,
                "chat_id": chat_id,
                "uploaded_at": datetime.utcnow().isoformat(),
            }

        except S3Service._ClientError as e:
            return {"success": False, "error": str(e)}

    def upload_generated_file(
        self,
        file_path: str,
        chat_id: str,
        filename: str,
        content_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Upload an agent-generated file to S3 (legacy, non-versioned).
        Prefer upload_generated_file_versioned for new code.
        """
        s3_key = self._get_generated_file_key(chat_id, filename)

        try:
            extra_args = {}
            if content_type:
                extra_args["ContentType"] = content_type

            self.s3_client.upload_file(
                file_path,
                self.bucket_name,
                s3_key,
                ExtraArgs=extra_args if extra_args else None,
            )
            url = self.get_presigned_url(s3_key)

            return {
                "success": True,
                "filename": filename,
                "s3_key": s3_key,
                "url": url,
                "content_type": content_type,
                "chat_id": chat_id,
                "generated_at": datetime.utcnow().isoformat(),
            }

        except S3Service._ClientError as e:
            return {"success": False, "error": str(e)}

    # ------------------------------------------------------------------
    # Versioned generated-file helpers
    # ------------------------------------------------------------------

    def list_generated_file_versions(
        self, chat_id: str, filename: str
    ) -> List[Dict[str, Any]]:
        """
        List all stored versions of a generated file.

        Returns a list of dicts ordered by version ascending:
          [{version, s3_key, url, size, generated_at}, ...]
        """
        prefix = f"chats/{chat_id}/generated/{filename}/"
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name, Prefix=prefix
            )
            versions = []
            for obj in response.get("Contents", []):
                key = obj["Key"]
                basename = key.split("/")[-1]  # e.g. v2_report.csv
                try:
                    version = int(basename.split("_")[0].lstrip("v"))
                except (ValueError, IndexError):
                    version = 0
                versions.append(
                    {
                        "version": version,
                        "s3_key": key,
                        "url": self.get_presigned_url(key),
                        "size": obj["Size"],
                        "generated_at": obj["LastModified"].isoformat(),
                    }
                )
            versions.sort(key=lambda x: x["version"])
            return versions
        except S3Service._ClientError as e:
            print(f"Error listing versions for {filename}: {e}")
            return []

    def upload_generated_file_versioned(
        self,
        file_path: str,
        chat_id: str,
        filename: str,
        content_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Upload a generated file with automatic version bumping.

        Queries existing versions, increments to the next version number,
        uploads under the versioned key, and returns metadata including
        the version number.
        """
        existing = self.list_generated_file_versions(chat_id, filename)
        next_version = (existing[-1]["version"] + 1) if existing else 1
        s3_key = self._get_versioned_generated_file_key(chat_id, filename, next_version)

        try:
            extra_args = {}
            if content_type:
                extra_args["ContentType"] = content_type

            self.s3_client.upload_file(
                file_path,
                self.bucket_name,
                s3_key,
                ExtraArgs=extra_args if extra_args else None,
            )
            url = self.get_presigned_url(s3_key)

            return {
                "success": True,
                "filename": filename,
                "s3_key": s3_key,
                "version": next_version,
                "url": url,
                "content_type": content_type,
                "chat_id": chat_id,
                "generated_at": datetime.utcnow().isoformat(),
            }

        except S3Service._ClientError as e:
            return {"success": False, "error": str(e)}

    def download_file(self, s3_key: str) -> Optional[str]:
        """
        Download a file from S3 to a temporary location.

        Args:
            s3_key: S3 key of the file

        Returns:
            Local file path or None if failed
        """
        try:
            # Create temp file with appropriate extension
            filename = s3_key.split("/")[-1]
            ext = filename.split(".")[-1] if "." in filename else ""

            fd, temp_path = tempfile.mkstemp(suffix=f".{ext}" if ext else "")
            os.close(fd)

            self.s3_client.download_file(self.bucket_name, s3_key, temp_path)

            return temp_path

        except S3Service._ClientError as e:
            print(f"Error downloading file: {e}")
            return None

    def get_file_content(self, s3_key: str) -> Optional[bytes]:
        """
        Get file content directly as bytes.

        Args:
            s3_key: S3 key of the file

        Returns:
            File content as bytes or None
        """
        try:
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=s3_key)
            return response["Body"].read()

        except S3Service._ClientError as e:
            print(f"Error getting file content: {e}")
            return None

    def get_presigned_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        """
        Generate a presigned URL for file access.

        Args:
            s3_key: S3 key of the file
            expiration: URL expiration time in seconds (default 1 hour)

        Returns:
            Presigned URL or None
        """
        try:
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": s3_key},
                ExpiresIn=expiration,
            )
            return url

        except S3Service._ClientError as e:
            print(f"Error generating presigned URL: {e}")
            return None

    def list_chat_files(self, chat_id: str) -> List[Dict[str, Any]]:
        """
        List all files for a chat.

        Args:
            chat_id: Chat ID

        Returns:
            List of file metadata dicts
        """
        prefix = f"chats/{chat_id}/files/"

        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name, Prefix=prefix
            )

            files = []
            for obj in response.get("Contents", []):
                key = obj["Key"]
                filename = key.split("/")[-1]
                # Remove file_id prefix if present
                if "_" in filename:
                    filename = "_".join(filename.split("_")[1:])

                files.append(
                    {
                        "s3_key": key,
                        "filename": filename,
                        "size": obj["Size"],
                        "last_modified": obj["LastModified"].isoformat(),
                    }
                )

            return files

        except S3Service._ClientError as e:
            print(f"Error listing files: {e}")
            return []

    def list_generated_files(self, chat_id: str) -> List[Dict[str, Any]]:
        """
        List all generated files for a chat.

        Args:
            chat_id: Chat ID

        Returns:
            List of file metadata dicts
        """
        prefix = f"chats/{chat_id}/generated/"

        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name, Prefix=prefix
            )

            files = []
            for obj in response.get("Contents", []):
                key = obj["Key"]
                filename = key.split("/")[-1]
                # Remove timestamp prefix
                if "_" in filename:
                    parts = filename.split("_")
                    if len(parts) > 2:
                        filename = "_".join(parts[2:])

                files.append(
                    {
                        "s3_key": key,
                        "filename": filename,
                        "size": obj["Size"],
                        "last_modified": obj["LastModified"].isoformat(),
                        "url": self.get_presigned_url(key),
                    }
                )

            return files

        except S3Service._ClientError as e:
            print(f"Error listing generated files: {e}")
            return []

    def delete_file(self, s3_key: str) -> bool:
        """
        Delete a file from S3.

        Args:
            s3_key: S3 key of the file

        Returns:
            True if successful
        """
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=s3_key)
            return True

        except S3Service._ClientError as e:
            print(f"Error deleting file: {e}")
            return False

    def load_chat_files(
        self, chat_id: str, file_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Load file contents for a chat session.

        Args:
            chat_id: Chat ID
            file_ids: Optional list of specific file IDs to load

        Returns:
            List of file data with content
        """
        from app.services.file_processor import FileProcessor

        files = self.list_chat_files(chat_id)
        loaded_files = []

        for file_info in files:
            # Filter by file_ids if specified
            if file_ids:
                file_id = file_info["s3_key"].split("/")[-1].split("_")[0]
                if file_id not in file_ids:
                    continue

            # Download and process
            local_path = self.download_file(file_info["s3_key"])
            if local_path:
                try:
                    processor = FileProcessor()
                    content = processor.read_file(local_path)

                    loaded_files.append(
                        {
                            **file_info,
                            "content": content.get("text", ""),
                            "data": content.get("data"),
                            "file_type": content.get("type", "unknown"),
                        }
                    )
                finally:
                    # Clean up temp file
                    try:
                        os.unlink(local_path)
                    except:
                        pass

        return loaded_files
