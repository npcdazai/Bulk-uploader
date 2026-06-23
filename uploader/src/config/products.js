/**
 * Lead products. Each upload targets one product, which decides:
 *   - which lead formatter shapes the payload (utils/formatter.js)
 *   - which partner API method is called (external-api/{partner}.api.js)
 *   - whether a standalone dedupe-check runs first
 *   - which spreadsheet headers are required (config/headers.js)
 *
 * These map onto the CreditLinks Partner API v2.13 products:
 *   personal -> Create Lead API   (POST /api/v2/partner/create-lead)
 *   gold     -> Gold Loans API     (POST /api/v2/partner/gold-loans)
 *   housing  -> Housing Loan API   (POST /api/v2/partner/housing-loan)
 */
export const PRODUCTS = {
  personal: {
    key: 'personal',
    label: 'Personal Loan',
    formatter: 'creditlinksPersonal',
    method: 'createLead',
    dedupe: true, // run the dedupe-check before create-lead
  },
  gold: {
    key: 'gold',
    label: 'Gold Loan',
    formatter: 'creditlinksGold',
    method: 'goldLoans',
    dedupe: false, // the gold-loans endpoint handles existing customers itself
  },
  housing: {
    key: 'housing',
    label: 'Housing Loan',
    formatter: 'creditlinksHousing',
    method: 'housingLoan',
    dedupe: false, // the housing-loan endpoint handles existing customers itself
  },
};

export const DEFAULT_PRODUCT = 'personal';

export const PRODUCT_KEYS = Object.keys(PRODUCTS);

export function getProduct(key) {
  return PRODUCTS[key] || PRODUCTS[DEFAULT_PRODUCT];
}

export function isValidProduct(key) {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, key);
}
