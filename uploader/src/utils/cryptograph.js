import crypto from 'node:crypto';

/**
 * Crypto helpers shared by partner integrations.
 *
 * Two families of partners are supported out of the box:
 *   1. HMAC request signing (x-api-key / x-signature / x-timestamp) — CreditMitra.
 *   2. AES-256 encrypted payloads (CBC or ECB) — template/other partners.
 */

// ---- HMAC -------------------------------------------------------------------

/**
 * HMAC-SHA256 signature over a canonical string. The canonical string is the
 * caller's choice (commonly `${timestamp}.${rawBody}`), keeping this primitive
 * partner-agnostic.
 */
export function hmacSign(canonicalString, secret, encoding = 'hex') {
  return crypto.createHmac('sha256', secret).update(canonicalString, 'utf8').digest(encoding);
}

export function hmacVerify(canonicalString, secret, signature, encoding = 'hex') {
  const expected = hmacSign(canonicalString, secret, encoding);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- AES-256 ----------------------------------------------------------------

/**
 * Derive a 32-byte key from an arbitrary-length secret. If the secret is already
 * exactly 32 bytes it is used verbatim; otherwise it is SHA-256 hashed.
 */
function deriveKey(secret) {
  const buf = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, 'utf8');
  return buf.length === 32 ? buf : crypto.createHash('sha256').update(buf).digest();
}

/**
 * AES-256 encrypt. mode = 'cbc' (default, with random IV prefixed) or 'ecb'.
 * Returns base64. For CBC the 16-byte IV is prepended to the ciphertext.
 */
export function aesEncrypt(plaintext, secret, mode = 'cbc') {
  const key = deriveKey(secret);
  const algo = mode === 'ecb' ? 'aes-256-ecb' : 'aes-256-cbc';
  const iv = mode === 'ecb' ? null : crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algo, key, iv);
  const data = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  const enc = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const out = iv ? Buffer.concat([iv, enc]) : enc;
  return out.toString('base64');
}

/** AES-256 decrypt the output of aesEncrypt. Returns a UTF-8 string. */
export function aesDecrypt(b64, secret, mode = 'cbc') {
  const key = deriveKey(secret);
  const algo = mode === 'ecb' ? 'aes-256-ecb' : 'aes-256-cbc';
  const raw = Buffer.from(b64, 'base64');
  let iv = null;
  let payload = raw;
  if (mode !== 'ecb') {
    iv = raw.subarray(0, 16);
    payload = raw.subarray(16);
  }
  const decipher = crypto.createDecipheriv(algo, key, iv);
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
}
