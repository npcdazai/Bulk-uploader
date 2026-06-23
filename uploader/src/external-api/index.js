import config from '../config/index.js';
import creditlinks from './creditlinks/creditlinks.api.js';
import creditmitra from './creditmitra/creditmitra.api.js';

/**
 * Partner registry. Resolves the active partner (config.PARTNER) to its uniform
 * API module. To add a partner: build external-api/{partner}/{partner}.api.js
 * exposing { checkDedupe, createLead, getLeadStatus }, then register it here.
 */
const REGISTRY = {
  creditlinks, // CreditLinks Partner API v2.13 (real)
  creditmitra, // HMAC reference/template
};

export function getPartnerApi(partner = config.PARTNER) {
  const api = REGISTRY[String(partner).toLowerCase()];
  if (!api) {
    throw new Error(
      `No partner integration registered for "${partner}". ` +
        `Available: ${Object.keys(REGISTRY).join(', ')}`,
    );
  }
  return api;
}

export default getPartnerApi;
