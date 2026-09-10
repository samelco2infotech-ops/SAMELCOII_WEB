/**
 * Purpose: Runnable regression check for the DTR "Manual DTR assignment" sticker diff logic in
 * script.js (ensureDtrCorrectionDialog). Run with `node dtr-sticker-assign.selfcheck.js`.
 * EDIT GUIDE: Keep this in sync with the algorithm inside script.js's submit handler and
 * initialAssignments builder — it's a plain-Node replica (no DOM) of that pure logic, kept
 * separate because the real code lives inside a closure with no module boundary.
 * Tagalog: Hindi ito nag-e-exercise sa totoong DOM; sinusukat lang nito ang parehong resulta ng
 * pag-compute ng "anong DTR field ang babaguhin" gamit ang parehong input data.
 */
const assert = require('assert');

const DTR_EDIT_FIELDS = [
  ['morning_in', 'AM IN'], ['morning_out', 'AM OUT'],
  ['afternoon_in', 'PM IN'], ['afternoon_out', 'PM OUT'],
  ['ot_in', 'OT IN'], ['ot_out', 'OT OUT'],
];

// [FIX] The real bug: `.filter(([_field, index]) => ...)` destructured the display LABEL
// ("AM IN") into `index` instead of the field's real array position, so `rowValues[index]` was
// always undefined and this always returned []. Correct version below uses filter's own index arg.
const sourceFieldsFor = (rowValues, time) => DTR_EDIT_FIELDS
  .filter((_entry, index) => time && String(rowValues[index] || '') === time)
  .map(([field]) => field);

const buildInitialAssignments = (currentRowValues, timeOptions) => {
  const claimedPunchIndexes = new Set();
  const initialAssignments = {};
  DTR_EDIT_FIELDS.forEach(([field], fieldIndex) => {
    const time = String(currentRowValues[fieldIndex] || '');
    if (!time) return;
    const matchIndex = timeOptions.findIndex((option, optionIndex) => option.time === time && !claimedPunchIndexes.has(optionIndex));
    if (matchIndex >= 0) {
      claimedPunchIndexes.add(matchIndex);
      initialAssignments[String(matchIndex)] = field;
    }
  });
  return initialAssignments;
};

const buildMoveChanges = (rowValues, punchTimes, initialAssignments, assignments) => {
  const timeForIndex = (index) => String(punchTimes[Number(index)] || '');
  const changesByField = new Map();
  const changedIndexes = new Set([...Object.keys(initialAssignments), ...Object.keys(assignments)]);
  changedIndexes.forEach((index) => {
    const oldTarget = initialAssignments[index] || '';
    const newTarget = assignments[index] || '';
    if (oldTarget && oldTarget !== newTarget) changesByField.set(oldTarget, '');
  });
  Object.entries(assignments).forEach(([index, target]) => {
    sourceFieldsFor(rowValues, timeForIndex(index)).forEach((field) => {
      if (field !== target) changesByField.set(field, '');
    });
  });
  Object.entries(assignments).forEach(([index, target]) => changesByField.set(target, timeForIndex(index)));
  changedIndexes.forEach((index) => {
    if ((initialAssignments[index] || '') === (assignments[index] || '')) {
      const unchangedTarget = assignments[index] || '';
      if (unchangedTarget) changesByField.delete(unchangedTarget);
    }
  });
  return changesByField;
};

// --- Check 1: the destructuring fix actually matches real fields now.
assert.deepStrictEqual(sourceFieldsFor(['08:02', '12:15', '12:16', '17:09'], '08:02'), ['morning_in']);
assert.deepStrictEqual(sourceFieldsFor(['08:02', '12:15', '12:16', '17:09'], '99:99'), []);

// --- Check 2: duplicate-time punches land on different indexes instead of colliding.
const timeOptions = [{ time: '08:02' }, { time: '08:02' }, { time: '12:15' }, { time: '12:16' }, { time: '17:09' }];
const currentRowValues = ['08:02', '12:15', '12:16', '17:09'];
const initial = buildInitialAssignments(currentRowValues, timeOptions);
assert.strictEqual(initial['0'], 'morning_in', 'first 08:02 punch should claim morning_in');
assert.strictEqual(initial['1'], undefined, 'duplicate 08:02 punch must NOT also claim morning_in');
assert.strictEqual(initial['2'], 'morning_out');
assert.strictEqual(initial['3'], 'afternoon_in');
assert.strictEqual(initial['4'], 'afternoon_out');

// --- Check 3: reassigning to a punch that's already used moves the sticker (no manual unassign
// step needed) rather than being silently blocked.
const punchTimes = timeOptions.map((option) => option.time);
const movedAssignments = { ...initial, '1': 'morning_in' }; // user drags "AM IN" onto the 2nd 08:02 punch
delete movedAssignments['0']; // selectTarget() deletes the old occupant before assigning the new one
const changes = buildMoveChanges(currentRowValues, punchTimes, initial, movedAssignments);
assert.strictEqual(changes.get('morning_in'), '08:02', 'morning_in should now point at the moved punch');

console.log('dtr-sticker-assign.selfcheck: passed');
