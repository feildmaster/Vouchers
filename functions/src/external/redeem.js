const functions = require('firebase-functions/v1');

const callableError = require('../util/callableError');
const { invalidRequest } = require('../util/constants');
const { walletSecret } = require('../params');
const redeem = require('../util/redeem');

module.exports = functions.runWith({ secrets: [walletSecret] }).https.onCall(async ({ code, type } = {}, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated');
  if (typeof type !== 'string' || !type) throw new functions.https.HttpsError('invalid-argument', invalidRequest);

  try {
    return await redeem({ allowedTypes: [type], code, uid: context.auth.uid });
  } catch (error) {
    throw callableError(error);
  }
});
