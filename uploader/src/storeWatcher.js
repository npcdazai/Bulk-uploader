import config from './config/index.js';
import { createLogger } from './lib/logger.js';
import { listObjects } from './lib/fileStore.js';
import { vendorPrefix, isUploadedKey } from './lib/keys.js';
import { getRedis, fileKey, scanFileKeys, storeKeyFromHashKey } from './lib/redis.js';
import { DEFAULT_PRODUCT } from './config/products.js';

/**
 * Process 2 — Store Watcher.
 * Polls the htdocs uploaded-files prefix, registers each NEW file as a Redis
 * hash, and prunes hashes whose backing file has disappeared from the store.
 *
 * Files uploaded via the API already have a hash (created by server.js); the
 * watcher additionally picks up files dropped into htdocs by other means.
 */
const log = createLogger('watcher');
let running = true;

const DEFAULT_HASH = () => ({
  isDownloaded: 'false',
  isProcessed: 'false',
  downloadPath: '',
  totalRows: '0',
  pushedRows: '0',
  product: DEFAULT_PRODUCT,
  batchSize: String(config.DEFAULT_BATCH_SIZE),
  delayBetweenBatches: String(config.DEFAULT_DELAY_BETWEEN_BATCHES),
  originalName: '',
  createdAt: new Date().toISOString(),
});

async function registerNewFiles() {
  const redis = getRedis();
  const keys = (await listObjects(vendorPrefix())).filter(isUploadedKey);

  let registered = 0;
  for (const key of keys) {
    const hk = fileKey(key);
    // hsetnx-style: only create if the hash does not already exist.
    const exists = await redis.exists(hk);
    if (!exists) {
      await redis.hset(hk, DEFAULT_HASH());
      registered += 1;
      log.info(`registered new file: ${key}`);
    }
  }
  return { storeKeys: new Set(keys), registered };
}

async function pruneMissing(storeKeys) {
  const redis = getRedis();
  const hashKeys = await scanFileKeys();
  let pruned = 0;
  for (const hk of hashKeys) {
    const storeKey = storeKeyFromHashKey(hk);
    if (isUploadedKey(storeKey) && !storeKeys.has(storeKey)) {
      await redis.del(hk);
      pruned += 1;
      log.info(`pruned hash for missing file: ${storeKey}`);
    }
  }
  return pruned;
}

async function tick() {
  try {
    const { storeKeys, registered } = await registerNewFiles();
    const pruned = await pruneMissing(storeKeys);
    if (registered || pruned) {
      log.info(`tick: tracked=${storeKeys.size} registered=${registered} pruned=${pruned}`);
    } else {
      log.debug(`tick: tracked=${storeKeys.size}`);
    }
  } catch (err) {
    log.error('tick failed:', err.message);
  }
}

async function loop() {
  log.info(`watching store prefix "${vendorPrefix()}/**/uploaded-files" every ${config.intervals.watch}ms`);
  while (running) {
    await tick();
    await sleep(config.intervals.watch);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shutdown(signal) {
  log.info(`${signal} received, stopping watcher`);
  running = false;
  setTimeout(() => process.exit(0), 200);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

loop();
