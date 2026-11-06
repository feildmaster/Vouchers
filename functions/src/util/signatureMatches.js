const crypto = require('node:crypto');

const hexSignature = require('./hexSignature');

module.exports = function signatureMatches(req, secret) {
  const actual = Buffer.from(String(req.headers.http_x_signature || ''));
  const expected = Buffer.from(hexSignature(req.rawBody, secret));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
