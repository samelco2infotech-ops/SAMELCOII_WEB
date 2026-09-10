const db = require('../config/database');

const getOvertimeRecords = async (usercode, limit = 50) => {
  return db.queryAll(
    `SELECT * FROM overtime_requeststb
     WHERE usercode = ?
     ORDER BY request_date DESC
     LIMIT ?`,
    [usercode, limit]
  );
};

const createOvertimeRequest = async (usercode, hours, reason) => {
  return db.execute(
    `INSERT INTO overtime_requeststb (usercode, hours, reason, status, request_date)
     VALUES (?, ?, ?, 1, NOW())`,
    [usercode, hours, reason]
  );
};

const updateOvertimeStatus = async (id, status) => {
  return db.execute(
    'UPDATE overtime_requeststb SET status = ? WHERE id = ? OR overtime_id = ?',
    [status, id, id]
  );
};

module.exports = {
  getOvertimeRecords,
  createOvertimeRequest,
  updateOvertimeStatus,
};
