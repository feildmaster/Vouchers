const { HttpsError, onCall } = require('firebase-functions/v2/https');

const callableError = require('../util/callableError');
const revoke = require('../util/revoke');

module.exports = onCall(async ({ auth, data }) => {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required');
  if (auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admins only');

  try {
    return await revoke(data?.code);
  } catch (error) {
    throw callableError(error);
  }
});
