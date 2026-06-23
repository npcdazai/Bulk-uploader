/**
 * Required spreadsheet headers, per product. The upload endpoint validates an
 * incoming file's header row against the chosen product's list and rejects with
 * a 400 + diff on mismatch.
 *
 * Header matching is case-insensitive and whitespace-tolerant (see server.js),
 * and each canonical header accepts the aliases in HEADER_ALIASES. Keep these
 * aligned with what utils/formatter.js knows how to read for each product.
 */
import { DEFAULT_PRODUCT } from './products.js';

export const PRODUCT_REQUIRED_HEADERS = {
  // CreditLinks Create Lead API (personal loan)
  personal: ['Name', 'Phone', 'Email', 'Dob', 'Pan Number', 'Salary', 'Pincode', 'Job Type'],
  // CreditLinks Gold Loans API
  gold: ['Name', 'Phone', 'Email', 'Pan Number', 'Pincode', 'Loan Amount'],
  // CreditLinks Housing Loan API
  housing: ['Name', 'Phone', 'Email', 'Dob', 'Pan Number', 'Salary', 'Pincode', 'Housing Loan Amount', 'Property Type'],
};

export function requiredHeadersFor(product) {
  return PRODUCT_REQUIRED_HEADERS[product] || PRODUCT_REQUIRED_HEADERS[DEFAULT_PRODUCT];
}

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
  'Loan Amount': ['Loan Amount', 'LoanAmount', 'Amount', 'Required Loan Amount'],
  'Housing Loan Amount': ['Housing Loan Amount', 'HousingLoanAmount', 'Loan Amount', 'Amount'],
  'Property Type': ['Property Type', 'PropertyType', 'Property'],
};

export const normalizeHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
