import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from './csv';

test('quotes cells and doubles embedded quotes', () => {
  assert.equal(csvCell('Kwame "KK" Mensah'), '"Kwame ""KK"" Mensah"');
});

test('neutralises spreadsheet formulas', () => {
  for (const evil of ['=SUM(A1)', '+1', '-2', '@cmd', '\tx']) {
    assert.ok(csvCell(evil).startsWith(`"'`), `${JSON.stringify(evil)} was not neutralised`);
  }
});

test('null and undefined become empty cells; numbers are kept', () => {
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell(12.5), '"12.5"');
});

test('rows join with CRLF', () => {
  assert.equal(toCsv([['a', 'b'], ['c', 1]]), '"a","b"\r\n"c","1"');
});
