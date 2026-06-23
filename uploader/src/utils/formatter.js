import { DateTime } from 'luxon';
import config from '../config/index.js';

/**
 * Per-partner "lead formatter": maps a messy spreadsheet row (a flat
 * { header: value } object) into a given partner's exact API payload, with safe
 * fallbacks and robust date parsing.
 *
 * Use getFormatter(partner) to fetch the right one. Add a partner by adding an
 * entry to FORMATTERS keyed by the partner id.
 */

// ---- generic row helpers ----------------------------------------------------

/** Case/space-insensitive lookup across several candidate column names. */
export function pick(row, candidates) {
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const map = new Map(Object.keys(row).map((k) => [norm(k), row[k]]));
  for (const cand of candidates) {
    const v = map.get(norm(cand));
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

export function cleanString(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/** Keep digits only (phones, pincodes, salary, PAN-numeric fragments). */
export function digitsOnly(v) {
  return cleanString(v).replace(/\D+/g, '');
}

/** Normalise an Indian mobile number to a 10-digit string when possible. */
export function normalizePhone(v) {
  let d = digitsOnly(v);
  if (d.length > 10 && d.startsWith('91')) d = d.slice(d.length - 10);
  if (d.length > 10) d = d.slice(d.length - 10);
  return d;
}

export function normalizePan(v) {
  return cleanString(v).toUpperCase().replace(/\s+/g, '');
}

/** Split a single "Name" into first/last; respects explicit First/Last columns. */
export function splitName(row) {
  const first = cleanString(pick(row, ['First Name', 'Firstname', 'Fname']));
  const last = cleanString(pick(row, ['Last Name', 'Lastname', 'Lname', 'Surname']));
  const full = cleanString(pick(row, ['Name', 'Full Name', 'Customer Name']));
  if (first || last) {
    return { firstName: first, lastName: last, fullName: `${first} ${last}`.trim() || full };
  }
  if (full) {
    const parts = full.split(/\s+/);
    return { firstName: parts[0] || '', lastName: parts.slice(1).join(' '), fullName: full };
  }
  return { firstName: '', lastName: '', fullName: '' };
}

// ---- robust date parsing ----------------------------------------------------

const STRING_DATE_FORMATS = [
  'dd-MM-yyyy', 'dd/MM/yyyy', 'd-M-yyyy', 'd/M/yyyy',
  'yyyy-MM-dd', 'yyyy/MM/dd',
  'MM-dd-yyyy', 'MM/dd/yyyy',
  'dd-LLL-yyyy', 'dd LLL yyyy', 'dd-LLLL-yyyy', 'dd LLLL yyyy',
  'd-LLL-yyyy', 'LLL d, yyyy', 'LLLL d, yyyy',
];

/**
 * Parse a date that may arrive as: a JS Date, an Excel serial number, or a string
 * in any of several formats. Returns a luxon DateTime (or null if unparseable).
 */
export function parseFlexibleDate(value) {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return DateTime.fromJSDate(value).toUTC();
  }

  // Excel serial date (days since 1899-12-30). Guard a sane range so a salary
  // that sneaks in as a number isn't misread as a date.
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value);
    if (serial > 0 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const dt = DateTime.fromMillis(ms, { zone: 'utc' });
      if (dt.isValid && dt.year > 1900 && dt.year < 2100) return dt;
    }
  }

  const s = String(value).trim();
  for (const fmt of STRING_DATE_FORMATS) {
    const dt = DateTime.fromFormat(s, fmt, { zone: 'utc' });
    if (dt.isValid) return dt;
  }
  // last resort: ISO / native parsing
  const iso = DateTime.fromISO(s, { zone: 'utc' });
  if (iso.isValid) return iso;
  return null;
}

export function formatDate(value, fmt = 'yyyy-MM-dd') {
  const dt = parseFlexibleDate(value);
  return dt ? dt.toFormat(fmt) : '';
}

const DATETIME_FORMATS = [
  'yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy/MM/dd HH:mm:ss',
  'dd-MM-yyyy HH:mm:ss', 'dd/MM/yyyy HH:mm:ss',
];

/** Parse a value that may carry a time component; falls back to date-at-midnight. */
export function parseFlexibleDateTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return DateTime.fromJSDate(value);
  if (value !== null && value !== undefined && value !== '') {
    const s = String(value).trim();
    for (const fmt of DATETIME_FORMATS) {
      const dt = DateTime.fromFormat(s, fmt);
      if (dt.isValid) return dt;
    }
    const iso = DateTime.fromISO(s);
    if (iso.isValid) return iso;
  }
  return parseFlexibleDate(value); // date only -> midnight
}

export function formatDateTime(value, fmt = 'yyyy-MM-dd HH:mm:ss') {
  const dt = parseFlexibleDateTime(value);
  return dt ? dt.toFormat(fmt) : '';
}

// ---- partner formatters -----------------------------------------------------

/**
 * CreditMitra payload. Adjust field names here to match the partner's real API
 * contract; the point is that every messy-column concern is handled once.
 */
function creditmitraFormatter(row) {
  const { firstName, lastName, fullName } = splitName(row);
  const phone = normalizePhone(pick(row, ['Phone', 'Mobile', 'Mobile Number', 'Phone Number', 'Contact']));
  const dob = formatDate(pick(row, ['Dob', 'DOB', 'Date Of Birth', 'Birth Date']), 'yyyy-MM-dd');
  const pan = normalizePan(pick(row, ['Pan Number', 'PAN', 'Pan', 'Pan No']));
  const salary = digitsOnly(pick(row, ['Salary', 'Monthly Salary', 'Income', 'Monthly Income']));
  const pincode = digitsOnly(pick(row, ['Pincode', 'Pin Code', 'Pin', 'Zip', 'Postal Code']));
  const jobType = cleanString(pick(row, ['Job Type', 'Employment Type', 'Employment', 'Occupation'])) || 'SALARIED';

  return {
    firstName,
    lastName,
    name: fullName,
    mobile: phone,
    dob, // yyyy-MM-dd
    pan,
    monthlyIncome: salary ? Number(salary) : 0,
    pincode,
    employmentType: jobType.toUpperCase(),
  };
}

/** Map a free-text employment value to CreditLinks employmentStatus (1/2). */
function employmentStatusCode(row) {
  const raw = cleanString(pick(row, ['Job Type', 'Employment Type', 'Employment', 'Occupation', 'employmentStatus']));
  if (/^\s*2\s*$/.test(raw)) return 2;
  if (/^\s*1\s*$/.test(raw)) return 1;
  if (/self|business|propriet|sep\b/i.test(raw)) return 2; // self-employed
  return 1; // default: salaried
}

/**
 * CreditLinks Create Lead payload (Partner API v2.13).
 * Mandatory: mobileNumber, firstName, lastName, pan, dob (yyyy-MM-dd), email,
 * pincode, monthlyIncome, consumerConsentDate, consumerConsentIp,
 * employmentStatus. Conditional fields depend on employmentStatus.
 */
function creditlinksFormatter(row) {
  const { firstName, lastName } = splitName(row);
  const mobileNumber = normalizePhone(pick(row, ['Phone', 'Mobile', 'Mobile Number', 'Phone Number', 'Contact', 'mobileNumber']));
  const email = cleanString(pick(row, ['Email', 'Email Id', 'E-mail', 'Email Address', 'email']));
  const dob = formatDate(pick(row, ['Dob', 'DOB', 'Date Of Birth', 'Birth Date']), 'yyyy-MM-dd');
  const pan = normalizePan(pick(row, ['Pan Number', 'PAN', 'Pan', 'Pan No']));
  const pincode = digitsOnly(pick(row, ['Pincode', 'Pin Code', 'Pin', 'Zip', 'Postal Code']));
  const monthlyIncome = digitsOnly(pick(row, ['Salary', 'Monthly Salary', 'Income', 'Monthly Income', 'monthlyIncome']));
  const employmentStatus = employmentStatusCode(row);

  const consentRaw = pick(row, ['Consent Date', 'Consumer Consent Date', 'ConsentDate', 'consumerConsentDate']);
  const consumerConsentDate = consentRaw
    ? formatDateTime(consentRaw)
    : DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss');
  const consumerConsentIp = cleanString(pick(row, ['Consent IP', 'Consumer Consent Ip', 'ConsentIp', 'IP', 'consumerConsentIp']));

  const payload = {
    mobileNumber,
    firstName,
    lastName,
    pan,
    dob,
    email,
    pincode,
    monthlyIncome: monthlyIncome ? Number(monthlyIncome) : 0,
    consumerConsentDate,
    consumerConsentIp, // api layer fills the deployment default when blank
    employmentStatus,
  };

  if (employmentStatus === 1) {
    // Salaried -> employerName + officePincode are required.
    payload.employerName = cleanString(pick(row, ['Employer Name', 'Employer', 'Company', 'Company Name'])) || 'NA';
    payload.officePincode = digitsOnly(pick(row, ['Office Pincode', 'Office Pin', 'Work Pincode'])) || pincode;
  } else {
    // Self-employed -> businessRegistrationType required; default 8 ("No business
    // proof") so the further conditional fields are not demanded for bulk leads.
    const brt = digitsOnly(pick(row, ['Business Registration Type', 'businessRegistrationType']));
    payload.businessRegistrationType = brt ? Number(brt) : 8;
    if (payload.businessRegistrationType !== 8) {
      payload.residenceType = Number(digitsOnly(pick(row, ['Residence Type', 'residenceType']))) || 1;
      payload.businessCurrentTurnover = Number(digitsOnly(pick(row, ['Business Current Turnover', 'Turnover', 'businessCurrentTurnover']))) || 1;
      payload.businessYears = Number(digitsOnly(pick(row, ['Business Years', 'businessYears']))) || 1;
      payload.businessAccount = Number(digitsOnly(pick(row, ['Business Account', 'businessAccount']))) || 2;
    }
  }

  return payload;
}

const FORMATTERS = {
  creditmitra: creditmitraFormatter,
  creditlinks: creditlinksFormatter,
};

export function getFormatter(partner) {
  const fmt = FORMATTERS[String(partner).toLowerCase()];
  if (!fmt) throw new Error(`No lead formatter registered for partner "${partner}"`);
  return fmt;
}

/** Has the row got the minimum identifying fields to be worth sending? */
export function isUsableLead(payload) {
  const mobile = String((payload && (payload.mobile || payload.mobileNumber)) || '');
  return mobile.length >= 10;
}
