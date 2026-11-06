const functions = require('firebase-functions/v1');

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
  return new functions.https.HttpsError(CODES[error] || 'failed-precondition', error);
};
