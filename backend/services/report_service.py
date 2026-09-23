"""
Reporting & Descriptive KPIs Service
Implements SRS §7 (FR-9.1 – FR-9.6) and CSV Export.
Reports are purely historical/descriptive (DC-3).
"""

import csv
import io
import sqlite3
from typing import Any, Dict, List, Optional


import datetime


def get_detailed_lab_utilisation_report(
    conn: sqlite3.Connection,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    resource_id: Optional[int] = None,
    resource_type: Optional[str] = None,
    block: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Comprehensive Lab-Wise & Resource-Wise Utilisation and Analytics Engine.
    Computes booked hours, idle capacity, purpose distribution (academic vs maintenance),
    headcount efficiency, peak contending slots, and executive insights.
    """
    cur = conn.cursor()

    # Determine reporting date range
    if start_date and end_date:
        try:
            d_start = datetime.date.fromisoformat(start_date)
            d_end = datetime.date.fromisoformat(end_date)
            num_days = max(1, (d_end - d_start).days + 1)
        except Exception:
            num_days = 7
    elif start_date:
        num_days = 7
    else:
        # Check actual span of bookings in system or default to 5 working days (1 week)
        cur.execute("SELECT MIN(schedule_date) AS min_d, MAX(schedule_date) AS max_d FROM booking_schedule")
        b_span = cur.fetchone()
        if b_span and b_span["min_d"] and b_span["max_d"]:
            try:
                d_min = datetime.date.fromisoformat(b_span["min_d"])
                d_max = datetime.date.fromisoformat(b_span["max_d"])
                num_days = max(1, (d_max - d_min).days + 1)
            except Exception:
                num_days = 5
        else:
            num_days = 5

    # 9 bookable periods per working day (SRS §10.3)
    available_hours_per_room = float(num_days * 9)

    # 1. Fetch all resources with full subtype specs and assigned staff
    query = """
        SELECT r.resource_id, r.room_code, r.resource_type, r.capacity, r.status, r.description,
               b.block_code, b.block_name, r.floor_number,
               l.lab_name, l.has_machines, l.machine_count, l.os_installed,
               l.has_projector AS lab_proj, l.has_ac AS lab_ac,
               u_inc.full_name AS lab_incharge_name,
               c.seating_type, c.has_projector AS rm_proj, c.has_smart_board, c.has_ac AS rm_ac, c.board_type, c.is_exam_approved
        FROM resources r
        JOIN blocks b ON b.block_id = r.block_id
        LEFT JOIN laboratories l ON l.resource_id = r.resource_id
        LEFT JOIN users u_inc ON u_inc.user_id = l.lab_incharge_user_id
        LEFT JOIN classrooms c ON c.resource_id = r.resource_id
        WHERE 1=1
    """
    params = []
    if resource_id:
        query += " AND r.resource_id = ?"
        params.append(resource_id)
    if resource_type:
        query += " AND r.resource_type = ?"
        params.append(resource_type)
    if block:
        query += " AND b.block_code = ?"
        params.append(block)

    query += " ORDER BY r.resource_type DESC, r.room_code ASC"
    cur.execute(query, tuple(params))
    rooms = cur.fetchall()

    lab_items = []
    total_booked_hours_campus = 0.0
    total_avail_hours_campus = 0.0
    total_headcount_campus = 0
    total_conflicts_campus = 0

    for rm in rooms:
        r_id = rm["resource_id"]

        # Date filter for schedule query
        date_cond = ""
        date_params = [r_id]
        if start_date and end_date:
            date_cond = " AND bs.schedule_date BETWEEN ? AND ?"
            date_params.extend([start_date, end_date])
        elif start_date:
            date_cond = " AND bs.schedule_date >= ?"
            date_params.append(start_date)

        # Query booked slots and distribution
        cur.execute(
            f"""
            SELECT bs.slot_id, b.booking_id, b.booking_type, b.expected_headcount, ts.slot_code, ts.slot_name
            FROM booking_schedule bs
            JOIN bookings b ON b.booking_id = bs.booking_id
            JOIN time_slots ts ON ts.slot_id = bs.slot_id
            WHERE bs.resource_id = ?
              AND bs.occupancy_state = 'ACTIVE'
              {date_cond}
            """,
            tuple(date_params),
        )
        schedules = cur.fetchall()

        booked_slots = len(schedules)
        booked_hours = float(booked_slots)  # 1 hour per period
        idle_hours = max(0.0, available_hours_per_room - booked_hours)
        util_pct = round((booked_hours / available_hours_per_room) * 100.0, 1) if available_hours_per_room > 0 else 0.0

        # Unique bookings & headcount
        unique_booking_ids = set()
        academic_hours = 0.0
        maintenance_hours = 0.0
        exam_hours = 0.0
        total_headcount = 0
        slot_frequency = {}

        for s in schedules:
            unique_booking_ids.add(s["booking_id"])
            b_type = (s["booking_type"] or "").upper()
            if "MAINTENANCE" in b_type:
                maintenance_hours += 1.0
            elif "EXAM" in b_type:
                exam_hours += 1.0
            else:
                academic_hours += 1.0

            slot_code = s["slot_code"]
            slot_frequency[slot_code] = slot_frequency.get(slot_code, 0) + 1

        # Calculate headcount for approved bookings in range
        cur.execute(
            f"""
            SELECT SUM(COALESCE(expected_headcount, 0)) AS total_hc, COUNT(*) AS cnt
            FROM bookings
            WHERE resource_id = ?
              AND status = 'APPROVED'
              {("AND booking_date BETWEEN ? AND ?" if start_date and end_date else "AND booking_date >= ?" if start_date else "")}
            """,
            tuple([r_id, start_date, end_date] if start_date and end_date else [r_id, start_date] if start_date else [r_id]),
        )
        hc_row = cur.fetchone()
        if hc_row and hc_row["total_hc"]:
            total_headcount = hc_row["total_hc"]

        # Conflict count for this room
        cur.execute(
            f"""
            SELECT COUNT(*) AS c
            FROM booking_conflicts
            WHERE resource_id = ?
              {("AND conflict_date BETWEEN ? AND ?" if start_date and end_date else "AND conflict_date >= ?" if start_date else "")}
            """,
            tuple([r_id, start_date, end_date] if start_date and end_date else [r_id, start_date] if start_date else [r_id]),
        )
        conflicts_count = cur.fetchone()["c"]

        # Peak slot
        peak_slot = "—"
        if slot_frequency:
            peak_slot = max(slot_frequency.items(), key=lambda x: x[1])[0]

        # Utilisation status classification
        if util_pct >= 65.0:
            status_tag = "HIGH_DEMAND"
            status_label = "High Demand / Contended"
        elif util_pct >= 25.0:
            status_tag = "OPTIMAL"
            status_label = "Optimal Utilisation"
        else:
            status_tag = "UNDERUTILISED"
            status_label = "Underutilised"

        # Display name
        display_name = rm["lab_name"] if rm["lab_name"] else (rm["description"] or f"Room {rm['room_code']}")

        item = {
            "resource_id": r_id,
            "room_code": rm["room_code"],
            "resource_type": rm["resource_type"],
            "display_name": display_name,
            "block": rm["block_code"],
            "floor_number": rm["floor_number"],
            "capacity": rm["capacity"],
            "has_machines": bool(rm["has_machines"]) if rm["has_machines"] is not None else False,
            "machine_count": rm["machine_count"] or 0,
            "os_installed": rm["os_installed"] or "—",
            "incharge": rm["lab_incharge_name"] or "Faculty Incharge",
            "has_projector": bool(rm["lab_proj"] or rm["rm_proj"]),
            "has_ac": bool(rm["lab_ac"] or rm["rm_ac"]),
            "booked_hours": booked_hours,
            "available_hours": available_hours_per_room,
            "idle_hours": idle_hours,
            "utilisation_pct": util_pct,
            "total_approved_bookings": len(unique_booking_ids),
            "academic_hours": academic_hours,
            "maintenance_hours": maintenance_hours,
            "exam_hours": exam_hours,
            "total_headcount_served": total_headcount,
            "conflict_count": conflicts_count,
            "peak_slot": peak_slot,
            "status_tag": status_tag,
            "status_label": status_label,
        }

        lab_items.append(item)
        total_booked_hours_campus += booked_hours
        total_avail_hours_campus += available_hours_per_room
        total_headcount_campus += total_headcount
        total_conflicts_campus += conflicts_count

    # Sort by utilisation descending
    lab_items.sort(key=lambda x: x["utilisation_pct"], reverse=True)

    # Executive Summary Insights
    campus_util_pct = round((total_booked_hours_campus / total_avail_hours_campus) * 100.0, 1) if total_avail_hours_campus > 0 else 0.0
    highest_lab = lab_items[0] if lab_items else None
    lowest_lab = lab_items[-1] if lab_items else None

    summary = {
        "date_range": f"{start_date or 'Baseline'} to {end_date or 'Current'}",
        "reporting_days": num_days,
        "total_rooms_tracked": len(lab_items),
        "total_labs": sum(1 for x in lab_items if x["resource_type"] == "Lab"),
        "total_classrooms": sum(1 for x in lab_items if x["resource_type"] == "Classroom"),
        "campus_booked_hours": total_booked_hours_campus,
        "campus_available_hours": total_avail_hours_campus,
        "campus_idle_hours": max(0.0, total_avail_hours_campus - total_booked_hours_campus),
        "campus_utilisation_pct": campus_util_pct,
        "total_students_served": total_headcount_campus,
        "total_conflicts_prevented": total_conflicts_campus,
        "highest_utilised": {
            "room_code": highest_lab["room_code"],
            "name": highest_lab["display_name"],
            "pct": highest_lab["utilisation_pct"],
        } if highest_lab else None,
        "lowest_utilised": {
            "room_code": lowest_lab["room_code"],
            "name": lowest_lab["display_name"],
            "pct": lowest_lab["utilisation_pct"],
        } if lowest_lab else None,
    }

    return {"summary": summary, "labs": lab_items}


def get_utilisation_report(
    conn: sqlite3.Connection,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    resource_type: Optional[str] = None,
    block: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Backwards-compatible flat list for existing APIs, delegating to the comprehensive engine.
    """
    detailed = get_detailed_lab_utilisation_report(
        conn,
        start_date=start_date,
        end_date=end_date,
        resource_type=resource_type,
        block=block,
    )
    return detailed["labs"]


def get_booking_counts_report(conn: sqlite3.Connection) -> Dict[str, Any]:
    """
    SRS FR-9.2:
    Count of requests by status, by user role, by resource.
    """
    cur = conn.cursor()

    # By status
    cur.execute("SELECT status, COUNT(*) AS count FROM bookings GROUP BY status")
    by_status = {row["status"]: row["count"] for row in cur.fetchall()}

    # By role
    cur.execute(
        """
        SELECT r.role_code, COUNT(b.booking_id) AS count
        FROM roles r
        LEFT JOIN users u ON u.role_id = r.role_id
        LEFT JOIN bookings b ON b.requested_by_user_id = u.user_id
        GROUP BY r.role_code
        """
    )
    by_role = {row["role_code"]: row["count"] for row in cur.fetchall()}

    # By resource
    cur.execute(
        """
        SELECT r.room_code, COUNT(b.booking_id) AS count
        FROM resources r
        LEFT JOIN bookings b ON b.resource_id = r.resource_id
        GROUP BY r.room_code
        ORDER BY count DESC
        """
    )
    by_resource = [dict(row) for row in cur.fetchall()]

    return {"by_status": by_status, "by_role": by_role, "by_resource": by_resource}


def get_peak_load_report(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """
    SRS FR-9.3:
    Booking count by slot and day of the week to identify most contended time periods.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT ts.slot_code, ts.slot_name, ts.start_time, ts.end_time,
               COUNT(bs.schedule_id) AS booking_count
        FROM time_slots ts
        LEFT JOIN booking_schedule bs ON bs.slot_id = ts.slot_id AND bs.occupancy_state = 'ACTIVE'
        WHERE ts.is_break = 0
        GROUP BY ts.slot_id
        ORDER BY ts.slot_order ASC
        """
    )
    return [dict(row) for row in cur.fetchall()]


def get_conflict_report(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """
    SRS FR-9.4:
    Count of rejected-on-conflict submissions and auto-denials.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT bc.conflict_id, bc.conflict_type, bc.resolution, bc.conflict_date,
               r.room_code, ts.slot_code, bc.detected_at
        FROM booking_conflicts bc
        JOIN resources r ON r.resource_id = bc.resource_id
        JOIN time_slots ts ON ts.slot_id = bc.slot_id
        ORDER BY bc.detected_at DESC
        """
    )
    return [dict(row) for row in cur.fetchall()]


def get_approval_tat_report(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """
    SRS FR-9.5:
    Approval Turnaround Time (TAT) metrics.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT b.booking_id, b.booking_reference, b.status, b.requested_at, b.decided_at,
               u.full_name AS requester_name,
               approver.full_name AS approver_name
        FROM bookings b
        JOIN users u ON u.user_id = b.requested_by_user_id
        LEFT JOIN users approver ON approver.user_id = b.approved_by_user_id
        WHERE b.decided_at IS NOT NULL
        ORDER BY b.decided_at DESC
        """
    )
    rows = cur.fetchall()
    results = []
    for r in rows:
        results.append(dict(r))
    return results


def export_report_to_csv(data: List[Dict[str, Any]]) -> str:
    """Generates standard CSV string from list of dicts."""
    if not data:
        return ""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(data[0].keys()))
    writer.writeheader()
    writer.writerows(data)
    return output.getvalue()


def export_lab_utilisation_csv(detailed: Dict[str, Any]) -> str:
    """
    Generates an executive-ready, highly insightful CSV report for Lab & Resource Utilisation.
    Includes institutional summary KPIs and detailed facility-wise accounting.
    """
    summary = detailed.get("summary", {})
    labs = detailed.get("labs", [])

    output = io.StringIO()
    writer = csv.writer(output)

    # 1. Executive Summary Header
    writer.writerow(["# CAMPUS RESOURCE BOOKING SYSTEM — LAB & CLASSROOM UTILISATION AUDIT REPORT"])
    writer.writerow(["# Reporting Period", summary.get("date_range", "All Active Period")])
    writer.writerow(["# Total Reporting Days", summary.get("reporting_days", 0)])
    writer.writerow(["# Facilities Evaluated", f"{summary.get('total_rooms_tracked', 0)} ({summary.get('total_labs', 0)} Labs, {summary.get('total_classrooms', 0)} Classrooms)"])
    writer.writerow(["# Overall Campus Utilisation", f"{summary.get('campus_utilisation_pct', 0.0)}%"])
    writer.writerow(["# Campus Booked Hours", f"{summary.get('campus_booked_hours', 0.0)} hrs"])
    writer.writerow(["# Campus Available Capacity", f"{summary.get('campus_available_hours', 0.0)} hrs"])
    writer.writerow(["# Campus Idle Hours", f"{summary.get('campus_idle_hours', 0.0)} hrs"])
    writer.writerow(["# Total Students / Headcount Accommodated", summary.get("total_students_served", 0)])
    writer.writerow(["# Contention / Conflicts Successfully Prevented", summary.get("total_conflicts_prevented", 0)])
    if summary.get("highest_utilised"):
        hu = summary["highest_utilised"]
        writer.writerow(["# Highest Utilised Facility", f"{hu.get('room_code')} - {hu.get('name')} ({hu.get('pct')}% utilisation)"])
    if summary.get("lowest_utilised"):
        lu = summary["lowest_utilised"]
        writer.writerow(["# Lowest Utilised Facility", f"{lu.get('room_code')} - {lu.get('name')} ({lu.get('pct')}% utilisation)"])
    writer.writerow(["# Generated At", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
    writer.writerow([])  # Blank separator line

    # 2. Detailed Columns
    headers = [
        "Room Code",
        "Facility Name",
        "Resource Type",
        "Block",
        "Floor",
        "Seating Capacity",
        "Has Computers",
        "Machine Count",
        "OS / Platform",
        "Facility Incharge",
        "Booked Hours",
        "Available Hours",
        "Idle Hours",
        "Utilisation Rate (%)",
        "Approved Bookings Count",
        "Academic Hours",
        "Maintenance Hours",
        "Exam Hours",
        "Headcount Accommodated",
        "Conflict Incidents",
        "Peak Demand Period",
        "Capacity Status",
    ]
    writer.writerow(headers)

    for item in labs:
        writer.writerow([
            item.get("room_code"),
            item.get("display_name"),
            item.get("resource_type"),
            item.get("block"),
            item.get("floor_number", "—"),
            item.get("capacity") or "—",
            "YES" if item.get("has_machines") else "NO",
            item.get("machine_count", 0),
            item.get("os_installed", "—"),
            item.get("incharge", "—"),
            f"{item.get('booked_hours', 0.0):.1f}",
            f"{item.get('available_hours', 0.0):.1f}",
            f"{item.get('idle_hours', 0.0):.1f}",
            f"{item.get('utilisation_pct', 0.0):.1f}%",
            item.get("total_approved_bookings", 0),
            f"{item.get('academic_hours', 0.0):.1f}",
            f"{item.get('maintenance_hours', 0.0):.1f}",
            f"{item.get('exam_hours', 0.0):.1f}",
            item.get("total_headcount_served", 0),
            item.get("conflict_count", 0),
            item.get("peak_slot", "—"),
            item.get("status_label", "—"),
        ])

    return output.getvalue()
