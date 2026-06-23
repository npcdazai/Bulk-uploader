import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import config from './config/index.js';
import { createLogger } from './lib/logger.js';
import { getObjectStream, objectExists } from './lib/fileStore.js';
import { getRedis, scanFileKeys, storeKeyFromHashKey } from './lib/redis.js';

/**
 * Process 3 — Downloader.
 * FIFO-scans Redis for files with isDownloaded:false, streams them from the
 * htdocs store to local disk (memory-safe copy), and records the download path.
 */
const log = createLogger('downloader');
let running = true;

await fsp.mkdir(config.LOCAL_DOWNLOAD_DIR, { recursive: true });

/** Oldest-first candidate that still needs downloading. */
async function nextCandidate() {
  const redis = getRedis();
  const hashKeys = await scanFileKeys();
  const candidates = [];
  for (const hk of hashKeys) {
    const h = await redis.hgetall(hk);
    if (h && h.isDownloaded === 'false') {
      candidates.push({ hk, storeKey: storeKeyFromHashKey(hk), createdAt: h.createdAt || '' });
    }
  }
  candidates.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return candidates[0] || null;
}

async function download({ hk, storeKey }) {
  const redis = getRedis();

  if (!(await objectExists(storeKey))) {
    log.warn(`source missing, skipping: ${storeKey}`);
    return;
  }

  const localPath = path.join(config.LOCAL_DOWNLOAD_DIR, path.basename(storeKey));
  log.info(`downloading ${storeKey} -> ${localPath}`);
  await pipeline(getObjectStream(storeKey), fs.createWriteStream(localPath));

  await redis.hset(hk, { isDownloaded: 'true', downloadPath: localPath });
  log.info(`downloaded ${storeKey}`);
}

async function loop() {
  log.info(`downloader started (poll ${config.intervals.download}ms, dir ${config.LOCAL_DOWNLOAD_DIR})`);
  while (running) {
    try {
      const candidate = await nextCandidate();
      if (candidate) {
        await download(candidate);
        continue; // immediately look for the next one
      }
    } catch (err) {
      log.error('download loop error:', err.message);
    }
    await sleep(config.intervals.download);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shutdown(signal) {
  log.info(`${signal} received, stopping downloader`);
  running = false;
  setTimeout(() => process.exit(0), 200);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

loop();
