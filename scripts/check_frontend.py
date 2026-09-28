"""
Frontend module smoke check (used by .github/workflows/module-frontend.yml).

For every HTML page in the given folders it:
  1. checks that each local <script src>, <link href>, <img src> and <a href> points at a real file
  2. requests the page through the FastAPI app and expects HTTP 200

Usage:  python scripts/check_frontend.py admin faculty assistant .
        ("." checks the top-level pages: login.html, index.html)
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from starlette.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402

REF_PATTERN = re.compile(r"""(?:src|href)\s*=\s*["']([^"'#?]+)""", re.IGNORECASE)
SKIP_PREFIXES = ("http://", "https://", "//", "mailto:", "tel:", "javascript:", "data:", "{", "$")


def local_refs(html: str):
    for ref in REF_PATTERN.findall(html):
        ref = ref.strip()
        if ref and not ref.startswith(SKIP_PREFIXES):
            yield ref


def check_folder(folder: str, client: TestClient) -> list:
    errors = []
    base = ROOT / folder
    pages = sorted(base.glob("*.html"))
    if not pages:
        return [f"{folder}: no HTML pages found"]

    for page in pages:
        rel_page = page.relative_to(ROOT).as_posix()
        html = page.read_text(encoding="utf-8", errors="replace")

        for ref in local_refs(html):
            target = (ROOT / ref.lstrip("/")) if ref.startswith("/") else (page.parent / ref)
            if not target.resolve().exists():
                errors.append(f"{rel_page}: broken reference -> {ref}")

        res = client.get("/" + rel_page)
        if res.status_code != 200:
            errors.append(f"{rel_page}: served with HTTP {res.status_code}")
        else:
            print(f"  ok  /{rel_page}")
    return errors


def main(folders):
    errors = []
    with TestClient(app) as client:
        for folder in folders:
            print(f"[{folder}]")
            errors += check_folder(folder, client)

    if errors:
        print("\nFrontend check failed:")
        for e in errors:
            print("  - " + e)
        sys.exit(1)
    print("\nFrontend check passed.")


if __name__ == "__main__":
    main(sys.argv[1:] or ["admin", "faculty", "assistant", "."])
