import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import config from '../config/index.js';
import { createLogger } from './logger.js';

const log = createLogger('filestore');

/**
 * XAMPP / htdocs file store — the single storage backend for the pipeline.
 *
 * "Keys" are forward-slash object paths
 * (e.g. `creditmitra/Jun-2026/uploaded-files/1719_...xlsx`). They map onto the
 * filesystem under HTDOCS_BASE_PATH, and onto public URLs under FILE_BASE_URL,
 * so Apache serves every stored object at a stable http://localhost/... URL.
 *
 * The rest of the pipeline only ever talks to this module, so swapping to any
 * other object store later means re-implementing these five functions and
 * nothing else.
 */

const BASE = config.HTDOCS_BASE_PATH;

function keyToAbsPath(key) {
  // Normalise to OS separators and guard against path traversal.
  const safe = path.normalize(key).replace(/^(\.\.[/\\])+/, '');
  return path.join(BASE, safe);
}

function absPathToKey(absPath) {
  return path.relative(BASE, absPath).split(path.sep).join('/');
}

export function urlFor(key) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${config.FILE_BASE_URL}/${encoded}`;
}

/** Write a Buffer or Readable stream to `key`. Returns the public URL. */
export async function putObject(key, body) {
  const abs = keyToAbsPath(key);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  if (Buffer.isBuffer(body) || typeof body === 'string') {
    await fsp.writeFile(abs, body);
  } else {
    // Readable stream
    await pipeline(body, fs.createWriteStream(abs));
  }
  log.debug(`put ${key}`);
  return urlFor(key);
}

/** Open a readable stream for `key` (used for memory-safe copies/reads). */
export function getObjectStream(key) {
  return fs.createReadStream(keyToAbsPath(key));
}

/** True if the object exists. */
export async function objectExists(key) {
  try {
    await fsp.access(keyToAbsPath(key));
    return true;
  } catch {
    return false;
  }
}

/** Recursively list object keys under a prefix. */
export async function listObjects(prefix) {
  const root = keyToAbsPath(prefix);
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return; // prefix has no files yet
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        out.push(absPathToKey(full));
      }
    }
  }
  await walk(root);
  return out;
}

export async function deleteObject(key) {
  try {
    await fsp.unlink(keyToAbsPath(key));
    log.debug(`deleted ${key}`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export { keyToAbsPath };
