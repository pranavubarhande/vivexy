from unittest.mock import MagicMock, patch

import pytest

from agents_core.services.s3_service import S3Service


def test_s3_service_init_with_boto3():
    mock_boto_module = MagicMock()
    with patch.dict("sys.modules", {"boto3": mock_boto_module}):
        service = S3Service()
        assert service.s3_client is not None
        mock_boto_module.client.assert_called_once()


def test_s3_service_init_without_boto3():
    # If boto3 isn't installed
    with patch.dict("sys.modules", {"boto3": None}):
        service = S3Service()
        assert service.s3_client is None


def test_upload_file_success():
    mock_boto_module = MagicMock()
    mock_client = MagicMock()
    mock_boto_module.client.return_value = mock_client

    with patch.dict("sys.modules", {"boto3": mock_boto_module}):
        service = S3Service()
        mock_file = MagicMock()

        result = service.upload_file(mock_file, "chat-123", "test.txt", "text/plain")

        assert result["success"] is True
        assert result["filename"] == "test.txt"
        assert "chats/chat-123/files/" in result["s3_key"]
        mock_client.upload_fileobj.assert_called_once()


def test_upload_file_error():
    class DummyError(Exception):
        pass

    mock_boto_module = MagicMock()
    mock_client = MagicMock()
    mock_client.upload_fileobj.side_effect = DummyError("S3 error")
    mock_boto_module.client.return_value = mock_client

    with patch.dict("sys.modules", {"boto3": mock_boto_module}):
        service = S3Service()

        # Override S3Service._ClientError AFTER init so it's not reset
        S3Service._ClientError = DummyError

        mock_file = MagicMock()

        result = service.upload_file(mock_file, "chat-123", "test.txt")
        assert result["success"] is False
        assert "S3 error" in result["error"]


def test_get_presigned_url():
    mock_boto_module = MagicMock()
    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://mock-url.com"
    mock_boto_module.client.return_value = mock_client

    with patch.dict("sys.modules", {"boto3": mock_boto_module}):
        service = S3Service()
        url = service.get_presigned_url("mock-key")

        assert url == "https://mock-url.com"
        mock_client.generate_presigned_url.assert_called_once()
