const { HttpsError, onCall } = require('firebase-functions/v2/https');

const callableError = require('../util/callableError');
const create = require('../util/create');

module.exports = onCall(async ({ auth, data: request }) => {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required');
  if (auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admins only');

  const { data, expiresAt, note, type, uses } = request ?? {};
  try {
    return await create({ createdBy: auth.uid, data, expiresAt, note, type, uses });
  } catch (error) {
    throw callableError(error);
  }
});
