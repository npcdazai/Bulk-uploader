import config from '../../config/index.js';
import { callApi } from '../../utils/callApi.js';

/**
 * CreditLinks Partner API v2.13 integration.
 *
 * Auth: a single `apikey` header (NO request signing). `success` is returned as
 * a STRING ("true"/"false"). Base URLs:
 *   UAT  https://loannet.in:8000
 *   PROD https://l.creditlinks.in:8000
 *
 * Uniform interface used by the pipeline consumer:
 *   checkDedupe(lead) -> { success, statusCode, duplicate, message, raw }
 *   createLead(lead)  -> { success, statusCode, leadId, status, offers, raw }
 *   getLeadStatus(id) -> { success, statusCode, status, summary, raw }
 *
 * Extra endpoints exposed for completeness (not used by the bulk pipeline):
 *   updateLead, getOffers, getSummary, goldLoans, goldLoansStatus, housingLoan
 */

const cfg = config.partners.creditlinks;

function authHeaders() {
  return { 'Content-Type': 'application/json', apikey: cfg.apiKey };
}

function postJson(pathname, data) {
  return callApi({ method: 'POST', url: `${cfg.baseURL}${pathname}`, headers: authHeaders(), data, timeout: cfg.timeoutMs });
}

function getJson(pathname) {
  return callApi({ method: 'GET', url: `${cfg.baseURL}${pathname}`, headers: authHeaders(), timeout: cfg.timeoutMs });
}

/** Apply deployment-level defaults the spreadsheet doesn't carry. */
function withDefaults(lead) {
  const out = { ...lead };
  if (!out.consumerConsentIp) out.consumerConsentIp = cfg.defaultConsentIp;
  if (cfg.waitForAllOffers) out.waitForAllOffers = cfg.waitForAllOffers;
  return out;
}

/**
 * PURE dedupe decision — exported for unit testing.
 *
 * CreditLinks dedupe returns success:"true" + "Eligible" when the customer can
 * proceed (NOT a duplicate), and success:"false" + "Not eligible" when there is
 * no point continuing (already registered / ineligible). For the pipeline this
 * means "skip create-lead", so we treat success:false as a duplicate/skip.
 *
 * Ambiguous/missing bodies return FALSE (proceed to create) so a malformed reply
 * never silently suppresses lead creation.
 */
export function isDuplicate(body) {
  if (!body || typeof body !== 'object') return false;
  const s = body.success;
  if (s === true || s === 'true') return false; // Eligible -> proceed
  if (s === false || s === 'false') return true; // Not eligible -> skip create
  if (body.data && typeof body.data === 'object') return isDuplicate(body.data);
  return false;
}

export async function checkDedupe(lead) {
  const raw = await postJson('/api/partner/dedupe', { mobileNumber: lead.mobileNumber });
  if (!raw.success) {
    // transport/HTTP error — let the consumer decide on retry via statusCode
    return { success: false, statusCode: raw.statusCode, duplicate: false, message: raw.error?.message || 'dedupe failed', raw };
  }
  const duplicate = isDuplicate(raw.data);
  const message = raw.data?.message || (duplicate ? 'Not eligible' : 'Eligible');
  return { success: true, statusCode: raw.statusCode, duplicate, message, raw };
}

export async function createLead(lead) {
  const raw = await postJson('/api/v2/partner/create-lead', withDefaults(lead));
  const body = raw.data || {};
  const alreadyExists = typeof body.message === 'string' && /already created/i.test(body.message);
  return {
    success: raw.success,
    statusCode: raw.statusCode,
    leadId: body.leadId ?? null,
    status: raw.success ? (alreadyExists ? 'ALREADY_EXISTS' : 'CREATED') : (body.message || 'FAILED'),
    offers: Array.isArray(body.offers) ? body.offers : [],
    raw,
  };
}

/** Uniform status hook — backed by Get Summary. */
export async function getLeadStatus(leadId) {
  const raw = await getJson(`/api/partner/get-summary/${encodeURIComponent(leadId)}`);
  const body = raw.data || {};
  return {
    success: raw.success,
    statusCode: raw.statusCode,
    status: raw.success ? 'OK' : (body.message || 'FAILED'),
    summary: body.summary || null,
    redirectionUrl: body.redirectionUrl || null,
    raw,
  };
}

// ---- additional endpoints (available, not used by the bulk pipeline) --------

export async function updateLead(leadId, fields) {
  const raw = await postJson(`/api/v2/partner/update-lead/${encodeURIComponent(leadId)}`, fields);
  const body = raw.data || {};
  return { success: raw.success, statusCode: raw.statusCode, leadId: body.leadId ?? leadId, status: body.message || (raw.success ? 'UPDATED' : 'FAILED'), raw };
}

export async function getOffers(leadId) {
  const raw = await getJson(`/api/partner/get-offers/${encodeURIComponent(leadId)}`);
  const body = raw.data || {};
  return { success: raw.success, statusCode: raw.statusCode, offers: Array.isArray(body.offers) ? body.offers : [], unmatchedOffers: body.unmatchedOffers || [], raw };
}

export async function getSummary(leadId) {
  return getLeadStatus(leadId);
}

export async function goldLoans(lead) {
  const raw = await postJson('/api/v2/partner/gold-loans', withDefaults(lead));
  const body = raw.data || {};
  const alreadyExists = typeof body.message === 'string' && /already created/i.test(body.message);
  return {
    success: raw.success,
    statusCode: raw.statusCode,
    leadId: body.leadId ?? null,
    status: raw.success ? (alreadyExists ? 'ALREADY_EXISTS' : 'CREATED') : (body.message || 'FAILED'),
    offers: Array.isArray(body.offers) ? body.offers : [],
    raw,
  };
}

export async function goldLoansStatus(leadId) {
  const raw = await getJson(`/api/v2/partner/gold-loans-status/${encodeURIComponent(leadId)}`);
  const body = raw.data || {};
  return { success: raw.success, statusCode: raw.statusCode, statuses: Array.isArray(body.statuses) ? body.statuses : [], raw };
}

export async function housingLoan(lead) {
  const raw = await postJson('/api/v2/partner/housing-loan', withDefaults(lead));
  const body = raw.data || {};
  const alreadyExists = typeof body.message === 'string' && /already created/i.test(body.message);
  return {
    success: raw.success,
    statusCode: raw.statusCode,
    leadId: body.leadId ?? null,
    status: raw.success ? (alreadyExists ? 'ALREADY_EXISTS' : 'CREATED') : (body.message || 'FAILED'),
    offers: Array.isArray(body.offers) ? body.offers : [],
    raw,
  };
}

export default {
  checkDedupe,
  createLead,
  getLeadStatus,
  isDuplicate,
  updateLead,
  getOffers,
  getSummary,
  goldLoans,
  goldLoansStatus,
  housingLoan,
};
