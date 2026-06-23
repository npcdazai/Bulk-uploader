import test from 'node:test';
import assert from 'node:assert/strict';
import { isDuplicate } from '../src/external-api/creditlinks/creditlinks.api.js';

/**
 * CreditLinks dedupe semantics (Partner API v2.13):
 *   success:"true"  + "Eligible"     -> proceed to create  (NOT duplicate)
 *   success:"false" + "Not eligible" -> skip create        (treat as duplicate)
 * `success` arrives as a STRING. Ambiguous bodies must fail open to create.
 */

test('Eligible (success string "true") -> proceed, not duplicate', () => {
  assert.equal(isDuplicate({ success: 'true', message: 'Eligible' }), false);
  assert.equal(isDuplicate({ success: true }), false);
});

test('Not eligible (success string "false") -> duplicate / skip create', () => {
  assert.equal(isDuplicate({ success: 'false', message: 'Not eligible' }), true);
  assert.equal(isDuplicate({ success: false }), true);
});

test('nested data envelope is unwrapped', () => {
  assert.equal(isDuplicate({ data: { success: 'false' } }), true);
  assert.equal(isDuplicate({ data: { success: 'true' } }), false);
});

test('ambiguous / empty responses fail open to create (not duplicate)', () => {
  assert.equal(isDuplicate(null), false);
  assert.equal(isDuplicate(undefined), false);
  assert.equal(isDuplicate({}), false);
  assert.equal(isDuplicate('weird'), false);
});

test('decision wiring: duplicate skips create-lead', () => {
  const decideCreate = (body) => !isDuplicate(body);
  assert.equal(decideCreate({ success: 'false' }), false); // not eligible -> no create
  assert.equal(decideCreate({ success: 'true' }), true); // eligible -> create
});
