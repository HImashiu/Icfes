"""Retry with exponential backoff + jitter; honours Retry-After on 429/503."""
from __future__ import annotations

import logging
import random
import threading
import time
from typing import Callable, TypeVar

from azure.core.exceptions import HttpResponseError, ServiceRequestError, ServiceResponseError

log = logging.getLogger("icfes_ingest")
T = TypeVar("T")

RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}
sleep = time.sleep  # monkeypatched in tests


class Interrupted(RuntimeError):
    pass


def classify(exc: BaseException) -> tuple[bool, float | None]:
    """Return (retryable, retry_after_seconds)."""
    if isinstance(exc, HttpResponseError):
        status = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
        retry_after = None
        headers = getattr(getattr(exc, "response", None), "headers", None) or {}
        try:
            if headers.get("retry-after-ms"):
                retry_after = float(headers["retry-after-ms"]) / 1000.0
            elif headers.get("Retry-After"):
                retry_after = float(headers["Retry-After"])
        except (ValueError, TypeError):
            retry_after = None  # e.g. an HTTP-date; fall back to backoff
        return (status in RETRYABLE_STATUS), retry_after
    if isinstance(exc, (ServiceRequestError, ServiceResponseError, ConnectionError, TimeoutError)):
        return True, None
    if isinstance(exc, TransientError):
        return True, None
    return False, None


class TransientError(RuntimeError):
    """Raised by our own validation (e.g. page-count mismatch) when a retry may help."""


def call_with_retry(fn: Callable[[], T], *, what: str, max_retries: int, base_delay: float,
                    max_delay: float, stop: threading.Event | None = None) -> T:
    attempt = 0
    while True:
        if stop is not None and stop.is_set():
            raise Interrupted("stopped")
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - classified below
            retryable, retry_after = classify(exc)
            if not retryable or attempt >= max_retries:
                if retryable:
                    log.error("%s: giving up after %d retries: %s", what, attempt, exc)
                raise
            delay = min(max_delay, base_delay * (2 ** attempt))
            delay = max(delay * random.uniform(0.75, 1.25), min(retry_after or 0, max_delay))
            attempt += 1
            log.warning("%s: transient error (%s); retry %d/%d in %.1fs", what, type(exc).__name__, attempt, max_retries, delay)
            sleep(delay)
