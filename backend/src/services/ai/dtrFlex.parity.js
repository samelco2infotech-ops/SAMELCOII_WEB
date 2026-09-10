/**
 * Node-only regression check retained after the PHP runtime was retired.
 * Run: node src/services/ai/dtrFlex.parity.js
 */
const assert = require('assert');
const D = require('./dtrFlex');

assert.equal(D.wantsDtrQuery('show my DTR attendance'), true);
assert.equal(D.wantsDtrQuery('delete all DTR records'), false);
assert.equal(D.dtrStatusFilter('who is late today'), 'late');
assert.equal(D.dtrStatusFilter('show on time employees'), 'ontime');
assert.equal(D.dtrStatusFilter('show absent employees'), 'absent');
assert.equal(D.dtrStatusFilter('show late, absent and present employees'), 'all');
assert.deepEqual(D.extractDtrDates('attendance on 2026-05-09 and 2026-05-18'), ['2026-05-09', '2026-05-18']);
assert.deepEqual(D.extractDtrDates('give me dtr July 20 and 27 year 2026'), ['2026-07-20', '2026-07-27']);
assert.equal(D.classifyAttendanceRow({}), 'ABSENT');
assert.equal(D.classifyAttendanceRow({ morning_in: '8:12', late_min: 12 }), 'LATE');
assert.equal(D.classifyAttendanceRow({ morning_in: '7:55', late_min: 0 }), 'PRESENT');
assert.deepEqual(D.sortAttendanceRows([
  { Date: '2026-07-20', Department: 'ISD', Status: 'PRESENT', Employee: 'C' },
  { Date: '2026-07-20', Department: 'ISD', Status: 'ABSENT', Employee: 'B' },
  { Date: '2026-07-20', Department: 'ISD', Status: 'LATE', Employee: 'A' },
]).map((row) => row.Status), ['LATE', 'ABSENT', 'PRESENT']);
assert.equal(D.ONTIME_CUTOFF, '08:00:00');

console.log('dtrFlex Node regression: PASS');
