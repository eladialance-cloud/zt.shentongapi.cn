# -*- coding: utf-8 -*-
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from capabilities import storage  # noqa: E402


def test_local_store_append_query_count():
    root = tempfile.mkdtemp()
    try:
        store = storage.LocalStore(root)
        assert store.available is True
        record = store.append("demo", {"date": "2026-09-09", "content": "hi"})
        assert record["id"]
        assert store.count("demo") == 1
        assert store.count("demo", {"date": "2026-09-09"}) == 1
        assert store.query("demo", {"date": "2026-09-09"})[0]["content"] == "hi"
        assert store.query("demo", {"date": "2026-09-10"}) == []
        assert store.query("demo", limit=1)[0]["content"] == "hi"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_local_store_creates_missing_root():
    root = os.path.join(tempfile.mkdtemp(), "nested", "data")
    try:
        store = storage.LocalStore(root)
        store.append("demo", {"a": 1})
        assert os.path.exists(store.path_for("demo"))
    finally:
        shutil.rmtree(os.path.dirname(os.path.dirname(root)), ignore_errors=True)


def test_query_survives_corrupt_file():
    root = tempfile.mkdtemp()
    try:
        store = storage.LocalStore(root)
        with open(store.path_for("demo"), "w", encoding="utf-8") as handle:
            handle.write("{ not json")
        assert store.query("demo") == []
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_collection_name_is_sanitized():
    root = tempfile.mkdtemp()
    try:
        store = storage.LocalStore(root)
        path = store.path_for("a/../b")
        assert os.path.dirname(path) == os.path.abspath(root)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_feishu_backend_is_reserved_and_unavailable():
    store = storage.get_store({"storage_backend": "feishu"})
    assert store.available is False
    assert store.reason
    result = store.append("demo", {})
    assert result["code"] == "STORAGE_BACKEND_UNAVAILABLE"


def test_get_store_defaults_to_local():
    root = tempfile.mkdtemp()
    try:
        store = storage.get_store({"storage_root": root})
        assert store.backend == "local"
        assert store.available is True
    finally:
        shutil.rmtree(root, ignore_errors=True)

