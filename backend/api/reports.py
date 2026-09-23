"""
Reports API Endpoints
SRS §7 (FR-9.1 – FR-9.6)
"""

from typing import Optional
from fastapi import APIRouter, Query, Response
from backend.database.connection import get_db
from backend.services.report_service import (
    export_lab_utilisation_csv,
    export_report_to_csv,
    get_approval_tat_report,
    get_booking_counts_report,
    get_conflict_report,
    get_detailed_lab_utilisation_report,
    get_peak_load_report,
    get_utilisation_report,
)

router = APIRouter(prefix="/api/reports", tags=["Reports & KPIs"])


@router.get("/lab-utilisation")
def lab_utilisation(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    resource_id: Optional[int] = Query(None),
    resource_type: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
):
    with get_db() as conn:
        return get_detailed_lab_utilisation_report(
            conn,
            start_date=start_date,
            end_date=end_date,
            resource_id=resource_id,
            resource_type=resource_type,
            block=block,
        )


@router.get("/utilisation")
def utilisation(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
):
    with get_db() as conn:
        return get_utilisation_report(conn, start_date, end_date, resource_type, block)


@router.get("/counts")
def counts():
    with get_db() as conn:
        return get_booking_counts_report(conn)


@router.get("/peak-load")
def peak_load():
    with get_db() as conn:
        return get_peak_load_report(conn)


@router.get("/conflicts")
def conflicts():
    with get_db() as conn:
        return get_conflict_report(conn)


@router.get("/tat")
def tat():
    with get_db() as conn:
        return get_approval_tat_report(conn)


@router.get("/export-csv")
def export_csv(
    report_type: str = Query(..., description="utilisation, lab_utilisation, peak-load, conflicts, tat"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
):
    with get_db() as conn:
        if report_type in ("lab_utilisation", "lab-utilisation"):
            detailed = get_detailed_lab_utilisation_report(
                conn, start_date=start_date, end_date=end_date, resource_type=resource_type, block=block
            )
            csv_content = export_lab_utilisation_csv(detailed)
            filename = "executive_lab_utilisation_report.csv"
        elif report_type == "utilisation":
            detailed = get_detailed_lab_utilisation_report(
                conn, start_date=start_date, end_date=end_date, resource_type=resource_type, block=block
            )
            csv_content = export_lab_utilisation_csv(detailed)
            filename = "utilisation_report.csv"
        elif report_type == "peak-load":
            data = get_peak_load_report(conn)
            csv_content = export_report_to_csv(data)
            filename = "peak-load_report.csv"
        elif report_type == "conflicts":
            data = get_conflict_report(conn)
            csv_content = export_report_to_csv(data)
            filename = "conflicts_report.csv"
        elif report_type == "tat":
            data = get_approval_tat_report(conn)
            csv_content = export_report_to_csv(data)
            filename = "tat_report.csv"
        else:
            csv_content = ""
            filename = f"{report_type}_report.csv"

        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
