/* Domain rules shared by the browser app and backend integration tests.
 * The scanner must never interpret decoded contents as HTML or execute them. */
(function (root) {
  'use strict';

  const MAX_VALUE_LENGTH = 16384;
  const MAX_RECORDS_IMPORT = 20000;
  const VALID_SOURCES = new Set(['camera', 'scanner_hid', 'manual', 'importado']);
  const VALID_MOVEMENTS = new Set(['entrada', 'saida']);

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 160 &&
      typeof value.scanned_at === 'string' && value.scanned_at.length <= 64 &&
      !Number.isNaN(Date.parse(value.scanned_at)) &&
      typeof value.value === 'string' && value.value.length > 0 &&
      value.value.length <= MAX_VALUE_LENGTH &&
      typeof value.format === 'string' && value.format.length > 0 && value.format.length <= 64 &&
      VALID_SOURCES.has(value.source) &&
      (value.movement == null || VALID_MOVEMENTS.has(value.movement));
  }

  function mergeRecords(existing, incoming) {
    if (!Array.isArray(existing) || !Array.isArray(incoming)) {
      throw new TypeError('Os registos devem ser listas.');
    }
    if (incoming.length > MAX_RECORDS_IMPORT) {
      throw new RangeError('O ficheiro contém demasiados registos.');
    }
    const combined = [...existing];
    const seen = new Set();
    for (const record of existing) {
      if (!isRecord(record)) throw new TypeError('Histórico local inválido.');
      seen.add(record.id);
    }
    let inserted = 0;
    for (const record of incoming) {
      if (!isRecord(record)) throw new TypeError('Registo importado inválido.');
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      combined.push(record);
      inserted++;
    }
    return { records: combined, inserted };
  }

  function recentRecords(records, limit = 10) {
    if (!Array.isArray(records)) throw new TypeError('Histórico inválido.');
    const n = Number.isSafeInteger(limit) ? Math.max(0, Math.min(limit, 100)) : 10;
    return records.map((record, index) => ({ record, index }))
      .sort((a, b) => (Date.parse(b.record.scanned_at) - Date.parse(a.record.scanned_at)) ||
        (b.index - a.index))
      .slice(0, n)
      .map(item => item.record);
  }

  function parseJsonLines(input) {
    if (typeof input !== 'string') throw new TypeError('Ficheiro inválido.');
    const lines = input.split(/\r?\n/).filter(line => line.trim());
    if (lines.length > MAX_RECORDS_IMPORT) throw new RangeError('O ficheiro excede o limite de registos.');
    return lines.map((line, index) => {
      let record;
      try { record = JSON.parse(line); }
      catch (error) { throw new SyntaxError('JSON inválido na linha ' + (index + 1)); }
      if (!isRecord(record)) throw new TypeError('Registo inválido na linha ' + (index + 1));
      return record;
    });
  }

  const api = Object.freeze({ isRecord, mergeRecords, recentRecords, parseJsonLines,
    MAX_VALUE_LENGTH, MAX_RECORDS_IMPORT });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ScanDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
