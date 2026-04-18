"""Unit-тесты для context managers move_with_rollback + write_with_rollback."""
import os
from contextlib import ExitStack

import pytest

from app.fs_utils import move_with_rollback, write_with_rollback


class TestMoveWithRollback:
    def test_happy_move(self, tmp_path):
        src = tmp_path / "src.txt"
        src.write_bytes(b"content")
        dst = tmp_path / "dst.txt"
        with move_with_rollback(str(src), str(dst)):
            pass
        assert not src.exists()
        assert dst.read_bytes() == b"content"

    def test_exception_inside_triggers_rollback(self, tmp_path):
        src = tmp_path / "src.txt"
        src.write_bytes(b"content")
        dst = tmp_path / "dst.txt"
        with pytest.raises(RuntimeError):
            with move_with_rollback(str(src), str(dst)):
                assert dst.exists()
                raise RuntimeError("simulated db failure")
        assert not dst.exists()

    def test_multi_file_rollback_via_exitstack(self, tmp_path):
        srcs = [tmp_path / f"src{i}.txt" for i in range(2)]
        dsts = [tmp_path / f"dst{i}.txt" for i in range(2)]
        for i, src in enumerate(srcs):
            src.write_bytes(f"content{i}".encode())
        with pytest.raises(RuntimeError):
            with ExitStack() as stack:
                for src, dst in zip(srcs, dsts):
                    stack.enter_context(move_with_rollback(str(src), str(dst)))
                raise RuntimeError("simulated failure")
        for dst in dsts:
            assert not dst.exists()


class TestWriteWithRollback:
    def test_happy_write(self, tmp_path):
        path = tmp_path / "file.txt"
        with write_with_rollback(str(path), b"content"):
            pass
        assert path.read_bytes() == b"content"

    def test_exception_triggers_rollback(self, tmp_path):
        path = tmp_path / "file.txt"
        with pytest.raises(RuntimeError):
            with write_with_rollback(str(path), b"content"):
                assert path.exists()
                raise RuntimeError("simulated db failure")
        assert not path.exists()
