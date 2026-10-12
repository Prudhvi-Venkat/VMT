"""Stage 01 - acquire NVD, MITRE, OSV, CISA KEV and EPSS source datasets.

Changes from the original:
- atomic downloads
- retry/backoff
- remote metadata checks for NVD/EPSS
- SHA-256 and source manifest metadata
- explicit feed status rather than silently treating failures as success
- dynamic current-year NVD/MITRE coverage
"""
from __future__ import annotations

import gzip
import json
import os
import shutil
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from tqdm import tqdm

from importlib.util import spec_from_file_location, module_from_spec
_spec = spec_from_file_location("common", Path(__file__).with_name("00_pipeline_common.py"))
_common = module_from_spec(_spec); _spec.loader.exec_module(_common)

load_dotenv()
log = _common.setup_logging("stage01")

WORK = Path(_common.get_working_dir())
NVD_DIR = WORK / "nvd_feeds"
MITRE_DIR = WORK / "mitre-cves"
OSV_DIR = WORK / "osv-zips"
EXTRACTED_DIR = WORK / "extracted_json"
for p in (NVD_DIR, MITRE_DIR, OSV_DIR, EXTRACTED_DIR): p.mkdir(parents=True, exist_ok=True)

CURRENT_YEAR = datetime.now(timezone.utc).year
NVD_BASE = "https://nvd.nist.gov/feeds/json/cve/2.0"
MITRE_URL = "https://github.com/CVEProject/cvelistV5/archive/refs/heads/main.zip"
OSV_BASE = "https://osv-vulnerabilities.storage.googleapis.com"
EPSS_BASE = "https://epss.cyentia.com"
KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
OSV_ECOSYSTEMS = [
    "AlmaLinux", "Alpine", "Android", "Bitnami", "crates.io", "Debian", "CRAN",
    "Chainguard", "GHC", "GIT", "GSD", "GitHub Actions", "Go", "Hackage", "Hex", "Linux",
    "Mageia", "Maven", "NuGet", "OSS-Fuzz", "Packagist", "Pub", "PyPI", "Red Hat", "Rocky Linux",
    "RubyGems", "SUSE", "SwiftURL", "UVI", "Ubuntu", "Wolfi", "npm", "openSUSE"
]


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": os.getenv("PIPELINE_USER_AGENT", "Enterprise-Vulnerability-Intel/2.0")})
    return s


def check_disk_space(target_dir: Path, min_mb: int = 1000):
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(str(target_dir.resolve()))
        free_mb = usage.free // (1024 * 1024)
        if free_mb < min_mb:
            raise RuntimeError(f"Insufficient free disk space in {target_dir}: {free_mb} MB available, {min_mb} MB required")
    except Exception as exc:
        if isinstance(exc, RuntimeError):
            raise
        log.warning("Could not determine disk usage for %s: %s", target_dir, exc)


def download(url: str, destination: Path, retries: int = 5) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp = destination.with_suffix(destination.suffix + ".part")
    max_download_bytes = int(os.getenv("PIPELINE_MAX_DOWNLOAD_MB", "5000")) * 1024 * 1024
    for attempt in range(1, retries + 1):
        try:
            with session().get(url, stream=True, timeout=(20, 120)) as r:
                r.raise_for_status()
                total = int(r.headers.get("content-length", 0))
                downloaded_bytes = 0
                with open(tmp, "wb") as fh, tqdm(total=total, unit="B", unit_scale=True, leave=False, desc=destination.name) as bar:
                    for chunk in r.iter_content(1024 * 1024):
                        if chunk:
                            downloaded_bytes += len(chunk)
                            if downloaded_bytes > max_download_bytes:
                                raise ValueError(f"Download size for {destination.name} exceeded cap ({max_download_bytes} bytes)")
                            fh.write(chunk); bar.update(len(chunk))
            for rep_attempt in range(5):
                try:
                    os.replace(tmp, destination)
                    break
                except PermissionError:
                    if rep_attempt == 4:
                        raise
                    time.sleep(0.5)
            return {"ok": True, "bytes": destination.stat().st_size, "sha256": _common.sha256_file(str(destination))}
        except Exception as exc:
            log.warning("Download failed %s attempt %s/%s: %s", url, attempt, retries, exc)
            try:
                if tmp.exists(): tmp.unlink()
            except Exception:
                pass
            if attempt < retries: time.sleep(min(2 ** attempt, 30))
    return {"ok": False, "bytes": 0, "sha256": None}


def nvd_meta(filename: str) -> str | None:
    try:
        r = session().get(f"{NVD_BASE}/{filename.replace('.json.zip', '.meta')}", timeout=20)
        r.raise_for_status()
        return r.text
    except Exception:
        return None


def meta_value(text: str | None, key: str) -> str | None:
    if not text: return None
    for line in text.splitlines():
        if line.startswith(key + ":"):
            return line.split(":", 1)[1].strip()
    return None


def fetch_nvd(manifest: list[dict]):
    files = [f"nvdcve-2.0-{year}.json.zip" for year in range(2002, CURRENT_YEAR + 1)] + ["nvdcve-2.0-modified.json.zip", "nvdcve-2.0-recent.json.zip"]
    for filename in files:
        target = NVD_DIR / filename
        remote = nvd_meta(filename)
        local_meta = target.with_suffix("").with_suffix(".meta")
        local_text = local_meta.read_text(encoding="utf-8") if local_meta.exists() else None
        local_date = meta_value(local_text, "lastModifiedDate")
        remote_date = meta_value(remote, "lastModifiedDate")
        current = target.exists() and bool(local_date) and bool(remote_date) and local_date == remote_date
        if current:
            log.info("NVD up-to-date: %s", filename)
            result = {"ok": True, "skipped": True, "bytes": target.stat().st_size, "sha256": _common.sha256_file(str(target))}
        else:
            log.info("Fetching NVD: %s", filename)
            result = download(f"{NVD_BASE}/{filename}", target)
            if result["ok"] and remote:
                local_meta.write_text(remote, encoding="utf-8")
        manifest.append({"source": "NVD", "feed": filename, **result})


def fetch_osv(manifest: list[dict]):
    for ecosystem in OSV_ECOSYSTEMS:
        filename = f"{ecosystem}_all.zip"
        target = OSV_DIR / filename
        metadata_path = OSV_DIR / f"{ecosystem}_metadata.json"
        
        # Validate existing archive integrity
        if target.exists() and not zipfile.is_zipfile(target):
            log.warning("Existing archive %s is not a valid zip file; removing to re-fetch", target.name)
            target.unlink(missing_ok=True)
            
        up_to_date = False
        remote_etag = None
        remote_last_modified = None
        if target.exists() and metadata_path.exists():
            try:
                cached_meta = json.loads(metadata_path.read_text(encoding="utf-8"))
                head_resp = session().head(f"{OSV_BASE}/{ecosystem}/all.zip", timeout=15)
                if head_resp.status_code == 200:
                    remote_etag = head_resp.headers.get("etag")
                    remote_last_modified = head_resp.headers.get("last-modified")
                    if remote_etag and cached_meta.get("etag") == remote_etag:
                        up_to_date = True
                    elif remote_last_modified and cached_meta.get("last_modified") == remote_last_modified:
                        up_to_date = True
            except Exception:
                pass

        if target.exists() and up_to_date:
            result = {
                "ok": True, "skipped": True, "bytes": target.stat().st_size, "sha256": _common.sha256_file(str(target))
            }
        else:
            result = download(f"{OSV_BASE}/{ecosystem}/all.zip", target) if not target.exists() else {
                "ok": True, "skipped": True, "bytes": target.stat().st_size, "sha256": _common.sha256_file(str(target))
            }

        meta_content = {
            "source": "OSV",
            "ecosystem": ecosystem,
            "checked_at": _common.utc_iso(),
            "etag": remote_etag,
            "last_modified": remote_last_modified,
            **result
        }
        metadata_path.write_text(json.dumps(meta_content, indent=2), encoding="utf-8")
        manifest.append({"source": "OSV", "feed": filename, **result})


def fetch_kev(manifest: list[dict]):
    target = EXTRACTED_DIR / "cisa_kev.json"
    try:
        data = session().get(KEV_URL, timeout=60); data.raise_for_status()
        _common.atomic_write_json(str(target), data.json())
        result = {"ok": True, "bytes": target.stat().st_size, "sha256": _common.sha256_file(str(target))}
    except Exception as exc:
        log.exception("CISA KEV download failed: %s", exc); result = {"ok": False, "error": str(exc)}
    manifest.append({"source":"CISA_KEV","feed":"known_exploited_vulnerabilities.json",**result})


def fetch_epss(manifest: list[dict]):
    data_path = WORK / "epss_score.csv.gz"; meta_path = WORK / "epss_score.metadata"
    try:
        remote_meta = session().get(f"{EPSS_BASE}/epss_scores-current.metadata", timeout=20).text
        local_meta = meta_path.read_text(encoding="utf-8") if meta_path.exists() else None
        if data_path.exists() and local_meta == remote_meta:
            result = {"ok":True,"skipped":True,"bytes":data_path.stat().st_size,"sha256":_common.sha256_file(str(data_path))}
        else:
            result = download(f"{EPSS_BASE}/epss_scores-current.csv.gz", data_path)
            if result["ok"]: meta_path.write_text(remote_meta, encoding="utf-8")
    except Exception as exc:
        log.exception("EPSS download failed: %s", exc); result={"ok":False,"error":str(exc)}
    manifest.append({"source":"EPSS","feed":"epss_scores-current.csv.gz",**result})


def fetch_mitre(manifest: list[dict]):
    target = MITRE_DIR / "mitre-all.zip"
    result = download(MITRE_URL, target)
    if result["ok"]:
        with zipfile.ZipFile(target) as z:
            available = set()
            for name in z.namelist():
                parts = name.split("/")
                if len(parts) > 3 and parts[0].startswith("cvelistV5") and parts[1] == "cves" and parts[2].isdigit(): available.add(int(parts[2]))
        result["years"] = sorted(y for y in available if 2002 <= y <= CURRENT_YEAR)
    manifest.append({"source":"MITRE","feed":"cvelistV5-main.zip",**result})


def main():
    manifest=[]; run=_common.run_id()
    log.info("STAGE 01 acquisition run=%s", run)
    check_disk_space(WORK, min_mb=1000)
    fetch_kev(manifest); fetch_epss(manifest); fetch_nvd(manifest); fetch_mitre(manifest); fetch_osv(manifest)
    _common.atomic_write_json(str(WORK / "acquisition_manifest.json"), {"run_id":run,"completed_at":_common.utc_iso(),"feeds":manifest})
    failures=[x for x in manifest if not x.get("ok")]
    if failures: raise RuntimeError(f"Stage 01 completed with {len(failures)} failed feeds")
    log.info("Stage 01 complete: %s feed artifacts", len(manifest))

if __name__ == "__main__": main()
