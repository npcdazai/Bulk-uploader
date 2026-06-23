import axios from 'axios';

/**
 * The single axios wrapper for the whole partner layer.
 *
 * It normalises EVERY outcome — success, HTTP error, network error, timeout —
 * into one shape and NEVER throws a raw axios error:
 *
 *   { data, statusCode, success, error }
 *
 *   data       parsed response body (or null)
 *   statusCode numeric HTTP status (0 for network/timeout failures)
 *   success    true only for 2xx
 *   error      null on success; otherwise a normalized { message, code, body }
 *
 * Callers decide retry behaviour from `statusCode` (see consumer.js); this layer
 * is intentionally retry-free so backoff stays in one place.
 */
export async function callApi(axiosConfig) {
  try {
    const res = await axios({
      // sane defaults; per-call config overrides
      timeout: 15000,
      validateStatus: () => true, // we classify status ourselves
      ...axiosConfig,
    });

    const success = res.status >= 200 && res.status < 300;
    return {
      data: res.data ?? null,
      statusCode: res.status,
      success,
      error: success
        ? null
        : {
            message: `Request failed with status ${res.status}`,
            code: res.status,
            body: res.data ?? null,
          },
    };
  } catch (err) {
    // Network error, DNS, timeout, aborted, etc. — no HTTP response.
    return {
      data: null,
      statusCode: 0,
      success: false,
      error: {
        message: err?.message || 'Network error',
        code: err?.code || 'ENETWORK',
        body: null,
      },
    };
  }
}

/** Status codes the pipeline treats as transient (worth retrying with backoff). */
export const RETRYABLE_STATUS = new Set([0, 429, 500, 502, 503, 504]);

export function isRetryable(statusCode) {
  return RETRYABLE_STATUS.has(statusCode);
}
