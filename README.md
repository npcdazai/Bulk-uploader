# Lead Pusher — bulk lead-distribution pipeline

A production-grade system that ingests bulk lead spreadsheets (Excel) and pushes
each lead, one at a time, into third-party lending-partner REST APIs — with
**deduplication, rate limiting, retries, and per-batch result reporting**. It is
decoupled and queue-based so it can reliably process hundreds of thousands of
rows, and partitioned by **vendor** so the same code runs per partner via one env
var (`VENDOR_FOLDER_NAME`).

Files are stored in **XAMPP / Apache `htdocs`** (in place of S3).

## Monorepo
| App | What it is |
|-----|------------|
| [`frontend/`](frontend/) | React 19 + Chakra v3 internal upload UI (auth gate + upload form) |
| [`uploader/`](uploader/) | Backend pipeline — 5 cooperating PM2 workers |

## Quick start
```bash
# 1) infra — DEDICATED, isolated Redis + RabbitMQ (own ports, won't mix with
#    or appear in any other broker's portal). Runs RabbitMQ :5673 / UI :15673
#    and Redis :6380.
cd uploader && docker compose up -d
# start XAMPP (Apache) and: mkdir -p "$HTDOCS_BASE_PATH"

# 2) backend
cp .env.example .env && npm install
npm test                                   # dedupe decision unit test
npm run pm2:start                          # runs all 5 processes

# 3) frontend
cd ../frontend && cp .env.example .env && npm install && npm run dev
```

See [`uploader/README.md`](uploader/README.md) for the architecture diagram,
reliability design (non-blocking retry/backoff, concurrency + pacing, streaming),
and how to add a partner; see [`frontend/README.md`](frontend/README.md) for the UI.

# Bulk-uploader
