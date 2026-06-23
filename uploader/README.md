# Lead Pusher — uploader (backend pipeline)

Bulk lead-distribution pipeline. Ingests lead spreadsheets, pushes each lead one
at a time into a lending partner's REST API with **deduplication, rate limiting,
retries, and per-batch result reporting**. Decoupled and queue-based so it can
reliably process hundreds of thousands of rows, and **partitioned by vendor** so
the same code runs per partner via one env var (`VENDOR_FOLDER_NAME`).

Files are stored in **XAMPP / Apache `htdocs`** (instead of S3): every object is
written under `HTDOCS_BASE_PATH` and is served by Apache at `FILE_BASE_URL`.

## Architecture — 5 PM2-managed processes

The processes never call each other directly. They coordinate **only** through
shared infrastructure (htdocs store + Redis + RabbitMQ), all vendor-namespaced.

| # | Process | File | Role |
|---|---------|------|------|
| 1 | HTTP API | `src/server.js` | `POST /api/upload` → validate headers → stream to htdocs → register state in Redis |
| 2 | Store Watcher | `src/storeWatcher.js` | Poll `uploaded-files`, register new files in Redis, prune deleted |
| 3 | Downloader | `src/storeDownloader.js` | FIFO-scan Redis for `isDownloaded:false`, copy file to local disk |
| 4 | Producer | `src/fileReaderAndPublisher.js` | Stream xlsx (constant memory), publish one durable message per row |
| 5 | Consumer | `src/consumer.js` | Dedupe-check → create-lead (if not dup) → summary xlsx; retries w/ backoff |

```
            ┌─────────┐   htdocs    ┌─────────┐   redis    ┌────────────┐
 upload ───▶│ server  │────────────▶│ watcher │───────────▶│ downloader │
            └─────────┘  (file)     └─────────┘  (state)   └─────┬──────┘
                                                                 │ local copy
                                                                 ▼
            ┌──────────┐   summary   ┌──────────┐  rabbitmq  ┌──────────┐
 partner ◀──│ consumer │◀────────────│  queue   │◀───────────│ producer │
   API      └──────────┘             └──────────┘            └──────────┘
```

### Storage layout (htdocs keys)
```
{vendor}/{Mon-yyyy}/uploaded-files/{timestamp}_{vendor}_Leads.xlsx
{vendor}/{Mon-yyyy}/summary-files/{timestamp}_{vendor}_Summary.xlsx
```

### Redis state per file — `store_file:{vendor}:{key}`
```
{ isDownloaded, isProcessed, downloadPath, totalRows, pushedRows,
  batchSize, delayBetweenBatches, originalName, createdAt }
```
`batchSize` / `delayBetweenBatches` are captured **from the frontend at upload
time** and stamped onto every published message, so the consumer honours the
exact values the operator chose (they are not hardcoded).

## Reliability design

- **Non-blocking retry/backoff.** On `429/500/502/503/504/network`, the message
  is republished to `{vendor}.leads.retry` with a per-message TTL (exponential
  backoff). When the TTL expires it dead-letters back to the main queue. The
  consume callback never sleeps inline, so the channel keeps flowing. After
  `MAX_ATTEMPTS` the message goes to `{vendor}.leads.dlq`.
- **Concurrency + pacing.** Bottleneck gives `CONCURRENCY` parallel calls plus a
  reservoir of `batchSize` that refills every `delayBetweenBatches` ms. Combined
  with RabbitMQ `prefetch`, this is real throughput — not `prefetch(1)`.
- **Memory-safe.** The producer uses ExcelJS's streaming `WorkbookReader`; header
  validation reads only the first row. Huge files never load fully into memory.
- **Dedupe correctness.** A duplicate **skips** create-lead. The decision is a
  pure function with a unit test (`npm test`); ambiguous responses fail open to
  *create* so leads are never silently dropped.
- **Graceful shutdown.** `SIGINT`/`SIGTERM` drains in-flight work and flushes the
  final partial summary batch before exit.

## Prerequisites (native installs)

```bash
# macOS (Homebrew)
brew install redis rabbitmq
brew services start redis
brew services start rabbitmq        # management UI: http://localhost:15672 (guest/guest)

# Linux (apt)
sudo apt-get install -y redis-server rabbitmq-server
sudo systemctl enable --now redis-server rabbitmq-server
```

XAMPP must be running with Apache so stored files are reachable at
`FILE_BASE_URL`. Create the base folder once:
```bash
mkdir -p "$HTDOCS_BASE_PATH"      # e.g. /Applications/XAMPP/xamppfiles/htdocs/leadpusher
```

## Setup & run

```bash
cd uploader
cp .env.example .env              # then edit HTDOCS_BASE_PATH, FILE_BASE_URL, partner creds
npm install

# run all 5 processes
npm run pm2:start                 # pm2 start ecosystem.config.json
pm2 logs                          # tail logs (vendor-labelled)
pm2 stop ecosystem.config.json

# or run individually during development
npm run start:server
npm run start:watcher
npm run start:downloader
npm run start:producer
npm run start:consumer

# tests (dedupe decision)
npm test
```

### Running a second vendor
Copy `.env` to `.env.partnerB`, set `VENDOR_FOLDER_NAME=partnerB` (+ its creds),
register the partner in `src/external-api/index.js` and a formatter in
`src/utils/formatter.js`, then start a second PM2 set with that env file. Queues,
store prefixes and Redis keys are isolated automatically.

## Active partner — CreditLinks (Partner API v2.13)

The default partner is **CreditLinks** (`src/external-api/creditlinks/creditlinks.api.js`).

- **Auth:** `apikey` header (no request signing) + `Content-Type: application/json`.
- **Base URL:** `CREDITLINKS_BASE_URL` — UAT `https://loannet.in:8000`, PROD `https://l.creditlinks.in:8000`.
- **Pipeline flow per lead:** `POST /api/partner/dedupe` → if **Eligible** (`success:"true"`), `POST /api/v2/partner/create-lead`. **Not eligible** (`success:"false"`) skips create and is recorded as `DUPLICATE`. A 200 *"already created"* is recorded as `ALREADY_EXISTS`; 201 as `CREATED`; 400/422 as `FAILED` (not retried).
- **Mapping** (`utils/formatter.js` → `creditlinks`): spreadsheet columns → create-lead payload. Salaried (`Job Type` 1/"salaried") adds `employerName`+`officePincode`; self-employed (2/"self employed") defaults `businessRegistrationType=8` so the extra business fields aren't required for bulk leads. `consumerConsentDate` defaults to upload time, `consumerConsentIp` to `CREDITLINKS_DEFAULT_CONSENT_IP`.
- **Required upload headers:** `Name, Phone, Email, Dob, Pan Number, Salary, Pincode, Job Type` (Email is mandatory for create-lead). Aliases are accepted (see `config/headers.js`).
- **Also available** (not used by the bulk pipeline): `updateLead`, `getOffers`, `getSummary`, `goldLoans`, `goldLoansStatus`, `housingLoan`.
- **Credentials:** set `CREDITLINKS_API_KEY` (from the Partner Portal → Digital Integration).

## Adding a partner
1. Copy `src/external-api/_template/` → `src/external-api/{partner}/{partner}.api.js`
   and implement `checkDedupe`, `createLead`, `getLeadStatus` (HMAC and AES-256
   helpers live in `src/utils/cryptograph.js`).
2. Register it in `src/external-api/index.js`.
3. Add a lead formatter in `src/utils/formatter.js` (`FORMATTERS[<partner>]`).
4. Add the partner's credentials to `src/config/index.js` + `.env.example`.

## Required env vars
See `.env.example` for the full annotated list. Key ones: `VENDOR_FOLDER_NAME`,
`HTDOCS_BASE_PATH`, `FILE_BASE_URL`, `RABBITMQ_URL`, `REDIS_HOST`, `CHUNK_SIZE`,
`CONCURRENCY`, `MAX_ATTEMPTS`, and `CREDITMITRA_*`.
