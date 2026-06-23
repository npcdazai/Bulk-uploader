import Redis from 'ioredis';
import config from '../config/index.js';
import { createLogger } from './logger.js';

const log = createLogger('redis');

let client = null;

export function getRedis() {
  if (client) return client;
  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  client.on('connect', () => log.info(`connected ${config.redis.host}:${config.redis.port} db=${config.redis.db}`));
  client.on('error', (err) => log.error('redis error:', err.message));
  return client;
}

const vendor = config.VENDOR_FOLDER_NAME;

/** Redis hash key for a tracked file. Namespaced by vendor. */
export function fileKey(storeKey) {
  return `store_file:${vendor}:${storeKey}`;
}

/** Scan all tracked-file hash keys for this vendor (cursor-based, non-blocking). */
export async function scanFileKeys() {
  const redis = getRedis();
  const match = `store_file:${vendor}:*`;
  const found = [];
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 200);
    cursor = next;
    found.push(...keys);
  } while (cursor !== '0');
  return found;
}

/** Strip the `store_file:{vendor}:` prefix back to the original storage key. */
export function storeKeyFromHashKey(hashKey) {
  return hashKey.slice(`store_file:${vendor}:`.length);
}
