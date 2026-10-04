import os
import tempfile

import pandas as pd

from agents_core.services.file_processor import FileProcessor


def test_get_file_type():
    assert FileProcessor.get_file_type("test.csv") == "csv"
    assert FileProcessor.get_file_type("test.xlsx") == "xlsx"
    assert FileProcessor.get_file_type("test") == ""


def test_read_and_write_csv():
    fd, path = tempfile.mkstemp(suffix=".csv")
    os.close(fd)
    try:
        data = [{"id": 1, "name": "Test"}]
        write_res = FileProcessor.write_csv(data, path)
        assert write_res["success"] is True

        read_res = FileProcessor.read_file(path)
        assert read_res["type"] == "csv"
        assert read_res["shape"] == (1, 2)
        assert "Test" in read_res["text"]
    finally:
        os.unlink(path)


def test_read_and_write_md():
    fd, path = tempfile.mkstemp(suffix=".md")
    os.close(fd)
    try:
        content = "# Hello World"
        write_res = FileProcessor.write_md(content, path)
        assert write_res["success"] is True

        read_res = FileProcessor.read_file(path)
        assert read_res["type"] == "md"
        assert read_res["text"] == content
    finally:
        os.unlink(path)


def test_analyze_data():
    fd, path = tempfile.mkstemp(suffix=".csv")
    os.close(fd)
    try:
        data = pd.DataFrame({"age": [20, 30, 40], "name": ["A", "B", "C"]})
        FileProcessor.write_csv(data, path)

        result = FileProcessor.analyze_data(path)
        assert result["success"] is True
        assert "age" in result["columns"]
        assert result["statistics"]["shape"]["rows"] == 3
    finally:
        os.unlink(path)
