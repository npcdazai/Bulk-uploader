/**
 * ───────────────────────────────────────────────────────────────────────────
 *  PARTNER TEMPLATE — copy this folder to external-api/{partner}/ and rename.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Every partner module MUST export the same three functions with the same
 * return shapes so consumer.js can stay partner-agnostic:
 *
 *   checkDedupe(lead) -> { success, statusCode, duplicate, raw }
 *   createLead(lead)  -> { success, statusCode, leadId, status, raw }
 *   getLeadStatus(id) -> { success, statusCode, status, raw }
 *
 * `raw` is always the normalized callApi() envelope { data, statusCode, success, error }.
 *
 * Two auth styles are demonstrated below — pick whichever your partner needs and
 * delete the other:
 *   (A) HMAC request signing      (see creditmitra.api.js for a live example)
 *   (B) AES-256 encrypted payload (CBC/ECB) via utils/cryptograph.js
 *
 * Finally, register the module in external-api/index.js and add a formatter in
 * utils/formatter.js (FORMATTERS[<partner>]).
 */

import config from '../../config/index.js';
import { callApi } from '../../utils/callApi.js';
import { hmacSign, aesEncrypt } from '../../utils/cryptograph.js';

// const cfg = config.partners.mypartner; // add creds to config/index.js

// ---- (A) HMAC example -------------------------------------------------------
// function signedHeaders(rawBody) {
//   const timestamp = String(Date.now());
//   return {
//     'Content-Type': 'application/json',
//     'x-api-key': cfg.apiKey,
//     'x-timestamp': timestamp,
//     'x-signature': hmacSign(`${timestamp}.${rawBody}`, cfg.apiSecret),
//   };
// }

// ---- (B) AES-256 encrypted-payload example ----------------------------------
// function encryptedBody(payload) {
//   return { data: aesEncrypt(payload, cfg.apiSecret, 'cbc') }; // or 'ecb'
// }

export function isDuplicate(/* body */) {
  // Map the partner's dedupe convention to a strict boolean. Return false when
  // ambiguous so a bad reply never suppresses lead creation.
  return false;
}

export async function checkDedupe(/* lead */) {
  // const raw = await callApi({ method: 'POST', url: `${cfg.baseURL}/dedupe`, ... });
  // return { success: raw.success, statusCode: raw.statusCode, duplicate: raw.success ? isDuplicate(raw.data) : false, raw };
  throw new Error('template.api.js: implement checkDedupe');
}

export async function createLead(/* lead */) {
  throw new Error('template.api.js: implement createLead');
}

export async function getLeadStatus(/* id */) {
  throw new Error('template.api.js: implement getLeadStatus');
}

export default { checkDedupe, createLead, getLeadStatus, isDuplicate };
