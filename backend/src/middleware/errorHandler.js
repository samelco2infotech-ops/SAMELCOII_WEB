const { HTTP_STATUS } = require('../config/constants');
const { errorResponse } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return errorResponse(res, 'File size exceeds maximum limit.', HTTP_STATUS.BAD_REQUEST);
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return errorResponse(res, 'Too many files.', HTTP_STATUS.BAD_REQUEST);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return errorResponse(res, 'Unexpected file field.', HTTP_STATUS.BAD_REQUEST);
  }

  // Database errors
  if (err.code === 'ER_DUP_ENTRY') {
    return errorResponse(res, 'Duplicate entry. This record already exists.', HTTP_STATUS.CONFLICT);
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return errorResponse(res, 'Referenced record not found.', HTTP_STATUS.BAD_REQUEST);
  }

  if (err.sql) {
    console.error('SQL Error:', err.sql);
    return errorResponse(res, 'Database error occurred.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  // Default error
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const message = err.message || 'An unexpected error occurred.';

  return errorResponse(res, message, statusCode);
};

const notFoundHandler = (req, res) => {
  return errorResponse(res, `Route not found: ${req.method} ${req.path}`, HTTP_STATUS.NOT_FOUND);
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
