# Data Pipeline Guidelines

## Purpose and Layout

`vm-DP` downloads, normalizes, enriches, and analyzes vulnerability intelligence before storing canonical records in MongoDB. The numbered scripts are ordered stages: `01_nvd_mitre_osv_fetch.py` downloads feeds, `02_unzip_dataset.py` extracts them, `03` and `04` build component/CVE databases, `05` enriches identities, `06` computes analytics, and `07` synchronizes vendor intelligence. `pipeline_runner.py` runs stages sequentially and stops on failure.

Raw archives and metadata are stored in `downloads/nvd_feeds`, `downloads/mitre-cves`, and `downloads/osv-zips`; derived JSON is written to `downloads/extracted_json`. These are generated outputs. Do not hand-edit them, commit large feed updates casually, or delete historical evidence to make a run pass.

## Running Locally

Create a Python environment and install `requirements.txt`. Set `WORKING_DIRECTORY` to the pipeline data directory and `MONGO_URI` to the intended MongoDB instance. Run `python pipeline_runner.py` from `vm-DP`. For a bounded run, set `PIPELINE_START_STAGE` and `PIPELINE_END_STAGE`; set `SKIP_VENDOR_SYNC=true` when vendor synchronization is not intended. `docker compose up` starts the containerized pipeline configuration.

## Implementation Rules

Use four-space indentation, snake_case for Python identifiers, and preserve the numbered script names. Make stages idempotent: reuse current files when metadata shows they are fresh, and avoid duplicate canonical records. Preserve source provenance and log actionable failures without secrets. Changes to schemas, MongoDB collections, or stage ordering require updates to the relevant backend contracts and documentation.

There is currently no dedicated automated test suite for this pipeline. Validate changes with a bounded stage run against test data or a safe local MongoDB, inspect output counts and schemas, and never run a full network-heavy refresh merely as a documentation check.
