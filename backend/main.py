"""
Main FastAPI Application Entry Point
Lab & Classroom Resource Booking System
"""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from backend.database.connection import init_db
from backend.api import (
    admin,
    approvals,
    audit_logs,
    auth,
    bookings,
    notifications,
    reports,
    resources,
    slots,
)

ROOT_DIR = Path(__file__).resolve().parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure database and seed data are ready
    init_db()
    yield


app = FastAPI(
    title="Campus Classroom & Lab Resource Booking System API",
    version="1.1.0",
    description="Backend API powering the Lab & Classroom Resource Booking Portal.",
    lifespan=lifespan,
)

# Enable CORS for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router)
app.include_router(resources.router)
app.include_router(slots.router)
app.include_router(bookings.router)
app.include_router(approvals.router)
app.include_router(reports.router)
app.include_router(audit_logs.router)
app.include_router(notifications.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["Health"])
def health_check():
    return {"status": "healthy", "version": "1.1.0", "mode": "Python FastAPI + SQLite"}


# Mount static frontend directories so whole project can be served by one command
# Admin, Faculty, Assistant, Assets, HTML
app.mount("/assets", StaticFiles(directory=str(ROOT_DIR / "assets")), name="assets")
app.mount("/admin", StaticFiles(directory=str(ROOT_DIR / "admin"), html=True), name="admin")
app.mount("/faculty", StaticFiles(directory=str(ROOT_DIR / "faculty"), html=True), name="faculty")
app.mount("/assistant", StaticFiles(directory=str(ROOT_DIR / "assistant"), html=True), name="assistant")


@app.get("/")
def root():
    return RedirectResponse(url="/login.html")


# Mount top-level static HTML files (login.html, index.html)
app.mount("/", StaticFiles(directory=str(ROOT_DIR), html=True), name="root_static")
