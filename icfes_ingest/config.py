"""Credentials and tunables. Secrets come only from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

ENDPOINT_VARS = ("AZURE_DI_ENDPOINT", "DOCUMENTINTELLIGENCE_ENDPOINT", "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
KEY_VARS = ("AZURE_DI_KEY", "DOCUMENTINTELLIGENCE_KEY", "AZURE_DOCUMENT_INTELLIGENCE_KEY")

MODEL_ID = "prebuilt-layout"


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Credentials:
    endpoint: str
    key: str = field(repr=False)  # never printed


def _first_env(names: tuple[str, ...]) -> str | None:
    for n in names:
        v = os.environ.get(n, "").strip()
        if v:
            return v
    return None


def load_credentials() -> Credentials:
    endpoint, key = _first_env(ENDPOINT_VARS), _first_env(KEY_VARS)
    missing = []
    if not endpoint:
        missing.append(" or ".join(ENDPOINT_VARS))
    if not key:
        missing.append(" or ".join(KEY_VARS))
    if missing:
        raise ConfigError("Missing environment variable(s): " + "; ".join(missing))
    return Credentials(endpoint=endpoint.rstrip("/"), key=key)


@dataclass
class Settings:
    max_pages_per_request: int = 100      # split PDFs with more pages than this
    max_request_bytes: int = 100 * 1024 * 1024  # S0 allows 500 MB; F0 only 4 MB -> lower this on F0
    max_retries: int = 6
    retry_base_delay: float = 2.0
    retry_max_delay: float = 120.0
    workers: int = 1
    keep_work: bool = False
    retry_failed: bool = False
    remove_blue: bool = False             # whiten blue ink (answer dots / notes) before OCR
    features: tuple[str, ...] = ()        # paid Azure add-ons, e.g. ("formulas", "ocrHighResolution")
