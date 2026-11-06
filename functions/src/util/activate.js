const { getFirestore } = require('firebase-admin/firestore');

const { invalidRequest, invalidRequestId, invalidVoucher } = require('./constants');

module.exports = async function activateVoucher({ canCreate, client, requestId }) {
  const db = getFirestore();
  const requestRef = db.doc(`voucher-requests/${client}:${requestId}`);

  return db.runTransaction(async (t) => {
    const request = await t.get(requestRef);
    if (!request.exists) throw invalidRequestId;

    const code = request.get('code');
    const ref = db.doc(`voucher/${code}`);
    const voucher = await t.get(ref);
    if (!voucher.exists) throw invalidVoucher;
    if (!canCreate(voucher.get('type'))) throw invalidRequest;

    if (voucher.get('active') !== true) t.update(ref, { active: true, deleteAt: null });
    return { code };
  });
};
