import fs from 'node:fs';
import fsp from 'node:fs/promises';
import express from 'express';
import multer from 'multer';
import { DateTime } from 'luxon';
import config from './config/index.js';
import { createLogger } from './lib/logger.js';
import { putObject } from './lib/fileStore.js';
import { uploadedKey } from './lib/keys.js';
import { getRedis, fileKey } from './lib/redis.js';
import { readHeaderRow } from './utils/excel.js';
import { REQUIRED_HEADERS, HEADER_ALIASES, normalizeHeader } from './config/headers.js';

/**
 * Process 1 — HTTP API.
 * POST /api/upload: receive a multipart xlsx, validate its headers, stream it to
 * the XAMPP/htdocs store, register control settings + initial state in Redis,
 * delete the temp file, and return the public URL.
 */
const log = createLogger('server');
const app = express();

await fsp.mkdir(config.server.uploadTmpDir, { recursive: true });

const upload = multer({
  dest: config.server.uploadTmpDir,
  limits: { fileSize: config.server.maxUploadBytes },
});

// Optional shared-token gate for the upload endpoint.
function requireToken(req, res, next) {
  if (!config.UPLOAD_API_TOKEN) return next();
  const provided = req.get('x-api-token') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (provided && provided === config.UPLOAD_API_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.use((req, res, next) => {
  // permissive CORS for the internal tool
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-token, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, vendor: config.VENDOR_FOLDER_NAME, partner: config.PARTNER });
});

/** Validate uploaded headers against REQUIRED_HEADERS (alias + case tolerant). */
function validateHeaders(uploadedHeaders) {
  const present = new Set(uploadedHeaders.map(normalizeHeader));
  const missingHeaders = [];
  for (const required of REQUIRED_HEADERS) {
    const aliases = HEADER_ALIASES[required] || [required];
    const satisfied = aliases.some((a) => present.has(normalizeHeader(a)));
    if (!satisfied) missingHeaders.push(required);
  }
  return missingHeaders;
}

app.post('/api/upload', requireToken, upload.single('file'), async (req, res) => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' });
    }
    if (!/\.xlsx$/i.test(req.file.originalname)) {
      await safeUnlink(tmpPath);
      return res.status(400).json({ error: 'Only .xlsx files are supported' });
    }

    // 1) Validate headers (streaming read of the first row only).
    let uploadedHeaders = [];
    try {
      uploadedHeaders = await readHeaderRow(tmpPath);
    } catch (err) {
      await safeUnlink(tmpPath);
      log.warn('failed to read header row:', err.message);
      return res.status(400).json({ error: 'Could not read the spreadsheet. Is it a valid .xlsx?' });
    }

    const missingHeaders = validateHeaders(uploadedHeaders);
    if (missingHeaders.length > 0) {
      await safeUnlink(tmpPath);
      log.warn(`rejected upload "${req.file.originalname}" — missing: ${missingHeaders.join(', ')}`);
      return res.status(400).json({
        error: 'Uploaded file is missing required headers',
        missingHeaders,
        requiredHeaders: REQUIRED_HEADERS,
        uploadedHeaders,
      });
    }

    // 2) Stream the temp file into htdocs at the canonical key.
    const now = DateTime.now();
    const key = uploadedKey(now);
    const url = await putObject(key, fs.createReadStream(tmpPath));

    // 3) Register initial state + per-upload control settings in Redis so the
    //    producer can stamp every message with the batchSize/delay chosen here.
    const batchSize = clampInt(req.body.batchSize, config.DEFAULT_BATCH_SIZE, 1, 100000);
    const delayBetweenBatches = clampInt(req.body.delayBetweenBatches, config.DEFAULT_DELAY_BETWEEN_BATCHES, 0, 600000);

    await getRedis().hset(fileKey(key), {
      isDownloaded: 'false',
      isProcessed: 'false',
      downloadPath: '',
      totalRows: '0',
      pushedRows: '0',
      batchSize: String(batchSize),
      delayBetweenBatches: String(delayBetweenBatches),
      originalName: req.file.originalname,
      createdAt: now.toISO(),
    });

    // 4) Drop the temp file.
    await safeUnlink(tmpPath);

    log.info(`uploaded "${req.file.originalname}" -> ${key} (batchSize=${batchSize}, delay=${delayBetweenBatches}ms)`);
    return res.status(201).json({ success: true, key, url, batchSize, delayBetweenBatches });
  } catch (err) {
    await safeUnlink(tmpPath);
    log.error('upload failed:', err.message);
    return res.status(500).json({ error: 'Internal error while processing upload' });
  }
});

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function safeUnlink(p) {
  if (!p) return;
  try {
    await fsp.unlink(p);
  } catch {
    /* already gone */
  }
}

app.listen(config.server.port, () => {
  log.info(`HTTP API listening on :${config.server.port} (vendor=${config.VENDOR_FOLDER_NAME})`);
});
