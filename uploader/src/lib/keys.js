import { DateTime } from 'luxon';
import config from '../config/index.js';

/**
 * Storage-key layout — vendor-namespaced and month-partitioned:
 *
 *   {vendor}/{Mon-yyyy}/uploaded-files/{ts}_{vendor}_Leads.xlsx
 *   {vendor}/{Mon-yyyy}/summary-files/{ts}_{vendor}_Summary.xlsx
 */
const vendor = config.VENDOR_FOLDER_NAME;

export function monthFolder(dt = DateTime.now()) {
  return dt.toFormat('LLL-yyyy'); // e.g. "Jun-2026"
}

export function uploadedPrefix(dt = DateTime.now()) {
  return `${vendor}/${monthFolder(dt)}/uploaded-files`;
}

export function summaryPrefix(dt = DateTime.now()) {
  return `${vendor}/${monthFolder(dt)}/summary-files`;
}

/** Top-level vendor prefix (used by the watcher to scan every month folder). */
export function vendorPrefix() {
  return vendor;
}

export function uploadedKey(now = DateTime.now()) {
  const ts = now.toMillis();
  return `${uploadedPrefix(now)}/${ts}_${vendor}_Leads.xlsx`;
}

export function summaryKey(now = DateTime.now()) {
  const ts = now.toMillis();
  return `${summaryPrefix(now)}/${ts}_${vendor}_Summary.xlsx`;
}

/** Is this key an uploaded leads file (vs a summary or anything else)? */
export function isUploadedKey(key) {
  return /\/uploaded-files\/[^/]+\.(xlsx|csv)$/i.test(key);
}
