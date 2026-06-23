import test from 'node:test';
import assert from 'node:assert/strict';
import { isDuplicate } from '../src/external-api/creditmitra/creditmitra.api.js';

/**
 * The dedupe decision is safety-critical: a TRUE result must skip create-lead,
 * and an ambiguous/missing result must NOT (so leads are never silently dropped).
 */

test('boolean duplicate flags are detected', () => {
  assert.equal(isDuplicate({ isDuplicate: true }), true);
  assert.equal(isDuplicate({ duplicate: true }), true);
  assert.equal(isDuplicate({ exists: true }), true);
});

test('explicit not-duplicate flags are honoured', () => {
  assert.equal(isDuplicate({ isDuplicate: false }), false);
  assert.equal(isDuplicate({ duplicate: false }), false);
  assert.equal(isDuplicate({ exists: false }), false);
});

test('status-string conventions map correctly', () => {
  assert.equal(isDuplicate({ status: 'DUPLICATE' }), true);
  assert.equal(isDuplicate({ status: 'exists' }), true);
  assert.equal(isDuplicate({ result: 'MATCH' }), true);
  assert.equal(isDuplicate({ status: 'NEW' }), false);
  assert.equal(isDuplicate({ status: 'NOT_FOUND' }), false);
  assert.equal(isDuplicate({ dedupeStatus: 'UNIQUE' }), false);
});

test('nested data envelopes are unwrapped', () => {
  assert.equal(isDuplicate({ data: { isDuplicate: true } }), true);
  assert.equal(isDuplicate({ data: { status: 'NEW' } }), false);
});

test('ambiguous / empty responses default to NOT duplicate (fail-open to create)', () => {
  assert.equal(isDuplicate(null), false);
  assert.equal(isDuplicate(undefined), false);
  assert.equal(isDuplicate({}), false);
  assert.equal(isDuplicate('weird'), false);
  assert.equal(isDuplicate({ status: 'SOMETHING_ELSE' }), false);
});

test('a duplicate lead would skip create-lead (decision wiring)', () => {
  // Mirrors consumer.js: create-lead runs only when dedupe.duplicate is false.
  const decideCreate = (dedupeBody) => !isDuplicate(dedupeBody);
  assert.equal(decideCreate({ isDuplicate: true }), false); // duplicate -> no create
  assert.equal(decideCreate({ isDuplicate: false }), true); // unique -> create
});
