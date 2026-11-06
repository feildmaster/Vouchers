const { HttpsError } = require('firebase-functions/v2/https');

const {
  invalidRequest,
  invalidUser,
  invalidVoucher,
} = require('./constants');

const CODES = {
  [invalidRequest]: 'invalid-argument',
  [invalidUser]: 'not-found',
  [invalidVoucher]: 'not-found',
};

module.exports = function callableError(error) {
  if (typeof error !== 'string') return error;
  return new HttpsError(CODES[error] || 'failed-precondition', error);
};
