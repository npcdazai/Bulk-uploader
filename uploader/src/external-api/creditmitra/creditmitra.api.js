import config from '../../config/index.js';
import { callApi } from '../../utils/callApi.js';
import { hmacSign } from '../../utils/cryptograph.js';

/**
 * CreditMitra integration — HMAC-signed dedupe-check + create-lead.
 *
 * This is the reference partner. Every partner module exposes the SAME shape:
 *   checkDedupe(lead)  -> { success, statusCode, duplicate, raw }
 *   createLead(lead)   -> { success, statusCode, leadId, status, raw }
 *   getLeadStatus(id)  -> { success, statusCode, status, raw }
 *
 * `raw` is the normalized callApi() envelope so callers can inspect details and
 * decide retry behaviour from statusCode.
 */

const cfg = config.partners.creditmitra;

/**
 * Build the HMAC auth headers. The signature is computed over
 * `${timestamp}.${rawBody}` so both the timestamp and the exact bytes sent are
 * covered. The server is expected to recompute and compare.
 */
function signedHeaders(rawBody) {
  const timestamp = String(Date.now());
  const signature = hmacSign(`${timestamp}.${rawBody}`, cfg.apiSecret, 'hex');
  return {
    'Content-Type': 'application/json',
    'x-api-key': cfg.apiKey,
    'x-timestamp': timestamp,
    'x-signature': signature,
  };
}

async function signedPost(pathname, payload) {
  const rawBody = JSON.stringify(payload);
  return callApi({
    method: 'POST',
    url: `${cfg.baseURL}${pathname}`,
    headers: signedHeaders(rawBody),
    data: rawBody, // send the exact signed bytes
    timeout: cfg.timeoutMs,
  });
}

/**
 * PURE dedupe decision — exported for unit testing.
 *
 * Treats a lead as a duplicate when the partner clearly says so via any of the
 * common conventions. Crucially: when the response is ambiguous or missing, it
 * returns FALSE (not-duplicate) so a malformed dedupe reply never silently
 * suppresses lead creation. The caller still gates create-lead on dedupe
 * SUCCESS separately.
 */
export function isDuplicate(body) {
  if (!body || typeof body !== 'object') return false;

  // boolean-style flags
  if (body.isDuplicate === true || body.duplicate === true || body.exists === true) return true;
  if (body.isDuplicate === false || body.duplicate === false || body.exists === false) return false;

  // status-string style
  const status = String(body.status ?? body.result ?? body.dedupeStatus ?? '').toUpperCase();
  if (['DUPLICATE', 'EXISTS', 'EXISTING', 'FOUND', 'MATCH'].includes(status)) return true;
  if (['NEW', 'NOT_FOUND', 'UNIQUE', 'NO_MATCH', 'CLEAR'].includes(status)) return false;

  // nested data envelope
  if (body.data && typeof body.data === 'object') return isDuplicate(body.data);

  return false;
}

export async function checkDedupe(lead) {
  const raw = await signedPost('/v1/leads/dedupe', {
    mobile: lead.mobile,
    pan: lead.pan,
    dob: lead.dob,
  });
  return {
    success: raw.success,
    statusCode: raw.statusCode,
    duplicate: raw.success ? isDuplicate(raw.data) : false,
    raw,
  };
}

export async function createLead(lead) {
  const raw = await signedPost('/v1/leads', lead);
  const body = raw.data || {};
  return {
    success: raw.success,
    statusCode: raw.statusCode,
    leadId: body.leadId ?? body.id ?? (body.data && (body.data.leadId ?? body.data.id)) ?? null,
    status: body.status ?? (body.data && body.data.status) ?? (raw.success ? 'CREATED' : 'FAILED'),
    raw,
  };
}

export async function getLeadStatus(leadId) {
  const raw = await callApi({
    method: 'GET',
    url: `${cfg.baseURL}/v1/leads/${encodeURIComponent(leadId)}`,
    headers: signedHeaders(''),
    timeout: cfg.timeoutMs,
  });
  const body = raw.data || {};
  return {
    success: raw.success,
    statusCode: raw.statusCode,
    status: body.status ?? (body.data && body.data.status) ?? 'UNKNOWN',
    raw,
  };
}

export default { checkDedupe, createLead, getLeadStatus, isDuplicate };
