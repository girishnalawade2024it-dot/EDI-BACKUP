"""
CLI Launcher for the Campus Resource Booking System Backend
"""

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import uvicorn
from backend.database.connection import init_db

if __name__ == "__main__":
    print("=" * 60)
    print("Starting Campus Resource Booking System Backend...")
    print("Initializing SQLite Database and Schema...")
    init_db()
    print("Database ready.")
    print("Web Portal:  http://localhost:8000/login.html")
    print("Swagger API: http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
