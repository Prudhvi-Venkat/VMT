# syntax=docker/dockerfile:1

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WORKING_DIRECTORY=/app/downloads

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt

COPY 00_pipeline_common.py .
COPY 01_nvd_mitre_osv_fetch.py .
COPY 02_unzip_dataset.py .
COPY 03_nvd_components_database.py .
COPY 04_nvd_to_cve_database.py .
COPY 05_vulnerability_identity_enrichment.py .
COPY 06_vulnerability_analytics.py .
COPY 07_vendor_intelligence_sync.py .
COPY pipeline_runner.py .

RUN mkdir -p /app/downloads

CMD ["python", "pipeline_runner.py"]
