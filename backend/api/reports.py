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


@router.get("/groq-config")
def groq_config():
    """Returns Groq API key and model from environment variables if configured in .env."""
    import os
    raw_key = os.getenv("GROQ_API_KEY", "").strip()
    # Mask if it's the example placeholder
    if raw_key in ("your_groq_api_key_here", "gsk_your_groq_api_key_here"):
        raw_key = ""
    return {
        "groq_api_key": raw_key,
        "groq_model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
    }


ACTIVE_GROQ_FALLBACK_MODELS = [
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "deepseek-r1-distill-llama-70b",
    "llama3-70b-8192",
    "llama3-8b-8192",
]


@router.get("/groq-models")
def list_groq_models(api_key: Optional[str] = Query(None)):
    """
    Fetches accessible Groq models using either the provided key or .env key.
    Filters out non-chat models (whisper, guard, embeddings) so user gets working chat models.
    """
    import json
    import os
    import urllib.request
    import urllib.error

    if not isinstance(api_key, str):
        api_key = getattr(api_key, "default", None)
    key = (api_key or "").strip()
    if not key or key in ("your_groq_api_key_here", "gsk_your_groq_api_key_here"):
        key = os.getenv("GROQ_API_KEY", "").strip()
        if key in ("your_groq_api_key_here", "gsk_your_groq_api_key_here"):
            key = ""

    if not key:
        return {"success": False, "error": "No Groq API key provided or found in .env"}

    # Strip formatting artifacts
    key = key.strip("'\"")
    if key.lower().startswith("bearer "):
        key = key[7:].strip()

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/models",
        headers={
            "Authorization": f"Bearer {key}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CampusBooking/1.1",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            all_models = data.get("data", [])
            # Filter for chat-compatible models
            chat_models = [
                m["id"] for m in all_models
                if not any(skip in m.get("id", "").lower() for skip in ("whisper", "guard", "embedding", "tts", "safeguard"))
            ]
            # Sort with preferred priority models on top
            def _sort_key(m_id):
                try:
                    return ACTIVE_GROQ_FALLBACK_MODELS.index(m_id)
                except ValueError:
                    return 999
            chat_models.sort(key=_sort_key)
            return {"success": True, "models": chat_models, "raw_count": len(all_models)}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        try:
            parsed = json.loads(err_body)
            msg = parsed.get("error", {}).get("message", err_body)
        except Exception:
            msg = err_body
        return {"success": False, "status_code": e.code, "error": msg}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/groq-insights")
def generate_groq_insights(body: dict):
    """
    Generates AI Utilisation Insights via Groq API.
    Handles model deprecation gracefully by auto-retrying with active models if requested model fails.
    """
    import json
    import os
    import urllib.request
    import urllib.error

    key = (body.get("api_key") or "").strip()
    if not key or key in ("your_groq_api_key_here", "gsk_your_groq_api_key_here"):
        key = os.getenv("GROQ_API_KEY", "").strip()
        if key in ("your_groq_api_key_here", "gsk_your_groq_api_key_here"):
            key = ""

    if not key:
        return Response(
            content=json.dumps({"error": "No Groq API key provided or found in .env"}),
            status_code=400,
            media_type="application/json",
        )

    key = key.strip("'\"")
    if key.lower().startswith("bearer "):
        key = key[7:].strip()

    model = body.get("model") or os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    dataset = body.get("dataset", {})

    system_prompt = (
        "You are a Senior Higher-Education Campus Resource Auditor and Operations Analyst.\n"
        "Analyze the provided campus facility utilisation data and provide a concise, high-impact executive brief.\n"
        "Your response MUST be organized into these three distinct numbered sections:\n"
        "1. Executive Assessment & Contention Bottlenecks (highlight peak facilities, strain points)\n"
        "2. Facility Load Rebalancing Strategy (recommend shifts from contended to underutilised labs)\n"
        "3. Actionable Administrative Recommendations (concrete timetable/slot adjustments)\n"
        "Keep your analysis executive-ready, professional, and within 200-250 words. Do not use markdown headers larger than ###."
    )

    def _call_groq(target_model: str):
        payload = json.dumps({
            "model": target_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Campus Resource Utilisation Dataset:\n{json.dumps(dataset, indent=2)}"}
            ],
            "temperature": 0.3,
            "max_tokens": 650,
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=payload,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CampusBooking/1.1",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            res_data = json.loads(resp.read().decode())
            return res_data["choices"][0]["message"]["content"]

    try:
        content = _call_groq(model)
        return {"success": True, "insights": content, "model_used": model, "fallback": False}
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode()
        try:
            parsed = json.loads(err_msg)
            msg = parsed.get("error", {}).get("message", err_msg)
        except Exception:
            msg = err_msg

        # If model does not exist, deprecated, or user lacks access, attempt fallback
        if e.code == 404 or "does not exist" in msg.lower() or "not have access" in msg.lower() or "deprecated" in msg.lower():
            # Gather candidate models: first query dynamic account models, fallback to curated list
            candidates = []
            models_res = list_groq_models(api_key=key)
            if models_res.get("success") and models_res.get("models"):
                candidates.extend(models_res["models"])
            for m in ACTIVE_GROQ_FALLBACK_MODELS:
                if m not in candidates and m != model:
                    candidates.append(m)

            # Try candidates
            for candidate in candidates:
                if candidate == model:
                    continue
                try:
                    content = _call_groq(candidate)
                    return {
                        "success": True,
                        "insights": content,
                        "model_used": candidate,
                        "fallback": True,
                        "original_model": model,
                        "available_models": candidates,
                    }
                except Exception:
                    continue

            return Response(
                content=json.dumps({
                    "error": f"The requested model '{model}' is not available and fallback candidates failed.",
                    "details": msg,
                    "available_models": candidates,
                }),
                status_code=404,
                media_type="application/json",
            )

        return Response(
            content=json.dumps({"error": msg}),
            status_code=e.code,
            media_type="application/json",
        )
    except Exception as exc:
        return Response(
            content=json.dumps({"error": str(exc)}),
            status_code=500,
            media_type="application/json",
        )


