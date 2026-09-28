"""Module: Reports & KPIs (backend/api/reports.py, backend/services/report_service.py)"""

import pytest

from helpers import ADMIN, ASSISTANT_1, book, future


@pytest.fixture
def activity(client):
    """A little booking activity so reports have data to aggregate."""
    date = future()
    book(client, resource_id=1, date=date, start=1, end=2)
    book(client, resource_id=2, date=date, start=3, end=3)
    pending = book(client, user_id=ASSISTANT_1, resource_id=3, date=date).json()["booking_id"]
    client.post(f"/api/approvals/{pending}/approve", json={"admin_user_id": ADMIN})


def test_counts(client, activity):
    res = client.get("/api/reports/counts")
    assert res.status_code == 200
    assert res.json()


@pytest.mark.parametrize("path", ["/api/reports/peak-load", "/api/reports/conflicts", "/api/reports/tat"])
def test_list_reports_return_lists(client, activity, path):
    res = client.get(path)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_utilisation_reports(client, activity):
    assert client.get("/api/reports/utilisation").status_code == 200
    detailed = client.get("/api/reports/lab-utilisation").json()
    assert detailed["summary"]["total_rooms_tracked"] == 11


@pytest.mark.parametrize("report_type", ["lab_utilisation", "utilisation", "peak-load", "conflicts", "tat"])
def test_csv_exports(client, activity, report_type):
    res = client.get(f"/api/reports/export-csv?report_type={report_type}")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "attachment" in res.headers["content-disposition"]


def test_groq_config_masks_placeholder_key(client, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_your_groq_api_key_here")
    res = client.get("/api/reports/groq-config")
    assert res.status_code == 200
    assert res.json()["groq_api_key"] == ""
