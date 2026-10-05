import os
from unittest.mock import MagicMock, patch

import pytest

from agents_core.business_logic.artifacts import export_md_content, resolve_artifact_content


def test_resolve_artifact_content_with_inline_content():
    """Test resolving artifact content when it's stored directly in DB."""
    mock_artifact = MagicMock()
    mock_artifact.content = "Inline Markdown Content"
    mock_artifact.artifact_metadata = {}

    content = resolve_artifact_content(mock_artifact)
    assert content == "Inline Markdown Content"


@patch("agents_core.business_logic.artifacts.S3Service")
def test_resolve_artifact_content_with_s3(mock_s3_service):
    """Test resolving artifact content from S3 when inline content is None."""
    mock_artifact = MagicMock()
    mock_artifact.content = None
    mock_artifact.artifact_metadata = {"s3_key": "some/s3/key.md"}

    mock_s3_instance = MagicMock()
    mock_s3_instance.get_file_content.return_value = b"S3 Markdown Content"
    mock_s3_service.return_value = mock_s3_instance

    content = resolve_artifact_content(mock_artifact)
    assert content == "S3 Markdown Content"
    mock_s3_instance.get_file_content.assert_called_once_with("some/s3/key.md")


def test_resolve_artifact_content_missing_s3_key():
    """Test resolving artifact when content is missing and no s3 key is provided."""
    mock_artifact = MagicMock()
    mock_artifact.content = None
    mock_artifact.artifact_metadata = {}

    content = resolve_artifact_content(mock_artifact)
    assert content == ""


@patch("agents_core.business_logic.artifacts.HTML")
def test_export_md_content_pdf(mock_html):
    """Test exporting MD content to PDF."""
    mock_html_instance = MagicMock()
    mock_html.return_value = mock_html_instance

    content = "# Title\n\nSome text."
    path = export_md_content(content, "pdf")

    # Check if the output is a string path and it ends with .pdf
    assert isinstance(path, str)
    assert path.endswith(".pdf")

    # Check if HTML(...) was called with styled markdown and write_pdf was called
    mock_html.assert_called_once()
    mock_html_instance.write_pdf.assert_called_once()

    # Cleanup temp file
    if os.path.exists(path):
        os.unlink(path)


@patch("agents_core.business_logic.artifacts.pypandoc")
def test_export_md_content_docx(mock_pypandoc):
    """Test exporting MD content to DOCX."""
    content = "# Title\n\nSome text."
    path = export_md_content(content, "docx")

    assert isinstance(path, str)
    assert path.endswith(".docx")

    mock_pypandoc.convert_text.assert_called_once()

    if os.path.exists(path):
        os.unlink(path)
