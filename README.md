# VMT — Vulnerability Management Platform

Unified multi-tenant vulnerability intelligence and management platform container stack.

## Architecture & Services

The platform consists of five cooperating container services orchestrated via Docker Compose:

| Service | Technology | Ports | Purpose |
|---|---|---|---|
| **`frontend`** | Next.js 16 (App Router, Redux) | `3000:3000` | Security dashboards, asset management, tenant administration |
| **`backend`** | Node.js, Express, MongoDB driver | `5000:5000` | Multi-tenant REST API, authorization policy engine, scan processing |
| **`mongodb`** | MongoDB 7.0 | `27017:27017` | Authoritative storage for tenant records, intelligence feeds, assets |
| **`mailpit`** | Mailpit | `8025:8025` (Web)<br>`1025:1025` (SMTP) | Local email capture and testing server |
| **`data-processing`** | Python 3.12, PyMongo, ijson | On-demand | Vulnerability intelligence acquisition (NVD, OSV, CVE) |

---

## Getting Started

### 1. Prerequisites
- Docker Engine 24+ and Docker Compose v2+
- Git

### 2. Configuration
Copy the sample environment file:
```bash
cp .env.example .env
```
Customize `JWT_SECRET` and ports if required.

### 3. Spin Up Core Platform
To start the database, mail server, backend API, and frontend web console:
```bash
docker compose up -d --build
```

Access the services:
- **Frontend Web UI**: [http://localhost:3000](http://localhost:3000)
- **Backend API & Swagger Docs**: [http://localhost:5000/api/docs](http://localhost:5000/api/docs)
- **Mailpit Web UI (Emails)**: [http://localhost:8025](http://localhost:8025)
- **MongoDB**: `localhost:27017`

### 4. Running the Vulnerability Intelligence Pipeline
The `data-processing` service is configured with the `pipeline` profile so it runs on demand without stalling web platform startup:
```bash
docker compose --profile pipeline up data-processing
```

Or run partial stages using environment overrides:
```bash
docker compose run --rm -e PIPELINE_START_STAGE=3 -e PIPELINE_END_STAGE=5 data-processing
```

### 5. Stopping Services
```bash
docker compose down
```
To stop and remove persistent volumes (warning: deletes database data):
```bash
docker compose down -v
```
