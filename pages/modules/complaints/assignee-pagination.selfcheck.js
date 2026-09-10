// Self-check for the "Transfer / assign to" list pagination in complaints/index.html
// (ASSIGNEE_PAGE_SIZE, page clamping, slice window). Run: node assignee-pagination.selfcheck.js
const assert = require("assert");

const ASSIGNEE_PAGE_SIZE = 10;

function paginate(rowCount, requestedPage) {
  const pageCount = Math.max(1, Math.ceil(rowCount / ASSIGNEE_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const start = (page - 1) * ASSIGNEE_PAGE_SIZE;
  return { page, pageCount, start, end: start + ASSIGNEE_PAGE_SIZE };
}

// Fewer rows than one page: single page, no pager.
assert.deepStrictEqual(paginate(5, 1), { page: 1, pageCount: 1, start: 0, end: 10 });

// Exactly one page (boundary at 10).
assert.deepStrictEqual(paginate(10, 1), { page: 1, pageCount: 1, start: 0, end: 10 });

// 11 rows -> 2 pages; page 2 starts at row index 10.
assert.deepStrictEqual(paginate(11, 2), { page: 2, pageCount: 2, start: 10, end: 20 });

// Requesting a page beyond the last one clamps down to the last page.
assert.deepStrictEqual(paginate(25, 99), { page: 3, pageCount: 3, start: 20, end: 30 });

// Requesting page 0 (or negative) clamps up to page 1.
assert.deepStrictEqual(paginate(25, 0), { page: 1, pageCount: 3, start: 0, end: 10 });

console.log("assignee-pagination.selfcheck: OK");
