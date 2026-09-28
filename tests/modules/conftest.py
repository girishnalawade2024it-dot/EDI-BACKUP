"""
Shared fixtures for the per-module test suites.
Each GitHub Actions module workflow runs one file from this folder.
"""

import pytest
from starlette.testclient import TestClient

from backend.database.connection import init_db
from backend.main import app


@pytest.fixture(autouse=True)
def fresh_db():
    """Every test starts from a freshly created and seeded database."""
    init_db(force=True)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
