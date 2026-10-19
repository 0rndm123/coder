'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../assets/scan-domain.js');

function record(overrides = {}) {
  return {
    id: 'd92a0000-1000-4000-8000-000000000001',
    scanned_at: '2026-10-19T18:00:00.000Z',
    format: 'QR_CODE',
    value: '0012345',
    source: 'camera',
    movement: 'entrada',
    ...overrides
  };
}

test('preserves barcode leading zeros and QR content without executing markup', () => {
  assert.equal(domain.isRecord(record()), true);
  const dangerous = record({ value: '<img src=x onerror=alert(1)>' });
  assert.equal(domain.isRecord(dangerous), true);
  assert.equal(domain.parseJsonLines(JSON.stringify(dangerous))[0].value, dangerous.value);
  assert.equal(domain.parseJsonLines(JSON.stringify(record()))[0].value, '0012345');
});

test('rejects empty, oversized, malformed and invalid records', () => {
  assert.equal(domain.isRecord(record({ value: '' })), false);
  assert.equal(domain.isRecord(record({ value: 'x'.repeat(domain.MAX_VALUE_LENGTH + 1) })), false);
  assert.equal(domain.isRecord(record({ source: 'unknown' })), false);
  assert.equal(domain.isRecord(record({ movement: 'apagar' })), false);
  assert.equal(domain.isRecord(record({ scanned_at: 'invalid-date' })), false);
  assert.equal(domain.isRecord(record({ id: '' })), false);
});

test('accepts historical records without a movement', () => {
  const old = record();
  delete old.movement;
  assert.equal(domain.isRecord(old), true);
});

test('merge is idempotent by scan id, not code value', () => {
  const old = record();
  const sameBarcodeNewEvent = record({ id:'new-scan', movement:'saida' });
  const result = domain.mergeRecords([old], [old, sameBarcodeNewEvent, sameBarcodeNewEvent]);
  assert.equal(result.inserted, 1);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[1].value, old.value);
});

test('import rejects malformed JSON and invalid imported records', () => {
  assert.throws(() => domain.parseJsonLines('{invalid}'), SyntaxError);
  assert.throws(() => domain.parseJsonLines(JSON.stringify(record({ movement:'delete' }))), TypeError);
  assert.throws(() => domain.parseJsonLines('[]'), TypeError);
});

test('recent records are ordered newest-first, regardless of import order', () => {
  const older = record({ id:'older', scanned_at:'2026-10-18T10:00:00.000Z' });
  const newer = record({ id:'newer', scanned_at:'2026-10-19T10:00:00.000Z' });
  assert.deepEqual(domain.recentRecords([newer, older], 1).map(r => r.id), ['newer']);
  assert.deepEqual(domain.recentRecords([newer, older], 2).map(r => r.id), ['newer','older']);
});

test('rejects large imports before merging records', () => {
  const excessive = Array(domain.MAX_RECORDS_IMPORT + 1).fill('{}').join('\n');
  assert.throws(() => domain.parseJsonLines(excessive), RangeError);
});

test('does not mutate input arrays on merge', () => {
  const list = [record()];
  const imported = [record({ id:'second' })];
  const merged = domain.mergeRecords(list, imported);
  assert.equal(list.length, 1);
  assert.equal(imported.length, 1);
  assert.equal(merged.records.length, 2);
});
