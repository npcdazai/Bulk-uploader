/**
 * Required spreadsheet headers. The upload endpoint validates an incoming file's
 * header row against this list and rejects with a 400 + diff on mismatch.
 *
 * Header matching is case-insensitive and whitespace-tolerant (see server.js).
 * Keep this list aligned with what utils/formatter.js knows how to read.
 */
export const REQUIRED_HEADERS = [
  'Name',
  'Phone',
  'Email',
  'Dob',
  'Pan Number',
  'Salary',
  'Pincode',
  'Job Type',
];

/**
 * Acceptable aliases per canonical header. The validator passes if, for each
 * required header, the uploaded file contains the canonical name OR any alias.
 */
export const HEADER_ALIASES = {
  Name: ['Name', 'Full Name', 'Customer Name', 'First Name'],
  Phone: ['Phone', 'Mobile', 'Mobile Number', 'Phone Number', 'Contact'],
  Email: ['Email', 'Email Id', 'E-mail', 'Email Address'],
  Dob: ['Dob', 'DOB', 'Date Of Birth', 'Birth Date'],
  'Pan Number': ['Pan Number', 'PAN', 'Pan', 'Pan No', 'PAN Number'],
  Salary: ['Salary', 'Monthly Salary', 'Income', 'Monthly Income'],
  Pincode: ['Pincode', 'Pin Code', 'Pin', 'Zip', 'Postal Code'],
  'Job Type': ['Job Type', 'Employment Type', 'Employment', 'Occupation'],
};

export const normalizeHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
