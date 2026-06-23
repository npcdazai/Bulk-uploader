import fsp from 'node:fs/promises';
import ExcelJS from 'exceljs';
import config from './config/index.js';
import { createLogger } from './lib/logger.js';
import { getPublishChannel, publishLead, closeRabbit } from './lib/rabbit.js';
import { getRedis, scanFileKeys, storeKeyFromHashKey } from './lib/redis.js';
import { cellText, cellValue } from './utils/excel.js';

/**
 * Process 4 — Producer.
 * FIFO-scans Redis for downloaded-but-unprocessed files, STREAMS the xlsx with
 * ExcelJS's streaming WorkbookReader (constant memory regardless of file size),
 * maps each row to a { header: value } object, and publishes a durable,
 * persistent RabbitMQ message per row. Each message is stamped with the
 * per-upload control settings (batchSize/delay) so the consumer honours the
 * values chosen on the frontend.
 */
const log = createLogger('producer');
let running = true;
let busy = false;

async function nextCandidate() {
  const redis = getRedis();
  const hashKeys = await scanFileKeys();
  const candidates = [];
  for (const hk of hashKeys) {
    const h = await redis.hgetall(hk);
    if (h && h.isDownloaded === 'true' && h.isProcessed === 'false' && h.downloadPath) {
      candidates.push({ hk, storeKey: storeKeyFromHashKey(hk), hash: h, createdAt: h.createdAt || '' });
    }
  }
  candidates.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return candidates[0] || null;
}

async function processFile({ hk, storeKey, hash }) {
  const redis = getRedis();
  const channel = await getPublishChannel();

  const control = {
    batchSize: Number(hash.batchSize) || config.DEFAULT_BATCH_SIZE,
    delayBetweenBatches: Number(hash.delayBetweenBatches) || config.DEFAULT_DELAY_BETWEEN_BATCHES,
  };
  const product = hash.product || 'personal';

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(hash.downloadPath, {
    sharedStrings: 'cache',
    worksheets: 'emit',
    entries: 'emit',
    styles: 'ignore',
  });

  let headers = null;
  let published = 0;
  let rowNumber = 0;

  log.info(`streaming ${storeKey} (batchSize=${control.batchSize}, delay=${control.delayBetweenBatches}ms)`);

  for await (const worksheet of reader) {
    for await (const row of worksheet) {
      rowNumber += 1;
      const values = Array.isArray(row.values) ? row.values : [];

      if (!headers) {
        headers = [];
        for (let i = 1; i < values.length; i += 1) headers.push(cellText(values[i]) || `col_${i}`);
        continue;
      }

      // zip header -> value
      const record = {};
      let nonEmpty = false;
      for (let i = 0; i < headers.length; i += 1) {
        const raw = cellValue(values[i + 1]);
        if (raw !== '' && raw !== null && raw !== undefined) nonEmpty = true;
        record[headers[i]] = serializeCell(raw);
      }
      if (!nonEmpty) continue; // skip fully-empty rows here too

      publishLead(channel, {
        vendor: config.VENDOR_FOLDER_NAME,
        partner: config.PARTNER,
        product,
        fileKey: storeKey,
        redisKey: hk,
        rowNumber,
        row: record,
        control,
      });
      published += 1;
    }
    break; // only the first worksheet
  }

  await redis.hset(hk, { isProcessed: 'true', totalRows: String(published) });

  // delete the local working copy
  if (hash.downloadPath) {
    try {
      await fsp.unlink(hash.downloadPath);
    } catch {
      /* already gone */
    }
  }

  log.info(`published ${published} rows from ${storeKey}; marked processed`);
}

/** Make sure dates and numbers travel safely through JSON to the consumer. */
function serializeCell(v) {
  if (v instanceof Date) return v.toISOString();
  return v;
}

async function loop() {
  log.info(`producer started (poll ${config.intervals.produce}ms)`);
  while (running) {
    try {
      const candidate = await nextCandidate();
      if (candidate) {
        busy = true;
        await processFile(candidate);
        busy = false;
        continue;
      }
    } catch (err) {
      busy = false;
      log.error('producer loop error:', err.message);
    }
    await sleep(config.intervals.produce);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shutdown(signal) {
  log.info(`${signal} received, stopping producer (busy=${busy})`);
  running = false;
  // let an in-flight file finish, then close
  const start = Date.now();
  while (busy && Date.now() - start < 30000) await sleep(200);
  await closeRabbit();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

loop();
