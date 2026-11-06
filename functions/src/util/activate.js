const { getFirestore } = require('firebase-admin/firestore');

const { invalidRequestId, invalidVoucher } = require('./constants');

module.exports = async function activateVoucher({ client, requestId }) {
  const db = getFirestore();
  const requestRef = db.doc(`voucher-requests/${client}:${requestId}`);

  return db.runTransaction(async (t) => {
    const request = await t.get(requestRef);
    if (!request.exists) throw invalidRequestId;

    const code = request.get('code');
    const ref = db.doc(`vouchers/${code}`);
    const voucher = await t.get(ref);
    if (!voucher.exists) throw invalidVoucher;

    if (voucher.get('active') !== true) t.update(ref, { active: true });
    return { code };
  });
};
