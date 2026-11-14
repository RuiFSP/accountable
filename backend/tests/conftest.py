"""Tests run on their own database, set before any app module is imported."""

import os
import tempfile
from pathlib import Path

_test_dir = tempfile.mkdtemp(prefix="accountable-tests-")
os.environ.setdefault("ACCOUNTABLE_DB", str(Path(_test_dir) / "test.db"))
