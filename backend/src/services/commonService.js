const { DEPARTMENTS, PRIVILEGE } = require('../config/constants');

const getDepartmentName = (abbreviation) => {
  if (!abbreviation) return abbreviation;
  const abbr = String(abbreviation).toUpperCase().trim();
  return DEPARTMENTS[abbr] || abbreviation;
};

const getPrivilegeName = (level) => {
  const num = parseInt(level, 10);
  const privilegeLevelMap = {
    1: 'General User',
    5: 'Supervisor',
    6: 'Manager',
    7: 'Director',
    8: 'Head Office',
    9: 'Administrator',
    10: 'Super Administrator',
  };
  return privilegeLevelMap[num] || `Level ${num}`;
};

const canManageApprovals = (privilage) => {
  const level = parseInt(privilage, 10);
  return level >= PRIVILEGE.MANAGER && level <= PRIVILEGE.SUPER_ADMIN;
};

const canApproveTravel = (privilage) => {
  const level = parseInt(privilage, 10);
  return level >= 6 && level <= 10;
};

const generateSequenceNumber = (prefix, year, sequence) => {
  const yearSuffix = String(year).slice(2);
  const seqNumber = String(sequence).padStart(5, '0');
  return `${prefix}${yearSuffix}${seqNumber}`;
};

const parseSequenceNumber = (fullNumber) => {
  const match = fullNumber.match(/^([A-Z0-9]+)(\d{2})(\d{5})$/);
  if (!match) return null;

  return {
    prefix: match[1],
    year: 2000 + parseInt(match[2], 10),
    sequence: parseInt(match[3], 10),
  };
};

module.exports = {
  getDepartmentName,
  getPrivilegeName,
  canManageApprovals,
  canApproveTravel,
  generateSequenceNumber,
  parseSequenceNumber,
};
