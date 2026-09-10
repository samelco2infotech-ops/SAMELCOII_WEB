const { HTTP_STATUS } = require('../config/constants');

const jsonResponse = (res, statusCode, payload = {}) => {
  return res.status(statusCode).json(payload);
};

const successResponse = (res, data = {}, statusCode = HTTP_STATUS.OK) => {
  return jsonResponse(res, statusCode, {
    ok: true,
    ...data,
  });
};

const errorResponse = (res, message = 'An error occurred', statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, data = {}) => {
  return jsonResponse(res, statusCode, {
    ok: false,
    message,
    ...data,
  });
};

const createdResponse = (res, data = {}) => {
  return successResponse(res, data, HTTP_STATUS.CREATED);
};

const badRequestResponse = (res, message = 'Bad request', data = {}) => {
  return errorResponse(res, message, HTTP_STATUS.BAD_REQUEST, data);
};

const unauthorizedResponse = (res, message = 'Please login first.') => {
  return errorResponse(res, message, HTTP_STATUS.UNAUTHORIZED);
};

const forbiddenResponse = (res, message = 'You do not have permission to perform this action.') => {
  return errorResponse(res, message, HTTP_STATUS.FORBIDDEN);
};

const notFoundResponse = (res, message = 'Resource not found.') => {
  return errorResponse(res, message, HTTP_STATUS.NOT_FOUND);
};

const conflictResponse = (res, message = 'Conflict: resource already exists.', data = {}) => {
  return errorResponse(res, message, HTTP_STATUS.CONFLICT, data);
};

const unprocessableEntityResponse = (res, message = 'Validation error', errors = {}) => {
  return errorResponse(res, message, HTTP_STATUS.UNPROCESSABLE_ENTITY, { errors });
};

module.exports = {
  jsonResponse,
  successResponse,
  errorResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  conflictResponse,
  unprocessableEntityResponse,
};
