import 'dotenv/config';
import path from 'node:path';

/**
 * Central, env-only configuration. Everything that can vary per deployment lives
 * here. The whole pipeline is namespaced by VENDOR_FOLDER_NAME so the same code
 * runs per lending partner via a single env var.
 */

const env = process.env;

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function str(value, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

const VENDOR_FOLDER_NAME = str(env.VENDOR_FOLDER_NAME, 'creditlinks');
// Which partner-integration module to use from external-api/. Defaults to vendor.
const PARTNER = str(env.PARTNER, VENDOR_FOLDER_NAME).toLowerCase();

// ---- XAMPP / htdocs file store ----------------------------------------------
// Files are written under HTDOCS_BASE_PATH and served by Apache at FILE_BASE_URL.
// e.g. HTDOCS_BASE_PATH=/opt/lampp/htdocs/leadpusher (mac/linux)
//      HTDOCS_BASE_PATH=C:\\xampp\\htdocs\\leadpusher (windows)
//      FILE_BASE_URL=http://localhost/leadpusher
const HTDOCS_BASE_PATH = str(env.HTDOCS_BASE_PATH, path.resolve(process.cwd(), 'htdocs-store'));
const FILE_BASE_URL = str(env.FILE_BASE_URL, 'http://localhost/leadpusher').replace(/\/+$/, '');

// Where the downloader copies files locally for streaming reads.
const LOCAL_DOWNLOAD_DIR = path.resolve(str(env.LOCAL_DOWNLOAD_DIR, 'downloads'));

// ---- Redis ------------------------------------------------------------------
const redis = {
  host: str(env.REDIS_HOST, '127.0.0.1'),
  port: int(env.REDIS_PORT, 6379),
  password: env.REDIS_PASSWORD || undefined,
  db: int(env.REDIS_DB, 0),
  keyPrefix: '', // we build fully-qualified keys ourselves (vendor namespaced)
};

// ---- RabbitMQ ---------------------------------------------------------------
const rabbit = {
  url: str(env.RABBITMQ_URL, 'amqp://localhost'),
  // queue/exchange names are vendor-namespaced
  queue: `${VENDOR_FOLDER_NAME}.leads`,
  retryQueue: `${VENDOR_FOLDER_NAME}.leads.retry`,
  dlq: `${VENDOR_FOLDER_NAME}.leads.dlq`,
  prefetch: int(env.CONSUMER_PREFETCH, 10),
};

// ---- Pipeline behaviour -----------------------------------------------------
// CHUNK_SIZE: summary-file flush size (rows per summary batch).
const CHUNK_SIZE = int(env.CHUNK_SIZE, 500);

// Defaults used when the frontend does not supply per-upload control values.
const DEFAULT_BATCH_SIZE = int(env.DEFAULT_BATCH_SIZE, 100);
const DEFAULT_DELAY_BETWEEN_BATCHES = int(env.DEFAULT_DELAY_BETWEEN_BATCHES, 1000);

// Consumer throughput / pacing.
const CONCURRENCY = int(env.CONCURRENCY, 5);
const IDLE_FLUSH_MS = int(env.IDLE_FLUSH_MS, 15000);

// Retry/backoff for retryable partner responses (429/500/502/503).
const MAX_ATTEMPTS = int(env.MAX_ATTEMPTS, 5);
const RETRY_BASE_DELAY_MS = int(env.RETRY_BASE_DELAY_MS, 2000);
const RETRY_MAX_DELAY_MS = int(env.RETRY_MAX_DELAY_MS, 60000);

// Worker poll intervals.
const intervals = {
  watch: int(env.WATCH_INTERVAL_MS, 10000),
  download: int(env.DOWNLOAD_INTERVAL_MS, 5000),
  produce: int(env.PRODUCE_INTERVAL_MS, 5000),
};

// Optional shared token to protect the upload endpoint.
const UPLOAD_API_TOKEN = str(env.UPLOAD_API_TOKEN, '');

const server = {
  port: int(env.PORT, 4000),
  uploadTmpDir: path.resolve(str(env.UPLOAD_TMP_DIR, 'tmp-uploads')),
  maxUploadBytes: int(env.MAX_UPLOAD_BYTES, 200 * 1024 * 1024), // 200MB
};

// ---- Partner credentials (CreditMitra fully wired) --------------------------
const partners = {
  // CreditLinks Partner API v2.13 — real integration (apikey header auth).
  // UAT base: https://loannet.in:8000  |  PROD base: https://l.creditlinks.in:8000
  creditlinks: {
    baseURL: str(env.CREDITLINKS_BASE_URL, 'https://loannet.in:8000').replace(/\/+$/, ''),
    apiKey: str(env.CREDITLINKS_API_KEY),
    timeoutMs: int(env.CREDITLINKS_TIMEOUT_MS, 20000),
    // consumerConsentIp used when the spreadsheet doesn't carry one.
    defaultConsentIp: str(env.CREDITLINKS_DEFAULT_CONSENT_IP, '0.0.0.0'),
    // create-lead waitForAllOffers: 0/unset, 1 (wait up to 180s), 2 (don't wait).
    waitForAllOffers: int(env.CREDITLINKS_WAIT_FOR_ALL_OFFERS, 0),
  },
  // HMAC-signing reference partner (template/example).
  creditmitra: {
    baseURL: str(env.CREDITMITRA_BASE_URL, 'https://api.creditmitra.example'),
    apiKey: str(env.CREDITMITRA_API_KEY),
    apiSecret: str(env.CREDITMITRA_API_SECRET),
    timeoutMs: int(env.CREDITMITRA_TIMEOUT_MS, 15000),
  },
};

export default {
  VENDOR_FOLDER_NAME,
  PARTNER,
  HTDOCS_BASE_PATH,
  FILE_BASE_URL,
  LOCAL_DOWNLOAD_DIR,
  redis,
  rabbit,
  CHUNK_SIZE,
  DEFAULT_BATCH_SIZE,
  DEFAULT_DELAY_BETWEEN_BATCHES,
  CONCURRENCY,
  IDLE_FLUSH_MS,
  MAX_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  intervals,
  UPLOAD_API_TOKEN,
  server,
  partners,
};
