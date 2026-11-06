const functions = require('firebase-functions/v1');

const callableError = require('../util/callableError');
const revoke = require('../util/revoke');

module.exports = functions.https.onCall(async ({ code } = {}, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated');
  if (context.auth.token.admin !== true) throw new functions.https.HttpsError('permission-denied');

  try {
    return await revoke(code);
  } catch (error) {
    throw callableError(error);
  }
});
