#!/usr/bin/env python3
"""
Enterprise Vulnerability Intelligence Pipeline Runner.

Runs stages 01 -> 07 sequentially and stops immediately if a stage fails.

Features:
- Sequential stage orchestration
- Configurable start/end stage
- Optional vendor sync skip
- Retry support for failed stages
- Pipeline/stage execution summaries
- Persistent pipeline run metadata in MongoDB (optional)
- Local run log
- Single-run locking to prevent concurrent executions
- Dry-run mode
- Graceful SIGINT/SIGTERM handling
- Environment propagation to every stage

Environment variables:
    PIPELINE_START_STAGE=1
    PIPELINE_END_STAGE=7
    SKIP_VENDOR_SYNC=false
    PIPELINE_MAX_RETRIES=0
    PIPELINE_RETRY_DELAY_SECONDS=10
    PIPELINE_DRY_RUN=false
    PIPELINE_LOCK_FILE=/tmp/vulnerability_pipeline.lock
    PIPELINE_LOG_FILE=/app/logs/pipeline_runner.log
    PIPELINE_RUN_COLLECTION=pipeline_runs
    PIPELINE_PERSIST_RUN=true
    WORKING_DIRECTORY=/app/downloads

Mongo persistence uses the same MongoDB environment variables consumed by
00_pipeline_common.py:
    MONGO_URI
    MONGO_DATABASE (aliases: MONGO_DB, DB_NAME, DATABASE_NAME; default: security_intelligence)

The runner itself does not replace 00_pipeline_common.py. The stage scripts
continue to use pipeline_common for shared MongoDB/utilities.
"""

from __future__ import annotations

import atexit
import json
import os
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent

STAGES = {
    1: "01_nvd_mitre_osv_fetch.py",
    2: "02_unzip_dataset.py",
    3: "03_nvd_components_database.py",
    4: "04_nvd_to_cve_database.py",
    5: "05_vulnerability_identity_enrichment.py",
    6: "06_vulnerability_analytics.py",
    7: "07_vendor_intelligence_sync.py",
}

_pipeline_run_id = (
    datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    + "-"
    + uuid.uuid4().hex[:8]
)

_lock_path: Path | None = None
_lock_acquired = False
_shutdown_requested = False


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def get_int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def get_float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def log(message: str) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{timestamp}] {message}"
    print(line, flush=True)

    log_file = os.getenv("PIPELINE_LOG_FILE")
    if not log_file:
        return

    try:
        path = Path(log_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError as exc:
        print(
            f"[{timestamp}] WARNING: unable to write pipeline log: {exc}",
            file=sys.stderr,
            flush=True,
        )


def acquire_lock(lock_path: Path) -> None:
    """
    Create an exclusive lock file.

    This intentionally uses a simple OS-level exclusive create so the runner
    has no external dependency just to prevent overlapping pipeline runs.
    """
    global _lock_path, _lock_acquired

    lock_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        fd = os.open(
            str(lock_path),
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o644,
        )
    except FileExistsError:
        existing = ""
        try:
            existing = lock_path.read_text(encoding="utf-8")[:1000]
        except OSError:
            pass

        raise RuntimeError(
            f"Another pipeline run appears to be active. "
            f"Lock file: {lock_path}. "
            f"Existing lock information: {existing or 'unavailable'}"
        )

    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "pipeline_run_id": _pipeline_run_id,
                "pid": os.getpid(),
                "started_at": utc_now_iso(),
                "hostname": os.uname().nodename if hasattr(os, "uname") else None,
            },
            handle,
            indent=2,
        )

    _lock_path = lock_path
    _lock_acquired = True


def release_lock() -> None:
    global _lock_acquired

    if not _lock_acquired or _lock_path is None:
        return

    try:
        _lock_path.unlink(missing_ok=True)
    except OSError as exc:
        log(f"WARNING: unable to remove pipeline lock: {exc}")
    finally:
        _lock_acquired = False


atexit.register(release_lock)


def handle_shutdown(signum: int, _frame: Any) -> None:
    global _shutdown_requested
    _shutdown_requested = True

    signal_name = signal.Signals(signum).name
    log(f"Shutdown requested via {signal_name}. Current stage will be stopped.")


def validate_configuration() -> tuple[int, int, bool, int, float, bool]:
    start = max(1, get_int_env("PIPELINE_START_STAGE", 1))
    end = min(7, get_int_env("PIPELINE_END_STAGE", 7))

    if start > end:
        raise ValueError(
            f"PIPELINE_START_STAGE ({start}) cannot be greater than "
            f"PIPELINE_END_STAGE ({end})."
        )

    max_retries = max(0, get_int_env("PIPELINE_MAX_RETRIES", 0))
    retry_delay = max(0.0, get_float_env("PIPELINE_RETRY_DELAY_SECONDS", 10.0))
    skip_vendor = get_bool_env("SKIP_VENDOR_SYNC", False)
    dry_run = get_bool_env("PIPELINE_DRY_RUN", False)

    return start, end, skip_vendor, max_retries, retry_delay, dry_run


def validate_stage_files(start: int, end: int, skip_vendor: bool) -> None:
    for number in range(start, end + 1):
        if number == 7 and skip_vendor:
            continue

        script_path = BASE_DIR / STAGES[number]
        if not script_path.exists():
            raise FileNotFoundError(
                f"Stage {number:02d} not found: {script_path}"
            )


def run_stage(
    number: int,
    script: str,
    max_retries: int,
    retry_delay: float,
    dry_run: bool,
) -> dict[str, Any]:
    script_path = BASE_DIR / script

    if not script_path.exists():
        raise FileNotFoundError(
            f"Stage {number:02d} not found: {script_path}"
        )

    attempts = 0
    started_at = utc_now_iso()
    started_monotonic = time.monotonic()

    log("")
    log("=" * 80)
    log(f"STAGE {number:02d} | {script}")
    log("=" * 80)

    if dry_run:
        log(f"DRY RUN: would execute {sys.executable} {script_path}")
        return {
            "stage": number,
            "script": script,
            "status": "DRY_RUN",
            "attempts": 0,
            "started_at": started_at,
            "completed_at": utc_now_iso(),
            "duration_seconds": 0.0,
            "exit_code": None,
        }

    while attempts <= max_retries:
        if _shutdown_requested:
            raise KeyboardInterrupt("Shutdown requested before stage execution.")

        attempts += 1

        log(
            f"Starting Stage {number:02d}, attempt "
            f"{attempts}/{max_retries + 1}"
        )

        result = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(BASE_DIR),
            env=os.environ.copy(),
            check=False,
        )

        elapsed = time.monotonic() - started_monotonic

        if result.returncode == 0:
            log(
                f"STAGE {number:02d} completed successfully "
                f"in {elapsed:.1f}s."
            )
            return {
                "stage": number,
                "script": script,
                "status": "SUCCESS",
                "attempts": attempts,
                "started_at": started_at,
                "completed_at": utc_now_iso(),
                "duration_seconds": round(elapsed, 3),
                "exit_code": 0,
            }

        log(
            f"STAGE {number:02d} failed with exit code "
            f"{result.returncode} after {elapsed:.1f}s."
        )

        if attempts <= max_retries:
            log(
                f"Retrying Stage {number:02d} in "
                f"{retry_delay:.1f}s..."
            )
            time.sleep(retry_delay)
        else:
            return {
                "stage": number,
                "script": script,
                "status": "FAILED",
                "attempts": attempts,
                "started_at": started_at,
                "completed_at": utc_now_iso(),
                "duration_seconds": round(elapsed, 3),
                "exit_code": result.returncode,
            }

    raise RuntimeError("Unexpected pipeline retry state.")


def persist_pipeline_run(document: dict[str, Any]) -> None:
    """
    Persist pipeline execution metadata when MongoDB is configured.

    Persistence is best-effort by default so a MongoDB logging failure does
    not hide the actual pipeline result. Set PIPELINE_PERSIST_RUN_REQUIRED=true
    if run metadata must be persisted successfully.
    """
    if not get_bool_env("PIPELINE_PERSIST_RUN", True):
        return

    try:
        # Import only when persistence is requested. This keeps the runner
        # usable for dry runs and environments without pymongo.
        from importlib.util import spec_from_file_location, module_from_spec
        common_path = BASE_DIR / "00_pipeline_common.py"
        spec = spec_from_file_location("common", common_path)
        common = module_from_spec(spec)
        spec.loader.exec_module(common)

        _, db = common.connect_db()
        collection_name = os.getenv(
            "PIPELINE_RUN_COLLECTION",
            "pipeline_runs",
        )
        collection = db[collection_name]

        collection.create_index("run_id", unique=True)
        collection.create_index("started_at")
        collection.create_index("status")

        collection.update_one(
            {"run_id": document["run_id"]},
            {"$set": document},
            upsert=True,
        )

        log(
            f"Pipeline run metadata persisted to "
            f"{db.name}.{collection_name}."
        )

    except Exception as exc:
        message = f"Unable to persist pipeline run metadata: {exc}"

        if get_bool_env("PIPELINE_PERSIST_RUN_REQUIRED", False):
            raise RuntimeError(message) from exc

        log(f"WARNING: {message}")


def print_summary(
    run_id: str,
    started_monotonic: float,
    stages: list[dict[str, Any]],
    status: str,
) -> None:
    elapsed = time.monotonic() - started_monotonic

    log("")
    log("=" * 80)
    log("PIPELINE SUMMARY")
    log("=" * 80)
    log(f"Run ID: {run_id}")

    for stage in stages:
        duration = stage.get("duration_seconds", 0.0)
        attempts = stage.get("attempts", 0)
        log(
            f"Stage {stage['stage']:02d}  "
            f"{stage['status']:<10}  "
            f"{duration:>9.1f}s  "
            f"attempts={attempts}"
        )

    log("-" * 80)
    log(f"STATUS: {status}")
    log(f"TOTAL DURATION: {elapsed:.1f}s")
    log("=" * 80)


def main() -> int:
    started_monotonic = time.monotonic()
    started_at = utc_now_iso()
    stage_results: list[dict[str, Any]] = []

    start, end, skip_vendor, max_retries, retry_delay, dry_run = (
        validate_configuration()
    )

    lock_path = Path(
        os.getenv(
            "PIPELINE_LOCK_FILE",
            "/tmp/vulnerability_intelligence_pipeline.lock",
        )
    )

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    acquire_lock(lock_path)

    try:
        validate_stage_files(start, end, skip_vendor)

        log("=" * 80)
        log("VULNERABILITY DATA PIPELINE")
        log(f"Run ID: {_pipeline_run_id}")
        log(f"Stages: {start:02d} -> {end:02d}")
        log(
            "WORKING_DIRECTORY="
            f"{os.getenv('WORKING_DIRECTORY', '/app/downloads')}"
        )
        log(f"MAX_RETRIES={max_retries}")
        log(f"RETRY_DELAY_SECONDS={retry_delay}")
        log(f"SKIP_VENDOR_SYNC={skip_vendor}")
        log(f"DRY_RUN={dry_run}")
        log(f"BASE_DIR={BASE_DIR}")
        log("=" * 80)

        if dry_run:
            log("DRY RUN enabled. No stage will modify data.")

        for number in range(start, end + 1):
            if number == 7 and skip_vendor:
                log("Skipping Stage 07 because SKIP_VENDOR_SYNC is enabled.")
                stage_results.append(
                    {
                        "stage": 7,
                        "script": STAGES[7],
                        "status": "SKIPPED",
                        "attempts": 0,
                        "started_at": utc_now_iso(),
                        "completed_at": utc_now_iso(),
                        "duration_seconds": 0.0,
                        "exit_code": None,
                    }
                )
                continue

            result = run_stage(
                number,
                STAGES[number],
                max_retries,
                retry_delay,
                dry_run,
            )
            stage_results.append(result)

            if result["status"] == "FAILED":
                completed_at = utc_now_iso()
                document = {
                    "run_id": _pipeline_run_id,
                    "status": "FAILED",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "start_stage": start,
                    "end_stage": end,
                    "skip_vendor_sync": skip_vendor,
                    "dry_run": dry_run,
                    "stages": stage_results,
                }

                try:
                    persist_pipeline_run(document)
                finally:
                    print_summary(
                        _pipeline_run_id,
                        started_monotonic,
                        stage_results,
                        "FAILED",
                    )

                return 1

        completed_at = utc_now_iso()
        final_status = "DRY_RUN" if dry_run else "SUCCESS"

        document = {
            "run_id": _pipeline_run_id,
            "status": final_status,
            "started_at": started_at,
            "completed_at": completed_at,
            "start_stage": start,
            "end_stage": end,
            "skip_vendor_sync": skip_vendor,
            "dry_run": dry_run,
            "stages": stage_results,
        }

        persist_pipeline_run(document)

        print_summary(
            _pipeline_run_id,
            started_monotonic,
            stage_results,
            final_status,
        )

        return 0

    except KeyboardInterrupt:
        completed_at = utc_now_iso()
        document = {
            "run_id": _pipeline_run_id,
            "status": "INTERRUPTED",
            "started_at": started_at,
            "completed_at": completed_at,
            "start_stage": start,
            "end_stage": end,
            "skip_vendor_sync": skip_vendor,
            "dry_run": dry_run,
            "stages": stage_results,
        }

        try:
            persist_pipeline_run(document)
        except Exception as exc:
            log(f"WARNING: unable to persist interruption state: {exc}")

        print_summary(
            _pipeline_run_id,
            started_monotonic,
            stage_results,
            "INTERRUPTED",
        )
        return 130

    except Exception as exc:
        log(f"PIPELINE FAILED: {exc}")

        document = {
            "run_id": _pipeline_run_id,
            "status": "FAILED",
            "started_at": started_at,
            "completed_at": utc_now_iso(),
            "start_stage": start,
            "end_stage": end,
            "skip_vendor_sync": skip_vendor,
            "dry_run": dry_run,
            "error": str(exc),
            "stages": stage_results,
        }

        try:
            persist_pipeline_run(document)
        except Exception as persist_exc:
            log(
                "WARNING: unable to persist failure state: "
                f"{persist_exc}"
            )

        print_summary(
            _pipeline_run_id,
            started_monotonic,
            stage_results,
            "FAILED",
        )
        return 1

    finally:
        release_lock()


if __name__ == "__main__":
    raise SystemExit(main())
