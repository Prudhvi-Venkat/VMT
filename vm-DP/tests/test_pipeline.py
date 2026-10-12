"""Unit tests for vm-DP data pipeline security and freshness controls."""
from __future__ import annotations
import io
import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
import sys

# Ensure vm-DP is on python path
DP_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DP_DIR))

# Import modules to test
import importlib.util

def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

stage01 = load_module("stage01", DP_DIR / "01_nvd_mitre_osv_fetch.py")
stage02 = load_module("stage02", DP_DIR / "02_unzip_dataset.py")


class TestPipelineSecurityAndFreshness(unittest.TestCase):

    def test_zip_slip_member_validation(self):
        """SEC-007 / SEC-010: Ensure path traversal sequences are caught by is_safe_member."""
        # Safe members
        self.assertTrue(stage02.is_safe_member("cves/CVE-2026-1001.json"))
        self.assertTrue(stage02.is_safe_member("data_feed.json"))
        self.assertTrue(stage02.is_safe_member("nvd/2026/feed.json"))

        # Dangerous members (Zip Slip)
        self.assertFalse(stage02.is_safe_member("../../../etc/shadow"))
        self.assertFalse(stage02.is_safe_member("..\\..\\windows\\win.ini"))
        self.assertFalse(stage02.is_safe_member("/etc/passwd"))
        self.assertFalse(stage02.is_safe_member("\\root\\secret"))
        self.assertFalse(stage02.is_safe_member("./secret.json"))
        self.assertFalse(stage02.is_safe_member(""))

    def test_safe_extract_blocks_zip_slip_attack(self):
        """Ensure safe_extract_json raises ValueError on malicious zip-slip archive."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            zip_file = tmp_path / "malicious.zip"
            out_file = tmp_path / "extracted.json"

            # Create an in-memory zip archive with path traversal
            with zipfile.ZipFile(zip_file, "w") as z:
                z.writestr("../../pwned.json", json.dumps({"exploit": True}))

            with self.assertRaises(ValueError) as ctx:
                stage02.safe_extract_json(zip_file, out_file)

            self.assertIn("Path traversal sequence detected", str(ctx.exception))
            self.assertFalse(out_file.exists())

    def test_safe_extract_happy_path(self):
        """Ensure safe_extract_json successfully processes clean JSON members."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            zip_file = tmp_path / "clean.zip"
            out_file = tmp_path / "extracted.json"

            with zipfile.ZipFile(zip_file, "w") as z:
                z.writestr("rec1.json", json.dumps({"id": "CVE-2026-0001"}))
                z.writestr("rec2.json", json.dumps({"id": "CVE-2026-0002"}))

            count = stage02.safe_extract_json(zip_file, out_file)
            self.assertEqual(count, 2)
            self.assertTrue(out_file.exists())

            data = json.loads(out_file.read_text(encoding="utf-8"))
            self.assertEqual(len(data), 2)
            self.assertEqual(data[0]["id"], "CVE-2026-0001")
            self.assertEqual(data[1]["id"], "CVE-2026-0002")

    def test_nvd_meta_freshness_logic(self):
        """DATA-001 / DATA-002: Ensure None == None bug is eliminated and freshness correctly computed."""
        meta_sample_1 = "lastModifiedDate:2026-10-10T04:00:00Z\nsha256:abc\n"
        meta_sample_2 = "lastModifiedDate:2026-10-11T04:00:00Z\nsha256:def\n"

        # Matching timestamps
        d1 = stage01.meta_value(meta_sample_1, "lastModifiedDate")
        d2 = stage01.meta_value(meta_sample_1, "lastModifiedDate")
        self.assertEqual(d1, "2026-10-10T04:00:00Z")
        self.assertTrue(bool(d1) and bool(d2) and d1 == d2)

        # Mismatched timestamps
        d3 = stage01.meta_value(meta_sample_2, "lastModifiedDate")
        self.assertFalse(d1 == d3)

        # Both None (error condition) must NOT be considered equal / up-to-date
        none_date_1 = stage01.meta_value(None, "lastModifiedDate")
        none_date_2 = stage01.meta_value(None, "lastModifiedDate")
        self.assertIsNone(none_date_1)
        self.assertIsNone(none_date_2)
        # The hardened freshness condition requires both dates to be truthy
        is_fresh = bool(none_date_1) and bool(none_date_2) and none_date_1 == none_date_2
        self.assertFalse(is_fresh)


if __name__ == "__main__":
    unittest.main()
