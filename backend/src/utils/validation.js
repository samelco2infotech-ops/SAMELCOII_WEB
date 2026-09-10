const sanitize = (input) => {
  if (typeof input === 'string') {
    return input.trim();
  }
  return input;
};

const sanitizeString = (str, maxLength = null) => {
  let result = String(str || '').trim();
  if (maxLength && result.length > maxLength) {
    result = result.substring(0, maxLength);
  }
  return result;
};

const sanitizeEmail = (email) => {
  return String(email || '').toLowerCase().trim();
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(sanitizeEmail(email));
};

const validatePassword = (password, minLength = 6) => {
  return password && String(password).length >= minLength;
};

const validateUsername = (username) => {
  return username && String(username).trim().length >= 3;
};

const toInt = (value, defaultValue = 0) => {
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? defaultValue : num;
};

const toFloat = (value, defaultValue = 0) => {
  const num = parseFloat(value);
  return Number.isNaN(num) ? defaultValue : num;
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  return false;
};

const toDateString = (dateInput) => {
  let date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

const validateDateString = (dateStr) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !Number.isNaN(date.getTime());
};

const isEmptyString = (str) => {
  return !str || String(str).trim() === '';
};

const isEmptyValue = (value) => {
  return value === null || value === undefined || value === '';
};

module.exports = {
  sanitize,
  sanitizeString,
  sanitizeEmail,
  validateEmail,
  validatePassword,
  validateUsername,
  toInt,
  toFloat,
  toBoolean,
  toDateString,
  validateDateString,
  isEmptyString,
  isEmptyValue,
};
