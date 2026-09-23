"""
Concurrency & Advisory Mutex Manager
Layer 1 of the Three-Layer Concurrency Defense (DD-5).
Provides thread-safe, bounded-wait mutual exclusion locks keyed on (resource_id, date)
to serialize booking transactions for the same room-day.
"""

import threading
import time
from typing import Dict, Tuple

# Lock registry keyed by (resource_id, date_string)
_mutexes: Dict[Tuple[int, str], threading.Lock] = {}
_registry_lock = threading.Lock()

DEFAULT_LOCK_TIMEOUT_SECONDS = 5.0


def _get_lock(resource_id: int, lock_date: str) -> threading.Lock:
    key = (resource_id, str(lock_date))
    with _registry_lock:
        if key not in _mutexes:
            _mutexes[key] = threading.Lock()
        return _mutexes[key]


class AdvisoryMutex:
    """
    Context manager acquiring a mutex for (resource_id, lock_date)
    with a bounded timeout. Bounded wait prevents indefinite blocking/deadlock (FR-4.6).
    """

    def __init__(self, resource_id: int, lock_date: str, timeout: float = DEFAULT_LOCK_TIMEOUT_SECONDS):
        self.resource_id = resource_id
        self.lock_date = str(lock_date)
        self.timeout = timeout
        self.lock = _get_lock(resource_id, lock_date)
        self.acquired = False

    def __enter__(self):
        start = time.time()
        self.acquired = self.lock.acquire(timeout=self.timeout)
        if not self.acquired:
            raise TimeoutError(
                f"Lock acquisition timed out after {self.timeout}s for resource {self.resource_id} on {self.lock_date}. Please retry."
            )
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.acquired:
            try:
                self.lock.release()
            except RuntimeError:
                pass
            self.acquired = False
