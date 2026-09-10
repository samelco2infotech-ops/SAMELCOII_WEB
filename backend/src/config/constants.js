module.exports = {
  // Department Mappings
  DEPARTMENTS: {
    'OGM': 'OFFICE OF THE GENERAL MANAGER',
    'CORPLAN': 'CORPORATE PLANNING DEPARTMENT',
    'FSD': 'FSD FINANCE SERVICES DEPARTMENT',
    'ISD': 'INSTITUTIONAL SERVICES DEPARTMENT',
    'TSD': 'TECHNICAL SERVICES DEPARTMENT',
    'IAD': 'INTERNAL AUDIT DEPARTMENT',
    'ADMIN': 'ADMINISTRATIVE DEPARTMENT',
    'ESD': 'ENGINEERING SERVICES DEPARTMENT',
  },

  // Privilege Levels
  PRIVILEGE: {
    GENERAL_USER: 1,
    SUPERVISOR: 5,
    MANAGER: 6,
    DIRECTOR: 7,
    HEAD_OFFICE: 8,
    ADMIN: 9,
    SUPER_ADMIN: 10,
  },

  // Leave Types
  LEAVE_TYPES: {
    VL: 'Vacation Leave',
    SL: 'Sick Leave',
    OL: 'Other Leave',
    OT: 'Overtime',
  },

  // Travel Status
  TRAVEL_STATUS: {
    PENDING: 1,
    APPROVED: 2,
    REJECTED: 3,
  },

  TRAVEL_STATUS_LABELS: {
    1: 'Pending',
    2: 'Approved',
    3: 'Rejected',
  },

  // Fuel Status
  FUEL_STATUS: {
    PENDING: 2,
    APPROVED: 1,
    REJECTED: 3,
    BALANCE_SEED: 4,
  },

  FUEL_STATUS_LABELS: {
    1: 'Approved',
    2: 'Pending',
    3: 'Rejected',
    4: 'Balance Seed',
  },

  // Punch Types
  PUNCH_TYPES: {
    IN: 'I',
    OUT: 'O',
    UNKNOWN: 'UNK',
  },

  PUNCH_INOUT_MODES: {
    IN: 0,
    OUT: 1,
    OTHER1: 4,
    OTHER2: 5,
  },

  // Time Ranges for DTR
  MORNING_START: 6, // 6 AM
  MORNING_END: 12, // 12 PM
  AFTERNOON_START: 12, // 12 PM
  AFTERNOON_END: 18, // 6 PM
  OT_START: 18, // 6 PM
  OT_END: 24, // 12 AM
  MIN_AFTERNOON_END: 17, // 5 PM minimum for afternoon shift

  // Sequence Patterns
  TRAVEL_NUMBER_PREFIX: 'S2Y',
  EPASS_NUMBER_PREFIX: 'S2Y',
  FUEL_REQUEST_PREFIX: 'FAR',

  // File Upload Constraints
  ALLOWED_IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
  ALLOWED_IMAGE_MIMES: ['image/jpeg', 'image/png', 'image/webp'],

  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    INTERNAL_SERVER_ERROR: 500,
  },
};
