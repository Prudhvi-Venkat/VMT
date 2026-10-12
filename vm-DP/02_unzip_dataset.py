"""Stage 02 - safely materialize downloaded datasets for streaming processors."""
from __future__ import annotations
import json, os, shutil, zipfile
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
from importlib.util import spec_from_file_location, module_from_spec
_spec=spec_from_file_location("common",Path(__file__).with_name("00_pipeline_common.py")); common=module_from_spec(_spec); _spec.loader.exec_module(common)
log=common.setup_logging("stage02")
WORK=Path(common.get_working_dir()); NVD=WORK/"nvd_feeds"; MITRE=WORK/"mitre-cves"; OSV=WORK/"osv-zips"; OUT=WORK/"extracted_json"; OUT.mkdir(exist_ok=True)
MAX_MEMBER_MB=int(os.getenv("MAX_ZIP_MEMBER_MB","512")); MAX_TOTAL_MB=int(os.getenv("MAX_ZIP_TOTAL_MB","4096"))

def is_safe_member(member_name: str) -> bool:
    """Validate that zip member name does not attempt directory traversal (Zip Slip)."""
    if not member_name or not isinstance(member_name, str):
        return False
    parts = member_name.replace("\\", "/").split("/")
    if ".." in parts or "." in parts:
        return False
    if os.path.isabs(member_name) or member_name.startswith("/") or member_name.startswith("\\"):
        return False
    return True

def safe_extract_json(zip_path:Path, output:Path, prefix:str|None=None):
    if not zipfile.is_zipfile(zip_path):
        raise ValueError(f"Invalid or corrupted zip file: {zip_path}")
    total=0; count=0
    tmp = output.with_suffix(output.suffix + ".tmp")
    try:
        with zipfile.ZipFile(zip_path) as z, open(tmp, "w", encoding="utf-8") as out:
            out.write("[\n")
            first = True
            for info in z.infolist():
                if info.is_dir() or not info.filename.endswith(".json"): continue
                if not is_safe_member(info.filename):
                    raise ValueError(f"Path traversal sequence detected in zip member: {info.filename}")
                if prefix and not info.filename.startswith(prefix): continue
                if info.file_size > MAX_MEMBER_MB*1024*1024: raise ValueError(f"ZIP member too large: {info.filename}")
                total += info.file_size
                if total > MAX_TOTAL_MB*1024*1024: raise ValueError(f"ZIP total extracted size exceeds {MAX_TOTAL_MB} MB")
                raw = z.read(info)
                try:
                    json.loads(raw)
                except Exception as exc:
                    raise ValueError(f"Corrupt or invalid JSON in {zip_path.name}/{info.filename}: {exc}") from exc
                decoded = raw.decode("utf-8", errors="replace").strip()
                if not first:
                    out.write(",\n")
                out.write(decoded)
                first = False
                count += 1
            out.write("\n]\n")
        os.replace(tmp, output)
    finally:
        if tmp.exists():
            try: tmp.unlink()
            except Exception: pass
    return count

def extract_nvd():
    for zp in sorted(NVD.glob("*.json.zip")):
        out=OUT/f"nvd_{zp.name[:-9]}.json"
        if out.exists() and out.stat().st_mtime >= zp.stat().st_mtime: continue
        if not zipfile.is_zipfile(zp):
            log.warning("Skipping invalid or corrupted NVD zip archive: %s", zp.name)
            continue
        tmp = out.with_suffix(out.suffix + ".tmp")
        try:
            with zipfile.ZipFile(zp) as z:
                json_names=[n for n in z.namelist() if n.endswith('.json')]
                if len(json_names)!=1: raise ValueError(f"Expected one JSON in {zp.name}, found {len(json_names)}")
                if not is_safe_member(json_names[0]):
                    raise ValueError(f"Path traversal sequence detected in zip member: {json_names[0]}")
                with z.open(json_names[0]) as source, open(tmp, "wb") as target:
                    shutil.copyfileobj(source, target, length=1024 * 1024)
            os.replace(tmp, out)
        finally:
            if tmp.exists():
                try: tmp.unlink()
                except Exception: pass
        log.info("Extracted NVD %s",zp.name)

def extract_mitre():
    # Support consolidated mitre-all.zip archive if present (INFRA-005)
    all_zip = MITRE / "mitre-all.zip"
    if all_zip.exists() and zipfile.is_zipfile(all_zip):
        all_out = OUT / "mitre_all_cves.json"
        if not (all_out.exists() and all_out.stat().st_mtime >= all_zip.stat().st_mtime):
            count = safe_extract_json(all_zip, all_out, prefix="cves/")
            log.info("Extracted consolidated MITRE archive: %s records", count)

    for zp in sorted(MITRE.glob("mitre_*_cves.zip")):
        year=zp.name.split("_")[1]; out=OUT/f"mitre_{year}_cves.json"
        if out.exists() and out.stat().st_mtime >= zp.stat().st_mtime: continue
        if not zipfile.is_zipfile(zp):
            log.warning("Skipping invalid or corrupted MITRE zip archive: %s", zp.name)
            continue
        count=safe_extract_json(zp,out); log.info("Extracted MITRE %s: %s records",year,count)

def extract_osv():
    for zp in sorted(OSV.glob("*_all.zip")):
        if not zipfile.is_zipfile(zp):
            log.warning("Skipping invalid or corrupted OSV zip archive: %s", zp.name)
            continue
        eco=zp.name[:-8]; out=OUT/f"osv_{eco}.json"
        if out.exists() and out.stat().st_mtime >= zp.stat().st_mtime: continue
        count=safe_extract_json(zp,out); log.info("Extracted OSV %s: %s records",eco,count)

def main():
    log.info("STAGE 02 extraction"); extract_nvd(); extract_mitre(); extract_osv(); log.info("Stage 02 complete")
if __name__=="__main__": main()
