const { HttpsError, onCall } = require('firebase-functions/v2/https');

const callableError = require('../util/callableError');
const { invalidRequest } = require('../util/constants');
const { walletSecret } = require('../params');
const redeem = require('../util/redeem');

module.exports = onCall({ secrets: [walletSecret] }, async ({ auth, data }) => {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required');

  const { code, type } = data ?? {};
  if (typeof type !== 'string' || !type) throw new HttpsError('invalid-argument', invalidRequest);

  try {
    return await redeem({ allowedTypes: [type], code, uid: auth.uid });
  } catch (error) {
    throw callableError(error);
  }
});
