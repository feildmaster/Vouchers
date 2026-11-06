const functions = require('firebase-functions/v1');

const callableError = require('../util/callableError');
const create = require('../util/create');

module.exports = functions.https.onCall(async (request = {}, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated');
  if (context.auth.token.admin !== true) throw new functions.https.HttpsError('permission-denied');

  const { data, expiresAt, note, type, uses } = request;
  try {
    return await create({ createdBy: context.auth.uid, data, expiresAt, note, type, uses });
  } catch (error) {
    throw callableError(error);
  }
});
