import { DateTime } from 'luxon';
import Bottleneck from 'bottleneck';
import config from './config/index.js';
import { createLogger } from './lib/logger.js';
import {
  createConsumerChannel,
  getPublishChannel,
  scheduleRetry,
  sendToDlq,
  closeRabbit,
} from './lib/rabbit.js';
import { getRedis } from './lib/redis.js';
import { putObject } from './lib/fileStore.js';
import { summaryKey } from './lib/keys.js';
import { isRetryable } from './utils/callApi.js';
import { getFormatter, isUsableLead } from './utils/formatter.js';
import { buildSummaryBuffer } from './utils/excel.js';
import { getPartnerApi } from './external-api/index.js';
import { getProduct } from './config/products.js';

/**
 * Process 5 — Consumer.
 * Consumes the work queue and, per lead: skips empty rows, calls the partner
 * dedupe-check, creates the lead only when NOT a duplicate, collects a
 * normalized result, and ACKs. Results are flushed to an xlsx summary (uploaded
 * to the htdocs summary-files prefix) every CHUNK_SIZE rows OR after an idle
 * timeout. Retryable failures (429/5xx/network) are requeued with backoff via a
 * delay queue — never an inline sleep — so the channel keeps flowing.
 */
const log = createLogger('consumer');
const partner = getPartnerApi();

let channel = null;
let running = true;
let draining = false;
let inFlight = 0;

// ---- throughput + pacing ----------------------------------------------------
// Bottleneck gives us concurrency (maxConcurrent) AND honours the frontend's
// batchSize/delay: a reservoir of `batchSize` jobs that refills every `delay` ms.
const limiter = new Bottleneck({ maxConcurrent: config.CONCURRENCY });
let currentControl = { batchSize: null, delayBetweenBatches: null };

function applyControl(control) {
  const batchSize = Number(control?.batchSize) || config.DEFAULT_BATCH_SIZE;
  const delay = Number(control?.delayBetweenBatches);
  const delayBetweenBatches = Number.isFinite(delay) ? delay : config.DEFAULT_DELAY_BETWEEN_BATCHES;

  if (currentControl.batchSize === batchSize && currentControl.delayBetweenBatches === delayBetweenBatches) {
    return;
  }
  currentControl = { batchSize, delayBetweenBatches };

  if (delayBetweenBatches > 0) {
    // Bottleneck rounds the interval to a multiple of 250ms internally.
    limiter.updateSettings({
      reservoir: batchSize,
      reservoirRefreshAmount: batchSize,
      reservoirRefreshInterval: Math.max(250, delayBetweenBatches),
    });
  } else {
    // No inter-batch delay requested: pure concurrency, unlimited reservoir.
    limiter.updateSettings({ reservoir: null, reservoirRefreshAmount: null, reservoirRefreshInterval: null });
  }
  log.info(`pacing updated: concurrency=${config.CONCURRENCY} batchSize=${batchSize} delay=${delayBetweenBatches}ms`);
}

// ---- summary buffer + flushing ---------------------------------------------
const SUMMARY_COLUMNS = [
  { header: 'Row', key: 'rowNumber' },
  { header: 'Product', key: 'product' },
  { header: 'Name', key: 'name' },
  { header: 'Mobile', key: 'mobile' },
  { header: 'PAN', key: 'pan' },
  { header: 'Action', key: 'action' },
  { header: 'Lead ID', key: 'leadId' },
  { header: 'Status', key: 'status' },
  { header: 'HTTP', key: 'statusCode' },
  { header: 'Message', key: 'message' },
  { header: 'Source File', key: 'fileKey' },
  { header: 'Processed At', key: 'processedAt' },
];

let buffer = [];
let flushing = false;
let idleTimer = null;

function record(result) {
  buffer.push(result);
  resetIdleTimer();
  if (buffer.length >= config.CHUNK_SIZE) {
    // fire-and-forget; flush() is internally serialized
    flush('chunk').catch((e) => log.error('flush error:', e.message));
  }
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    flush('idle').catch((e) => log.error('idle flush error:', e.message));
  }, config.IDLE_FLUSH_MS);
}

async function flush(reason) {
  if (flushing) return;
  if (buffer.length === 0) return;
  flushing = true;
  const batch = buffer;
  buffer = [];
  try {
    const buf = await buildSummaryBuffer(batch, SUMMARY_COLUMNS);
    const key = summaryKey(DateTime.now());
    const url = await putObject(key, buf);
    log.info(`flushed ${batch.length} results (${reason}) -> ${key} | ${url}`);
  } catch (err) {
    // don't lose results: put them back at the front for the next attempt
    buffer = batch.concat(buffer);
    log.error(`flush failed (${reason}), ${batch.length} results requeued:`, err.message);
  } finally {
    flushing = false;
  }
}

// ---- per-message handling ---------------------------------------------------
async function handle(msg) {
  const payload = JSON.parse(msg.content.toString());
  const attempts = Number(msg.properties.headers?.['x-attempts'] || 0);
  applyControl(payload.control);

  // Resolve which product these leads target -> formatter + partner method + dedupe.
  const product = getProduct(payload.product);
  const formatter = getFormatter(product.formatter);

  const rowNumber = payload.rowNumber ?? '';
  const base = { rowNumber, product: product.key, fileKey: payload.fileKey || '', processedAt: DateTime.now().toISO() };

  // 1) format + skip non-usable / empty rows
  const lead = formatter(payload.row || {});
  if (!isUsableLead(lead)) {
    record({ ...base, ...leadCols(lead), action: 'SKIPPED', status: 'INVALID', statusCode: '', message: 'Empty or missing mobile' });
    channel.ack(msg);
    return;
  }

  // 2) optional dedupe-check (personal loan); gold/housing endpoints dedupe internally
  if (product.dedupe && typeof partner.checkDedupe === 'function') {
    const dedupe = await partner.checkDedupe(lead);
    if (!dedupe.success) {
      if (isRetryable(dedupe.statusCode)) return retryOrFail(msg, payload, attempts, base, lead, `dedupe ${dedupe.statusCode}`);
      record({ ...base, ...leadCols(lead), action: 'FAILED', status: 'DEDUPE_ERROR', statusCode: dedupe.statusCode, message: dedupe.raw?.error?.message || 'dedupe failed' });
      channel.ack(msg);
      return;
    }
    // duplicate / not-eligible -> SKIP push (the critical decision)
    if (dedupe.duplicate) {
      record({ ...base, ...leadCols(lead), action: 'DUPLICATE', status: 'SKIPPED', statusCode: dedupe.statusCode, message: dedupe.message || 'Duplicate — push skipped' });
      channel.ack(msg);
      return;
    }
  }

  // 3) push the lead to the product's endpoint (create-lead / gold-loans / housing-loan)
  const pushFn = partner[product.method];
  if (typeof pushFn !== 'function') {
    record({ ...base, ...leadCols(lead), action: 'FAILED', status: 'CONFIG_ERROR', statusCode: '', message: `partner has no method "${product.method}" for product ${product.key}` });
    channel.ack(msg);
    return;
  }

  const pushed = await pushFn(lead);
  if (!pushed.success) {
    if (isRetryable(pushed.statusCode)) return retryOrFail(msg, payload, attempts, base, lead, `${product.method} ${pushed.statusCode}`);
    record({ ...base, ...leadCols(lead), action: 'FAILED', status: pushed.status || 'PUSH_ERROR', statusCode: pushed.statusCode, message: pushed.raw?.error?.body?.message || pushed.raw?.error?.message || 'push failed' });
    channel.ack(msg);
    return;
  }

  const action = pushed.status === 'ALREADY_EXISTS' ? 'ALREADY_EXISTS' : 'CREATED';
  record({ ...base, ...leadCols(lead), action, leadId: pushed.leadId || '', status: pushed.status || 'CREATED', statusCode: pushed.statusCode, message: '' });
  if (payload.redisKey) getRedis().hincrby(payload.redisKey, 'pushedRows', 1).catch(() => {});
  channel.ack(msg);
}

/** Partner-agnostic identity columns for the summary (handles both payload shapes). */
function leadCols(lead) {
  return {
    name: lead.name || [lead.firstName, lead.lastName].filter(Boolean).join(' '),
    mobile: lead.mobile || lead.mobileNumber || '',
    pan: lead.pan || '',
  };
}

/** Non-blocking retry: republish to the delay queue, or DLQ after MAX_ATTEMPTS. */
async function retryOrFail(msg, payload, attempts, base, lead, reason) {
  const next = attempts + 1;
  const pub = await getPublishChannel();
  if (next >= config.MAX_ATTEMPTS) {
    sendToDlq(pub, payload, `max attempts (${next}) — ${reason}`);
    record({ ...base, ...leadCols(lead), action: 'FAILED', status: 'MAX_RETRIES', statusCode: '', message: `Gave up after ${next} attempts (${reason})` });
    channel.ack(msg);
    log.warn(`row ${payload.rowNumber} -> DLQ after ${next} attempts (${reason})`);
    return;
  }
  const delayMs = Math.min(config.RETRY_BASE_DELAY_MS * 2 ** attempts, config.RETRY_MAX_DELAY_MS);
  scheduleRetry(pub, payload, { attempts: next, delayMs });
  channel.ack(msg); // ack original; the copy lives in the retry queue
  log.debug(`row ${payload.rowNumber} retry ${next}/${config.MAX_ATTEMPTS} in ${delayMs}ms (${reason})`);
}

// ---- lifecycle --------------------------------------------------------------
async function start() {
  channel = await createConsumerChannel();
  await getPublishChannel(); // warm the publish channel for retries
  log.info(`consuming "${config.rabbit.queue}" prefetch=${config.rabbit.prefetch} concurrency=${config.CONCURRENCY}`);

  await channel.consume(config.rabbit.queue, (msg) => {
    if (!msg) return;
    inFlight += 1;
    limiter
      .schedule(() => handle(msg))
      .catch((err) => {
        log.error('handler crashed, nacking for requeue:', err.message);
        try { channel.nack(msg, false, true); } catch { /* channel gone */ }
      })
      .finally(() => { inFlight -= 1; });
  }, { noAck: false });
}

async function shutdown(signal) {
  if (draining) return;
  draining = true;
  running = false;
  log.info(`${signal} received — draining (inFlight=${inFlight})`);
  try {
    if (channel) await channel.cancel(channel.consumerTag || '').catch(() => {});
    // stop accepting; wait for in-flight handlers to settle
    const start = Date.now();
    while (inFlight > 0 && Date.now() - start < 30000) await sleep(200);
    await limiter.stop({ dropWaitingJobs: false }).catch(() => {});
    if (idleTimer) clearTimeout(idleTimer);
    await flush('shutdown'); // flush the final partial batch
    await closeRabbit();
  } catch (err) {
    log.error('shutdown error:', err.message);
  } finally {
    log.info('consumer stopped');
    process.exit(0);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => log.error('uncaughtException:', err.message));
process.on('unhandledRejection', (err) => log.error('unhandledRejection:', err?.message || err));

start().catch((err) => {
  log.error('failed to start consumer:', err.message);
  process.exit(1);
});
