const { getFirestore } = require('firebase-admin/firestore');

const { normalize } = require('./code');
const { invalidVoucher } = require('./constants');

module.exports = async function revokeVoucher(code) {
  const normalized = normalize(code);
  if (!normalized) throw invalidVoucher;

  const db = getFirestore();
  const ref = db.doc(`voucher/${normalized}`);
  await db.runTransaction(async (t) => {
    if (!(await t.get(ref)).exists) throw invalidVoucher;
    t.update(ref, { revoked: true });
  });
  return { code: normalized };
};
