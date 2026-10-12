"""Shared helpers for the vulnerability intelligence compiler pipeline."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

import pymongo


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    return utc_now().isoformat().replace("+00:00", "Z")


def run_id() -> str:
    return f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"


def get_working_dir() -> str:
    path = os.getenv("WORKING_DIRECTORY", "./downloads")
    os.makedirs(path, exist_ok=True)
    return path


def connect_db() -> tuple[pymongo.MongoClient, pymongo.database.Database]:
    uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    name = (
        os.getenv("MONGO_DATABASE")
        or os.getenv("MONGO_DB")
        or os.getenv("DB_NAME")
        or os.getenv("DATABASE_NAME")
        or "security_intelligence"
    )
    client = pymongo.MongoClient(
        uri,
        maxPoolSize=int(os.getenv("MONGO_MAX_POOL_SIZE", "30")),
        serverSelectionTimeoutMS=int(os.getenv("MONGO_SERVER_SELECTION_TIMEOUT_MS", "10000")),
        retryWrites=True,
    )
    client.admin.command("ping")
    logging.getLogger("pipeline").info("Connected to MongoDB database: %s", name)
    return client, client[name]


def setup_logging(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
        logger.addHandler(handler)
    logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    logger.propagate = False
    return logger


def atomic_write_json(path: str, value: Any, indent: Optional[int] = 2) -> None:
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=directory, text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(value, fh, indent=indent, ensure_ascii=False, default=str)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def sha256_file(path: str, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def normalize_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def normalize_ecosystem(value: Any) -> Optional[str]:
    value = normalize_text(value)
    if not value:
        return None
    aliases = {
        "pypi": "PyPI", "python": "PyPI", "python package index": "PyPI",
        "maven central": "Maven", "maven": "Maven",
        "npm": "npm", "node.js": "npm", "nodejs": "npm",
        "crates.io": "crates.io", "crates": "crates.io",
        "golang": "Go", "go modules": "Go", "go": "Go",
        "nuget": "NuGet", "rubygems": "RubyGems", "packagist": "Packagist",
        "red hat": "Red Hat", "rhel": "Red Hat",
        "amazon linux": "Amazon Linux", "amazonlinux": "Amazon Linux",
        "ubuntu": "Ubuntu", "debian": "Debian", "alpine": "Alpine",
        "rocky linux": "Rocky Linux", "almalinux": "AlmaLinux",
        "suse": "SUSE", "opensuse": "openSUSE",
    }
    return aliases.get(value.lower(), value)


def classify_identifier(identifier: Any) -> str:
    value = str(identifier or "").upper().strip()
    prefixes = [
        ("CVE-", "cve"), ("GHSA-", "ghsa"), ("RUSTSEC-", "rustsec"),
        ("PYSEC-", "pysec"), ("GO-", "go"), ("BIT-", "bitnami"),
        ("OSV-", "osv"), ("RHSA-", "rhsa"), ("ALAS", "alas"),
        ("USN-", "usn"), ("DSA-", "dsa"), ("DLA-", "dla"),
        ("SUSE-", "suse"), ("MS", "microsoft"),
    ]
    for prefix, kind in prefixes:
        if value.startswith(prefix):
            return kind
    return "other"



def canonical_component_key(
    component_type: str,
    ecosystem: Optional[str],
    name: Optional[str],
    vendor: Optional[str] = None,
    namespace: Optional[str] = None,
    purl: Optional[str] = None,
    cpe: Optional[str] = None,
) -> str:
    parts = [
        component_type or "unknown",
        ecosystem or "",
        namespace or "",
        name or "",
        vendor or "",
        purl or "",
        cpe or "",
    ]
    raw = "|".join(str(x).strip().lower() for x in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
